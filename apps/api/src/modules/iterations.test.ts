import { describe, expect, it } from 'vitest'
import { calculateProjectHealth, type HealthTask } from './iterations.js'

const task = (overrides: Partial<HealthTask> = {}): HealthTask => ({
  kind: 'TASK',
  dueDate: null,
  done: false,
  assigned: true,
  iterationId: null,
  ...overrides,
})

describe('project health', () => {
  it('calculates delivery progress and active iteration progress', () => {
    const health = calculateProjectHealth(
      [
        task({ done: true, iterationId: 'active' }),
        task({ kind: 'BUG', dueDate: '2026-07-24', assigned: false, iterationId: 'active' }),
        task({ dueDate: '2026-07-26' }),
      ],
      { id: 'active', title: '七月迭代' },
      '2026-07-25',
    )

    expect(health).toEqual({
      totalTasks: 3,
      completedTasks: 1,
      completionRate: 33,
      overdueTasks: 1,
      openBugs: 1,
      unassignedTasks: 1,
      activeIteration: {
        id: 'active',
        title: '七月迭代',
        totalTasks: 2,
        completedTasks: 1,
        completionRate: 50,
      },
    })
  })

  it('does not mark tasks due today as overdue and handles an empty project', () => {
    expect(
      calculateProjectHealth([task({ dueDate: '2026-07-25' })], null, '2026-07-25'),
    ).toMatchObject({ overdueTasks: 0, completionRate: 0, activeIteration: null })
    expect(calculateProjectHealth([], null, '2026-07-25')).toMatchObject({
      totalTasks: 0,
      completionRate: 0,
      overdueTasks: 0,
    })
  })

  it('excludes completed bugs and completed unassigned tasks from risk counts', () => {
    const health = calculateProjectHealth(
      [task({ kind: 'BUG', done: true, assigned: false, dueDate: '2026-07-01' })],
      null,
      '2026-07-25',
    )
    expect(health).toMatchObject({
      completedTasks: 1,
      overdueTasks: 0,
      openBugs: 0,
      unassignedTasks: 0,
    })
  })
})
