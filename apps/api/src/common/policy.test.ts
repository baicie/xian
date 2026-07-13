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
    expect(can('VIEWER', 'document.read')).toBe(true)
    expect(can('VIEWER', 'document.update')).toBe(false)
  })

  it('allows members to write documents', () => {
    expect(can('MEMBER', 'document.create')).toBe(true)
    expect(can('MEMBER', 'document.update')).toBe(true)
  })

  it('lets members draft and apply plans while viewers only read them', () => {
    expect(can('MEMBER', 'plan.apply')).toBe(true)
    expect(can('VIEWER', 'plan.read')).toBe(true)
    expect(can('VIEWER', 'plan.create')).toBe(false)
  })
})
