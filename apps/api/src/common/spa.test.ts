import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { spaFallback } from './spa.js'

describe('SPA history fallback', () => {
  let publicDirectory = ''

  afterEach(async () => {
    if (publicDirectory) await rm(publicDirectory, { recursive: true, force: true })
  })

  async function createApp() {
    publicDirectory = await mkdtemp(join(tmpdir(), 'xian-spa-'))
    await writeFile(join(publicDirectory, 'index.html'), '<main>application shell</main>')
    const app = express()
    app.use(express.static(publicDirectory))
    app.use(spaFallback(publicDirectory))
    app.use((_request, response) => response.status(404).json({ code: 'HTTP_404' }))
    return app
  }

  it('serves the application shell for a refreshed client route', async () => {
    const app = await createApp()

    const response = await request(app)
      .get('/projects/4178cae0-336b-47b0-b25a-0610fc032172')
      .set('Accept', 'text/html')
      .expect(200)

    expect(response.text).toContain('application shell')
  })

  it.each(['/api/v1/missing', '/mcp', '/assets/missing.js'])(
    'preserves backend and asset 404 responses for %s',
    async (path) => {
      const app = await createApp()

      await request(app).get(path).set('Accept', 'text/html').expect(404, { code: 'HTTP_404' })
    },
  )
})
