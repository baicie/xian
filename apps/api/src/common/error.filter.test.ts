import { HttpException, HttpStatus, Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiErrorFilter, isDatabaseUnavailable } from './error.filter.js'

type ResponseSpy = {
  status: ReturnType<typeof vi.fn>
  json: ReturnType<typeof vi.fn>
  setHeader: ReturnType<typeof vi.fn>
}

function host(response: ResponseSpy) {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({
        method: 'POST',
        originalUrl: '/api/v1/auth/login',
        requestId: 'req-123',
      }),
    }),
  }
}

function responseSpy(): ResponseSpy {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
  }
  response.status.mockReturnValue(response)
  return response
}

describe('ApiErrorFilter', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['ECONNREFUSED', 'CONNECTION_CLOSED', '53100', '57P03'])(
    'identifies database connectivity failure %s',
    (code) => {
      expect(
        isDatabaseUnavailable(Object.assign(new Error('database unavailable'), { code })),
      ).toBe(true)
    },
  )

  it('returns a retryable response when the database connection is unavailable', () => {
    const response = responseSpy()
    const error = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })

    new ApiErrorFilter().catch(error, host(response) as never)

    expect(response.setHeader).toHaveBeenCalledWith('retry-after', '5')
    expect(response.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE)
    expect(response.json).toHaveBeenCalledWith({
      code: 'DATABASE_UNAVAILABLE',
      message: '数据库暂时不可用，请稍后重试',
      requestId: 'req-123',
    })
  })

  it('keeps unexpected errors as internal server errors', () => {
    const response = responseSpy()

    new ApiErrorFilter().catch(new Error('unexpected'), host(response) as never)

    expect(response.setHeader).not.toHaveBeenCalled()
    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(response.json).toHaveBeenCalledWith({
      code: 'HTTP_500',
      message: '服务器内部错误',
      requestId: 'req-123',
    })
  })

  it('preserves application HTTP errors', () => {
    const response = responseSpy()
    const error = new HttpException(
      { code: 'INVALID_CREDENTIALS', message: '邮箱或密码错误' },
      HttpStatus.UNAUTHORIZED,
    )

    new ApiErrorFilter().catch(error, host(response) as never)

    expect(response.setHeader).not.toHaveBeenCalled()
    expect(response.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED)
    expect(response.json).toHaveBeenCalledWith({
      code: 'INVALID_CREDENTIALS',
      message: '邮箱或密码错误',
      requestId: 'req-123',
    })
  })
})
