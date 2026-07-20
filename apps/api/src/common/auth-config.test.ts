import { afterEach, describe, expect, it } from 'vitest'
import { authConfig } from './auth-config.js'

describe('authConfig', () => {
  afterEach(() => {
    delete process.env.AUTH_REGISTRATION_MODE
    delete process.env.AUTH_ALLOW_WORKSPACE_CREATE
  })

  it('defaults to open registration with workspace creation enabled', () => {
    expect(authConfig()).toEqual({ registrationMode: 'open', allowWorkspaceCreate: true })
  })

  it('parses invite_only mode and workspace create flag', () => {
    process.env.AUTH_REGISTRATION_MODE = 'invite_only'
    process.env.AUTH_ALLOW_WORKSPACE_CREATE = 'false'
    expect(authConfig()).toEqual({ registrationMode: 'invite_only', allowWorkspaceCreate: false })
  })

  it('falls back to admin-only registration for unknown modes', () => {
    process.env.AUTH_REGISTRATION_MODE = 'invalid'
    expect(authConfig().registrationMode).toBe('admin_only')
  })
})
