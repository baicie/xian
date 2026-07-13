import { describe, expect, it } from 'vitest'
import { mcpTokenHash } from './mcp.js'

describe('MCP token storage', () => {
  it('uses a stable one-way digest instead of plaintext', () => {
    const token='thm_secret-token'
    expect(mcpTokenHash(token)).toBe(mcpTokenHash(token))
    expect(mcpTokenHash(token)).not.toContain(token)
    expect(mcpTokenHash(token)).toHaveLength(64)
  })
})
