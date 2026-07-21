import { describe, expect, it } from 'vitest'
import { createTaskTypeFields, taskTypeFieldKeys } from './taskFields'

describe('task type fields', () => {
  it('creates an independent complete draft', () => {
    const first = createTaskTypeFields(),
      second = createTaskTypeFields()
    first.reproductionSteps = '打开登录页'
    expect(second.reproductionSteps).toBe('')
    expect(first.severity).toBe('MAJOR')
  })

  it('exposes only the fields belonging to the selected task type', () => {
    expect(taskTypeFieldKeys('TASK')).toEqual(['workContent', 'completionCriteria'])
    expect(taskTypeFieldKeys('STORY')).toEqual([
      'userStory',
      'background',
      'acceptanceCriteria',
      'businessValue',
    ])
    expect(taskTypeFieldKeys('BUG')).toEqual([
      'reproductionSteps',
      'expectedResult',
      'actualResult',
      'environment',
      'severity',
      'affectedVersion',
    ])
  })
})
