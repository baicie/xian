import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { createHash, randomUUID } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import type { ZodType } from 'zod'
import { DatabaseService } from '../database/database.service.js'

export type AuthUser = { id: string; email: string; name: string; csrfToken: string }
export type AppRequest = Request & { user?: AuthUser; requestId: string }
export const Public = () => SetMetadata('public', true)
export const sessionHash = (token: string) => createHash('sha256').update(token).digest('hex')
export const requestContext = (req: AppRequest, res: Response, next: NextFunction) => {
  req.requestId = String(req.headers['x-request-id'] || randomUUID())
  res.setHeader('x-request-id', req.requestId)
  next()
}
export const requestLogger = (req: AppRequest, res: Response, next: NextFunction) => {
  const startedAt = process.hrtime.bigint()
  res.on('finish', () => {
    if (req.path.endsWith('/health/live')) return
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    process.stdout.write(
      `${JSON.stringify({ level: res.statusCode >= 500 ? 'error' : 'info', type: 'http_request', requestId: req.requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(durationMs * 10) / 10, userId: req.user?.id ?? null })}\n`,
    )
  })
  next()
}
export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success)
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: '请求参数无效',
      details: result.error.flatten(),
    })
  return result.data
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly db: DatabaseService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true
    const req = context.switchToHttp().getRequest<AppRequest>()
    const token = req.cookies?.session as string | undefined
    if (!token) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: '请先登录' })
    const rows = await this.db.client<
      { id: string; email: string; name: string; csrf_token: string }[]
    >`
      SELECT u.id,u.email,u.name,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.id=${sessionHash(token)} AND s.expires_at>now() AND u.disabled_at IS NULL`
    const user = rows[0]
    if (!user) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: '登录已过期' })
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers['x-csrf-token'] !== user.csrf_token
    )
      throw new UnauthorizedException({ code: 'CSRF_INVALID', message: '安全令牌无效' })
    req.user = { id: user.id, email: user.email, name: user.name, csrfToken: user.csrf_token }
    return true
  }
}
