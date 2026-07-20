import { Body, ConflictException, Controller, ForbiddenException, Get, HttpException, HttpStatus, Injectable, NotFoundException, Param, Post, Req, Res, UnauthorizedException } from '@nestjs/common'
import { hash, verify } from '@node-rs/argon2'
import { randomBytes } from 'node:crypto'
import type { Response } from 'express'
import { DatabaseService } from '../database/database.service.js'
import { AppRequest, Public, parse, sessionHash } from '../common/http.js'
import { loginSchema, registerSchema, setupPasswordSchema } from '../common/contracts.js'
import { authConfig } from '../common/auth-config.js'

@Injectable()
export class AuthService {
  private readonly attempts = new Map<string, { count: number; reset: number }>()
  constructor(private readonly db: DatabaseService) {}

  private limit(key: string, maximum: number) {
    const now = Date.now(), item = this.attempts.get(key)
    if (this.attempts.size > 10_000) for (const [attemptKey, attempt] of this.attempts) if (attempt.reset < now) this.attempts.delete(attemptKey)
    if (!item || item.reset < now) { this.attempts.set(key, { count: 1, reset: now + 60_000 }); return }
    item.count += 1
    if (item.count > maximum) throw new HttpException({ code: 'LOGIN_RATE_LIMIT', message: '尝试次数过多，请稍后再试' }, HttpStatus.TOO_MANY_REQUESTS)
  }
  async registrationConfig() {
    const config = authConfig()
    const [summary] = await this.db.client<{ count: number }[]>`SELECT count(*)::int AS count FROM users`
    return { ...config, bootstrapAvailable: Number(summary?.count) === 0 }
  }
  async register(input: ReturnType<typeof registerSchema.parse>) {
    const passwordHash = await hash(input.password, { algorithm: 2 })
    const slug = `${input.workspaceName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').slice(0, 32)}-${randomBytes(3).toString('hex')}`
    const { registrationMode } = authConfig()
    try { return await this.db.client.begin(async (sql) => {
      if (registrationMode !== 'open') {
        await sql`SELECT pg_advisory_xact_lock(hashtext('task-harbor-auth-bootstrap'))`
        const [summary] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM users`
        if (Number(summary?.count) > 0) throw new ForbiddenException({ code: 'REGISTRATION_CLOSED', message: '当前实例已关闭开放注册，请通过邀请或管理员开通账号' })
      }
      const [user] = await sql<{ id: string; email: string; name: string }[]>`INSERT INTO users(email,name,password_hash) VALUES(${input.email.toLowerCase()},${input.name},${passwordHash}) RETURNING id,email,name`
      if (!user) throw new Error('user insert failed')
      const [workspace] = await sql<{ id: string; name: string; slug: string }[]>`INSERT INTO workspaces(name,slug,created_by) VALUES(${input.workspaceName},${slug},${user.id}) RETURNING id,name,slug`
      if (!workspace) throw new Error('workspace insert failed')
      await sql`INSERT INTO memberships(workspace_id,user_id,role) VALUES(${workspace.id},${user.id},'OWNER')`
      const [project] = await sql<{id:string}[]>`INSERT INTO projects(workspace_id,name,code,description,color,lead_id) VALUES(${workspace.id},'第一个项目','TEAM','从这里开始团队协作','#2367d1',${user.id}) RETURNING id`
      for (const [index,item] of [['待处理','#84908b'],['进行中','#2367d1'],['待验收','#d5792a'],['已完成','#27825a']].entries()) await sql`INSERT INTO board_columns(workspace_id,project_id,name,color,position) VALUES(${workspace.id},${project!.id},${item![0]!},${item![1]!},${(index+1)*1000})`
      return { user, workspace }
    }) } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === '23505' && 'constraint_name' in error && error.constraint_name === 'users_email_key') throw new ConflictException({ code: 'EMAIL_EXISTS', message: '该邮箱已注册，请直接登录' })
      throw error
    }
  }
  async login(email: string, password: string, ip: string) {
    const attemptKey = `${ip}:${email.toLowerCase()}`
    const addressKey = `ip:${ip}`
    this.limit(attemptKey, 10)
    this.limit(addressKey, 30)
    const [user] = await this.db.client<{ id: string; email: string; name: string; password_hash: string | null; must_set_password: boolean }[]>`SELECT id,email,name,password_hash,must_set_password FROM users WHERE email=${email.toLowerCase()} AND disabled_at IS NULL`
    if (!user || !user.password_hash || user.must_set_password) throw new UnauthorizedException({ code: user && user.must_set_password ? 'SETUP_REQUIRED' : 'INVALID_CREDENTIALS', message: user?.must_set_password ? '账号尚未设置密码，请使用管理员发送的设置链接' : '邮箱或密码错误' })
    if (!(await verify(user.password_hash, password))) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: '邮箱或密码错误' })
    const token = randomBytes(32).toString('base64url'), csrfToken = randomBytes(36).toString('base64url')
    await this.db.client`INSERT INTO sessions(id,user_id,csrf_token,expires_at) VALUES(${sessionHash(token)},${user.id},${csrfToken},now()+interval '30 days')`
    this.attempts.delete(attemptKey)
    this.attempts.delete(addressKey)
    return { token, csrfToken, user: { id: user.id, email: user.email, name: user.name } }
  }
  async previewSetup(token: string) {
    const [row] = await this.db.client<{ email: string; name: string; expiresAt: string; usedAt: string | null }[]>`SELECT u.email,u.name,t.expires_at AS "expiresAt",t.used_at AS "usedAt" FROM user_setup_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=${sessionHash(token)}`
    if (!row) throw new NotFoundException({ code: 'SETUP_NOT_FOUND', message: '设置链接无效或已失效' })
    const expired = new Date(row.expiresAt) < new Date()
    return { email: row.email, name: row.name, expired, used: Boolean(row.usedAt), usable: !row.usedAt && !expired }
  }
  async completeSetup(token: string, password: string, ip: string) {
    const preview = await this.previewSetup(token)
    if (preview.used) throw new ConflictException({ code: 'SETUP_USED', message: '设置链接已被使用' })
    if (preview.expired) throw new ForbiddenException({ code: 'SETUP_EXPIRED', message: '设置链接已过期' })
    const passwordHash = await hash(password, { algorithm: 2 })
    const email = await this.db.client.begin(async (sql) => {
      const [row] = await sql<{ id: string; userId: string; email: string; expiresAt: string; usedAt: string | null }[]>`SELECT t.id,t.user_id AS "userId",u.email,t.expires_at AS "expiresAt",t.used_at AS "usedAt" FROM user_setup_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=${sessionHash(token)} FOR UPDATE OF t`
      if (!row) throw new NotFoundException({ code: 'SETUP_NOT_FOUND', message: '设置链接无效或已失效' })
      if (row.usedAt) throw new ConflictException({ code: 'SETUP_USED', message: '设置链接已被使用' })
      if (new Date(row.expiresAt) < new Date()) throw new ForbiddenException({ code: 'SETUP_EXPIRED', message: '设置链接已过期' })
      await sql`UPDATE users SET password_hash=${passwordHash},must_set_password=false,updated_at=now() WHERE id=${row.userId}`
      await sql`UPDATE user_setup_tokens SET used_at=now() WHERE id=${row.id}`
      return row.email
    })
    return this.login(email, password, ip)
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly db: DatabaseService) {}
  @Public() @Get('config') config() { return this.auth.registrationConfig() }
  @Public() @Get('setup/:token') setupPreview(@Param('token') token: string) { return this.auth.previewSetup(token) }
  @Public() @Post('setup') async setup(@Body() body: unknown, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const input = parse(setupPasswordSchema, body)
    const result = await this.auth.completeSetup(input.token, input.password, req.ip ?? 'unknown')
    res.cookie('session', result.token, { httpOnly: true, secure: process.env.APP_ORIGIN?.startsWith('https://') ?? false, sameSite: 'lax', maxAge: 30 * 86400_000, path: '/' })
    return { user: result.user, csrfToken: result.csrfToken }
  }
  @Public() @Post('register') async register(@Body() body: unknown) { return this.auth.register(parse(registerSchema, body)) }
  @Public() @Post('login') async login(@Body() body: unknown, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) { const input = parse(loginSchema, body); const result = await this.auth.login(input.email, input.password, req.ip ?? 'unknown'); res.cookie('session', result.token, { httpOnly: true, secure: process.env.APP_ORIGIN?.startsWith('https://') ?? false, sameSite: 'lax', maxAge: 30 * 86400_000, path: '/' }); return { user: result.user, csrfToken: result.csrfToken } }
  @Get('me') me(@Req() req: AppRequest) { return { user: req.user, csrfToken: req.user!.csrfToken } }
  @Post('logout') async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) { const token = req.cookies?.session as string; await this.db.client`DELETE FROM sessions WHERE id=${sessionHash(token)}`; res.clearCookie('session', { path: '/' }); return { ok: true } }
  @Post('password') async password(@Req() req: AppRequest, @Body() body: unknown) { const input = loginSchema.pick({ password: true }).extend({ newPassword: registerSchema.shape.password }).parse(body); const [row] = await this.db.client<{ password_hash: string }[]>`SELECT password_hash FROM users WHERE id=${req.user!.id}`; if (!row || !(await verify(row.password_hash,input.password))) throw new UnauthorizedException({ code: 'INVALID_PASSWORD', message: '当前密码错误' }); await this.db.client`UPDATE users SET password_hash=${await hash(input.newPassword,{algorithm:2})},updated_at=now() WHERE id=${req.user!.id}`; return { ok: true } }
}
