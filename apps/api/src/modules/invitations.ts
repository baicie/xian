import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common'
import { hash } from '@node-rs/argon2'
import { randomBytes } from 'node:crypto'
import type { Response } from 'express'
import { DatabaseService } from '../database/database.service.js'
import { authConfig } from '../common/auth-config.js'
import { acceptInviteSchema, registerInviteSchema } from '../common/contracts.js'
import { AppRequest, Public, parse, sessionHash } from '../common/http.js'
import { can, Role } from '../common/policy.js'
import { AuthService } from './auth.js'

const INVITE_TTL_DAYS = 7
const SETUP_TTL_DAYS = 7
const inviteUrl = (token: string) =>
  `${process.env.APP_ORIGIN ?? 'http://localhost:5173'}/invite/${token}`
const setupUrl = (token: string) =>
  `${process.env.APP_ORIGIN ?? 'http://localhost:5173'}/setup/${token}`

type InviteRow = {
  id: string
  workspaceId: string
  workspaceName: string
  email: string
  role: Role
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
}

@Injectable()
export class InvitationService {
  constructor(private readonly db: DatabaseService) {}

  private async assertCanManageMembers(workspaceId: string, actorId: string) {
    const [membership] = await this.db.client<
      { role: Role }[]
    >`SELECT role::text AS role FROM memberships WHERE workspace_id=${workspaceId} AND user_id=${actorId} AND disabled_at IS NULL`
    if (!membership)
      throw new NotFoundException({ code: 'WORKSPACE_NOT_FOUND', message: '工作区不存在' })
    if (!can(membership.role, 'member.manage'))
      throw new ForbiddenException({ code: 'FORBIDDEN', message: '没有此操作权限' })
  }

  private async audit(
    workspaceId: string,
    actorId: string,
    action: string,
    entityId: string,
    requestId: string,
    after: Record<string, unknown>,
  ) {
    await this.db
      .client`INSERT INTO audit_logs(workspace_id,actor_id,action,entity_type,entity_id,request_id,after_data) VALUES(${workspaceId},${actorId},${action},'invitation',${entityId},${requestId},${JSON.stringify(after)}::jsonb)`
  }

  private async loadInvite(token: string) {
    const [row] = await this.db.client<
      InviteRow[]
    >`SELECT i.id,i.workspace_id AS "workspaceId",w.name AS "workspaceName",i.email,i.role::text AS role,i.expires_at AS "expiresAt",i.accepted_at AS "acceptedAt",i.revoked_at AS "revokedAt" FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id WHERE i.token_hash=${sessionHash(token)}`
    if (!row) throw new NotFoundException({ code: 'INVITE_NOT_FOUND', message: '邀请无效或已失效' })
    return row
  }

  private assertInviteActive(row: InviteRow) {
    if (row.revokedAt)
      throw new BadRequestException({ code: 'INVITE_REVOKED', message: '邀请已被撤销' })
    if (row.acceptedAt)
      throw new BadRequestException({ code: 'INVITE_USED', message: '邀请已被使用' })
    if (new Date(row.expiresAt) < new Date())
      throw new BadRequestException({ code: 'INVITE_EXPIRED', message: '邀请已过期' })
  }

  async preview(token: string) {
    const row = await this.loadInvite(token)
    const expired = new Date(row.expiresAt) < new Date()
    return {
      workspaceName: row.workspaceName,
      email: row.email,
      role: row.role,
      expired,
      revoked: Boolean(row.revokedAt),
      accepted: Boolean(row.acceptedAt),
      usable: !row.revokedAt && !row.acceptedAt && !expired,
    }
  }

