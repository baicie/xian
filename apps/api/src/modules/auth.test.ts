import { describe, expect, it } from 'vitest'
import { AuthService } from './auth.js'

describe('login rate limiting', () => {
  it('returns 429 after ten failed attempts for the same account and address', async () => {
    const db = { client: async () => [] }
    const auth = new AuthService(db as never)

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        auth.login('member@example.com', 'wrong-password', '127.0.0.1'),
      ).rejects.toMatchObject({ status: 401 })
    }

    await expect(
      auth.login('member@example.com', 'wrong-password', '127.0.0.1'),
    ).rejects.toMatchObject({
      status: 429,
      response: { code: 'LOGIN_RATE_LIMIT' },
    })
  })

  it('uses separate counters for different accounts', async () => {
    const db = { client: async () => [] }
    const auth = new AuthService(db as never)

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        auth.login('first@example.com', 'wrong-password', '127.0.0.1'),
      ).rejects.toMatchObject({ status: 401 })
    }

    await expect(
      auth.login('second@example.com', 'wrong-password', '127.0.0.1'),
    ).rejects.toMatchObject({ status: 401 })
  })
})
