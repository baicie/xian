import { describe, expect, it } from 'vitest'
import { can } from './policy.js'

describe('workspace RBAC', () => {
  it('allows members to update tasks but not manage members', () => {
    expect(can('MEMBER', 'task.update')).toBe(true)
    expect(can('MEMBER', 'member.manage')).toBe(false)
  })

  it('keeps viewers read-only', () => {
    expect(can('VIEWER', 'task.read')).toBe(true)
    expect(can('VIEWER', 'task.create')).toBe(false)
  })
})