  async inviteOrAdd(
    workspaceId: string,
    actorId: string,
    email: string,
    role: Role,
    requestId: string,
  ) {
    await this.assertCanManageMembers(workspaceId, actorId)
    const normalized = email.toLowerCase()
    const token = randomBytes(32).toString('base64url')
    return this.db.client.begin(async (sql) => {
      await sql`SELECT pg_advisory_xact_lock(hashtext(${`task-harbor-invite:${workspaceId}:${normalized}`}))`
      const [existing] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email=${normalized}`
      if (existing) {
        const [member] =
          await sql`SELECT 1 FROM memberships WHERE workspace_id=${workspaceId} AND user_id=${existing.id} AND disabled_at IS NULL`
        if (member)
          throw new ConflictException({ code: 'ALREADY_MEMBER', message: '该用户已是工作区成员' })
        await sql`INSERT INTO memberships(workspace_id,user_id,role) VALUES(${workspaceId},${existing.id},${role}) ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=${role},disabled_at=NULL`
        await sql`INSERT INTO audit_logs(workspace_id,actor_id,action,entity_type,entity_id,request_id,after_data) VALUES(${workspaceId},${actorId},'member.added','user',${existing.id},${requestId},${JSON.stringify({ email: normalized, role })}::jsonb)`
        return { ok: true, added: true }
      }
      await sql`UPDATE workspace_invitations SET revoked_at=now() WHERE workspace_id=${workspaceId} AND lower(email)=${normalized} AND accepted_at IS NULL AND revoked_at IS NULL`
      const [invitation] = await sql<
        { id: string; email: string; role: Role; expiresAt: string }[]
      >`INSERT INTO workspace_invitations(workspace_id,email,role,token_hash,invited_by,expires_at) VALUES(${workspaceId},${normalized},${role},${sessionHash(token)},${actorId},now()+${INVITE_TTL_DAYS}*interval '1 day') RETURNING id,email,role::text AS role,expires_at AS "expiresAt"`
      if (!invitation) throw new Error('invitation insert failed')
      await sql`INSERT INTO audit_logs(workspace_id,actor_id,action,entity_type,entity_id,request_id,after_data) VALUES(${workspaceId},${actorId},'invitation.created','invitation',${invitation.id},${requestId},${JSON.stringify({ email: normalized, role })}::jsonb)`
      return {
        ok: true,
        invited: true,
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
          inviteUrl: inviteUrl(token),
        },
      }
    })
  }

  async registerWithInvite(token: string, name: string, password: string) {
    const row = await this.loadInvite(token)
    this.assertInviteActive(row)
    const passwordHash = await hash(password, { algorithm: 2 })
    try {
      return await this.db.client.begin(async (sql) => {
        const [lockedRow] = await sql<
          InviteRow[]
        >`SELECT i.id,i.workspace_id AS "workspaceId",w.name AS "workspaceName",i.email,i.role::text AS role,i.expires_at AS "expiresAt",i.accepted_at AS "acceptedAt",i.revoked_at AS "revokedAt" FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id WHERE i.token_hash=${sessionHash(token)} FOR UPDATE OF i`
        if (!lockedRow)
          throw new NotFoundException({ code: 'INVITE_NOT_FOUND', message: '邀请无效或已失效' })
        this.assertInviteActive(lockedRow)
        const [user] = await sql<
          { id: string; email: string; name: string }[]
        >`INSERT INTO users(email,name,password_hash) VALUES(${lockedRow.email},${name},${passwordHash}) RETURNING id,email,name`
        await sql`INSERT INTO memberships(workspace_id,user_id,role) VALUES(${lockedRow.workspaceId},${user!.id},${lockedRow.role})`
        await sql`UPDATE workspace_invitations SET accepted_at=now() WHERE id=${lockedRow.id}`
        await sql`INSERT INTO audit_logs(workspace_id,actor_id,action,entity_type,entity_id,request_id,after_data) VALUES(${lockedRow.workspaceId},${user!.id},'invitation.accepted','invitation',${lockedRow.id},'invite-register',${JSON.stringify({ email: lockedRow.email, role: lockedRow.role })}::jsonb)`
        return { user, workspace: { id: lockedRow.workspaceId, name: lockedRow.workspaceName } }
      })
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === '23505')
        throw new ConflictException({
          code: 'EMAIL_EXISTS',
          message: '该邮箱已注册，请登录后接受邀请',
        })
      throw error
    }
  }

  async acceptInvite(token: string, userId: string, email: string) {
    return this.db.client.begin(async (sql) => {
      const [row] = await sql<
        InviteRow[]
      >`SELECT i.id,i.workspace_id AS "workspaceId",w.name AS "workspaceName",i.email,i.role::text AS role,i.expires_at AS "expiresAt",i.accepted_at AS "acceptedAt",i.revoked_at AS "revokedAt" FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id WHERE i.token_hash=${sessionHash(token)} FOR UPDATE OF i`
      if (!row)
        throw new NotFoundException({ code: 'INVITE_NOT_FOUND', message: '邀请无效或已失效' })
      this.assertInviteActive(row)
      if (email.toLowerCase() !== row.email.toLowerCase())
        throw new BadRequestException({
          code: 'INVITE_EMAIL_MISMATCH',
          message: '当前登录账号与邀请邮箱不一致',
        })
      const [member] =
        await sql`SELECT 1 FROM memberships WHERE workspace_id=${row.workspaceId} AND user_id=${userId} AND disabled_at IS NULL`
      if (member)
        throw new ConflictException({ code: 'ALREADY_MEMBER', message: '你已是该工作区成员' })
      await sql`INSERT INTO memberships(workspace_id,user_id,role) VALUES(${row.workspaceId},${userId},${row.role}) ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=${row.role},disabled_at=NULL`
      await sql`UPDATE workspace_invitations SET accepted_at=now() WHERE id=${row.id}`
      await sql`INSERT INTO audit_logs(workspace_id,actor_id,action,entity_type,entity_id,request_id,after_data) VALUES(${row.workspaceId},${userId},'invitation.accepted','invitation',${row.id},'invite-accept',${JSON.stringify({ email: row.email, role: row.role })}::jsonb)`
      return { ok: true, workspace: { id: row.workspaceId, name: row.workspaceName } }
    })
  }

  async list(workspaceId: string, actorId: string) {
    await this.assertCanManageMembers(workspaceId, actorId)
    return this.db.client<
      {
        id: string
        email: string
        role: Role
        status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED'
        expiresAt: string
        acceptedAt: string | null
        revokedAt: string | null
        createdAt: string
      }[]
    >`SELECT id,email,role::text AS role,CASE WHEN accepted_at IS NOT NULL THEN 'ACCEPTED' WHEN revoked_at IS NOT NULL THEN 'REVOKED' WHEN expires_at<now() THEN 'EXPIRED' ELSE 'PENDING' END AS status,expires_at AS "expiresAt",accepted_at AS "acceptedAt",revoked_at AS "revokedAt",created_at AS "createdAt" FROM workspace_invitations WHERE workspace_id=${workspaceId} ORDER BY created_at DESC LIMIT 100`
  }

  async revoke(workspaceId: string, actorId: string, invitationId: string, requestId: string) {
    await this.assertCanManageMembers(workspaceId, actorId)
    const [updated] = await this.db.client<
      { id: string; email: string }[]
    >`UPDATE workspace_invitations SET revoked_at=now() WHERE id=${invitationId} AND workspace_id=${workspaceId} AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id,email`
    if (!updated)
      throw new NotFoundException({ code: 'INVITE_NOT_FOUND', message: '邀请不存在或已处理' })
    await this.audit(workspaceId, actorId, 'invitation.revoked', updated.id, requestId, {
      email: updated.email,
    })
    return { ok: true }
  }

  async provision(
    workspaceId: string,
    actorId: string,
    email: string,
    name: string,
    role: Role,
    requestId: string,
  ) {
    await this.assertCanManageMembers(workspaceId, actorId)
    const { registrationMode } = authConfig()
    if (registrationMode === 'open')
      throw new BadRequestException({
        code: 'PROVISION_NOT_NEEDED',
        message: '开放注册模式下请使用邀请链接',
      })
    const normalized = email.toLowerCase()
    const token = randomBytes(32).toString('base64url')
    return this.db.client.begin(async (sql) => {
      await sql`SELECT pg_advisory_xact_lock(hashtext(${`task-harbor-provision:${normalized}`}))`
      const [existing] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email=${normalized}`
      if (existing) {
        const [member] =
          await sql`SELECT 1 FROM memberships WHERE workspace_id=${workspaceId} AND user_id=${existing.id} AND disabled_at IS NULL`
        if (member)
          throw new ConflictException({ code: 'ALREADY_MEMBER', message: '该用户已是工作区成员' })
        await sql`INSERT INTO memberships(workspace_id,user_id,role) VALUES(${workspaceId},${existing.id},${role}) ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=${role},disabled_at=NULL`
        await sql`INSERT INTO audit_logs(workspace_id,actor_id,action,entity_type,entity_id,request_id,after_data) VALUES(${workspaceId},${actorId},'member.added','user',${existing.id},${requestId},${JSON.stringify({ email: normalized, role, provisioned: false })}::jsonb)`
        return { ok: true, added: true }
      }
      const [user] = await sql<
        { id: string; email: string; name: string }[]
      >`INSERT INTO users(email,name,password_hash,must_set_password) VALUES(${normalized},${name},NULL,true) RETURNING id,email,name`
      if (!user) throw new Error('provisioned user insert failed')
      await sql`INSERT INTO memberships(workspace_id,user_id,role) VALUES(${workspaceId},${user!.id},${role})`
      await sql`INSERT INTO user_setup_tokens(user_id,token_hash,expires_at,created_by) VALUES(${user!.id},${sessionHash(token)},now()+${SETUP_TTL_DAYS}*interval '1 day',${actorId})`
      await sql`INSERT INTO audit_logs(workspace_id,actor_id,action,entity_type,entity_id,request_id,after_data) VALUES(${workspaceId},${actorId},'user.provisioned','user',${user!.id},${requestId},${JSON.stringify({ email: normalized, name, role })}::jsonb)`
      return {
        ok: true,
        provisioned: true,
        user: { id: user!.id, email: user!.email, name: user!.name, role },
        setupUrl: setupUrl(token),
      }
    })
  }
}

@Controller()
export class InvitationController {
  constructor(
    private readonly invitations: InvitationService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Get('invites/:token')
  preview(@Param('token') token: string) {
    return this.invitations.preview(token)
  }

  @Public()
  @Post('auth/register/invite')
  async registerInvite(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parse(registerInviteSchema, body)
    const result = await this.invitations.registerWithInvite(
      input.token,
      input.name,
      input.password,
    )
    if (!result.user) throw new Error('invited user insert failed')
    const login = await this.auth.login(result.user.email, input.password, 'invite')
    res.cookie('session', login.token, {
      httpOnly: true,
      secure: process.env.APP_ORIGIN?.startsWith('https://') ?? false,
      sameSite: 'lax',
      maxAge: 30 * 86400_000,
      path: '/',
    })
    return { user: login.user, csrfToken: login.csrfToken, workspace: result.workspace }
  }

  @Post('auth/accept-invite')
  accept(@Req() req: AppRequest, @Body() body: unknown) {
    const input = parse(acceptInviteSchema, body)
    return this.invitations.acceptInvite(input.token, req.user!.id, req.user!.email)
  }
}
