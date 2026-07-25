import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { Response } from 'express'
import type { AppRequest } from './http.js'

const databaseUnavailableCodes = new Set([
  '57P01',
  '57P02',
  '57P03',
  '53100',
  '53300',
  'CONNECTION_CLOSED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
])

export function isDatabaseUnavailable(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    databaseUnavailableCodes.has(error.code)
  )
}

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorFilter.name)

  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>()
    const request = host.switchToHttp().getRequest<AppRequest>()
    const databaseUnavailable = !(error instanceof HttpException) && isDatabaseUnavailable(error)
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : databaseUnavailable
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.INTERNAL_SERVER_ERROR
    const payload =
      error instanceof HttpException
        ? error.getResponse()
        : databaseUnavailable
          ? { code: 'DATABASE_UNAVAILABLE', message: '数据库暂时不可用，请稍后重试' }
          : {}
    const value = typeof payload === 'object' && payload ? (payload as Record<string, unknown>) : {}
    if (!(error instanceof HttpException))
      this.logger.error(
        `${request.method} ${request.originalUrl}`,
        error instanceof Error ? error.stack : String(error),
      )
    if (databaseUnavailable) response.setHeader('retry-after', '5')
    response.status(status).json({
      code: value.code ?? `HTTP_${status}`,
      message: value.message ?? (status === 500 ? '服务器内部错误' : '请求失败'),
      requestId: request.requestId,
      ...(value.details ? { details: value.details } : {}),
    })
  }
}
