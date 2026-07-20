import type { RequestHandler } from 'express'
import { extname, join } from 'node:path'

export function spaFallback(publicDirectory: string): RequestHandler {
  return (request, response, next) => {
    const path = request.path
    const isBackendPath =
      path === '/api' ||
      path.startsWith('/api/') ||
      path === '/mcp' ||
      path.startsWith('/mcp/')
    const acceptsHtml = request.headers.accept
      ?.split(',')
      .some(value => value.trim().startsWith('text/html'))

    if (
      request.method !== 'GET' ||
      isBackendPath ||
      extname(path) ||
      !acceptsHtml
    ) {
      next()
      return
    }

    response.sendFile(join(publicDirectory, 'index.html'), error => {
      if (error) next(error)
    })
  }
}
