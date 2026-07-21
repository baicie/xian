import { describe, expect, it } from 'vitest'
import { mcpTokenHash, summarizeProjectHealth } from './mcp.js'

describe('MCP token storage', () => {
  it('uses a stable one-way digest instead of plaintext', () => {
    const token = 'thm_secret-token'
    expect(mcpTokenHash(token)).toBe(mcpTokenHash(token))
    expect(mcpTokenHash(token)).not.toContain(token)
    expect(mcpTokenHash(token)).toHaveLength(64)
  })
})

describe('MCP project health summary', () => {
  it('counts active delivery risks without treating completed work as overdue', () => {
    const summary = summarizeProjectHealth(
      [
        {
          kind: 'BUG',
          dueDate: '2026-07-19',
          columnName: '进行中',
          assigneeCount: 0,
          completed: false,
        },
        {
          kind: 'TASK',
          dueDate: '2026-07-18',
          columnName: '已完成',
          assigneeCount: 1,
          completed: true,
        },
        { kind: 'TASK', dueDate: null, columnName: '待处理', assigneeCount: 1, completed: false },
      ],
      '2026-07-20',
    )
    expect(summary).toMatchObject({
      total: 3,
      active: 2,
      completed: 1,
      openBugs: 1,
      overdue: 1,
      unassigned: 1,
    })
    expect(summary.byStatus).toEqual({ 进行中: 1, 已完成: 1, 待处理: 1 })
  })
})
