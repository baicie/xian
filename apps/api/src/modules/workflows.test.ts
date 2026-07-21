import { describe, expect, it } from 'vitest'
import { resolveTransition, workflowTemplate, workflowTemplates } from './workflows.js'

describe('workflow templates', () => {
  it('offers simple, delivery, and release workflows', () => {
    expect(workflowTemplates.map((template) => template.key)).toEqual([
      'SIMPLE',
      'DELIVERY',
      'RELEASE',
    ])
  })

  it('models delivery review and rejection without allowing states to be skipped', () => {
    const template = workflowTemplate('DELIVERY')

    expect(template.columns.map((column) => column.type)).toEqual([
      'BACKLOG',
      'ACTIVE',
      'REVIEW',
      'DONE',
    ])
    expect(template.transitions.map((transition) => [transition.from, transition.to])).toEqual([
      ['BACKLOG', 'ACTIVE'],
      ['ACTIVE', 'REVIEW'],
      ['REVIEW', 'DONE'],
      ['REVIEW', 'ACTIVE'],
    ])
    expect(template.transitions).not.toContainEqual(
      expect.objectContaining({ from: 'ACTIVE', to: 'DONE' }),
    )
  })

  it('uses repair language for bug transitions', () => {
    const submit = workflowTemplate('DELIVERY').transitions.find(
      (transition) => transition.from === 'ACTIVE' && transition.to === 'REVIEW',
    )

    expect(submit).toMatchObject({ name: '提交测试', bugName: '修复完成并提测' })
  })
})

describe('resolveTransition', () => {
  const transitions = [
    {
      fromColumnId: 'backlog',
      toColumnId: 'active',
      name: '开始开发',
      bugName: '开始修复',
      requiresComment: false,
    },
    {
      fromColumnId: 'review',
      toColumnId: 'active',
      name: '驳回修改',
      bugName: '验证失败',
      requiresComment: true,
    },
  ]

  it('rejects a move that skips the configured workflow', () => {
    expect(() => resolveTransition(transitions, 'backlog', 'done', 'TASK', '')).toThrowError(
      expect.objectContaining({ code: 'WORKFLOW_TRANSITION_NOT_ALLOWED' }),
    )
  })

  it('requires a reason for rejection and chooses bug-specific language', () => {
    expect(() => resolveTransition(transitions, 'review', 'active', 'BUG', '  ')).toThrowError(
      expect.objectContaining({ code: 'WORKFLOW_COMMENT_REQUIRED' }),
    )
    expect(resolveTransition(transitions, 'review', 'active', 'BUG', ' 回归失败 ')).toMatchObject({
      actionName: '验证失败',
      comment: '回归失败',
    })
  })
})
