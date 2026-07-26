import { describe, expect, it } from 'vitest'
import {
  calculateIterationRetrospectiveSnapshot,
  calculateProjectHealth,
  type HealthTask,
  type RetrospectiveTask,
} from './iterations.js'

const task = (overrides: Partial<HealthTask> = {}): HealthTask => ({
  kind: 'TASK',
  dueDate: null,
  done: false,
  assigned: true,
  blocked: false,
  iterationId: null,
  ...overrides,
})

describe('project health', () => {
  it('calculates delivery progress and active iteration progress', () => {
    const health = calculateProjectHealth(
      [
        task({ done: true, iterationId: 'active' }),
        task({
          kind: 'BUG',
          dueDate: '2026-07-24',
          assigned: false,
          blocked: true,
          iterationId: 'active',
        }),
        task({ dueDate: '2026-07-26', blocked: true }),
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
      blockedTasks: 2,
      activeIteration: {
        id: 'active',
        title: '七月迭代',
        totalTasks: 2,
        completedTasks: 1,
        blockedTasks: 1,
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

describe('iteration retrospective snapshot', () => {
  const retrospectiveTask = (overrides: Partial<RetrospectiveTask> = {}): RetrospectiveTask => ({
    kind: 'TASK',
    dueDate: null,
    done: false,
    blocked: false,
    ...overrides,
  })

  it('captures scope and delivery risks before unfinished work moves', () => {
    expect(
      calculateIterationRetrospectiveSnapshot(
        [
          retrospectiveTask({ done: true }),
          retrospectiveTask({ kind: 'BUG', dueDate: '2026-07-24', blocked: true }),
          retrospectiveTask({ dueDate: '2026-07-25' }),
        ],
        '2026-07-25',
      ),
    ).toEqual({
      scopeTaskCount: 3,
      completedTaskCount: 1,
      carryOverTaskCount: 2,
      overdueTaskCount: 1,
      openBugCount: 1,
      blockedTaskCount: 1,
      completionRate: 33,
    })
  })

  it('does not count completed work or work due today as an open risk', () => {
    expect(
      calculateIterationRetrospectiveSnapshot(
        [
          retrospectiveTask({ kind: 'BUG', done: true, dueDate: '2026-07-01', blocked: true }),
          retrospectiveTask({ dueDate: '2026-07-25' }),
        ],
        '2026-07-25',
      ),
    ).toMatchObject({
      scopeTaskCount: 2,
      completedTaskCount: 1,
      carryOverTaskCount: 1,
      overdueTaskCount: 0,
      openBugCount: 0,
      blockedTaskCount: 0,
      completionRate: 50,
    })
  })

  it('returns a zero-rate empty snapshot', () => {
    expect(calculateIterationRetrospectiveSnapshot([], '2026-07-25')).toEqual({
      scopeTaskCount: 0,
      completedTaskCount: 0,
      carryOverTaskCount: 0,
      overdueTaskCount: 0,
      openBugCount: 0,
      blockedTaskCount: 0,
      completionRate: 0,
    })
  })
})
