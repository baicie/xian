import { describe, expect, it } from 'vitest'
import { filterTasks, moveTask, saveTask, seedTasks } from './board'

describe('board operations', () => {
  it('moves only the selected task', () => {
    const moved = moveTask(seedTasks, '1042', 'done')
    expect(moved.find((task) => task.id === '1042')?.column).toBe('done')
    expect(moved.find((task) => task.id === '1043')?.column).toBe('backlog')
  })

  it('searches title, assignee and tag', () => {
    expect(filterTasks(seedTasks, '林默')).toHaveLength(2)
    expect(filterTasks(seedTasks, '运维')[0]?.id).toBe('1046')
  })

  it('inserts a new task and updates an existing one', () => {
    const next = { ...seedTasks[0]!, id: '9999', title: '新任务' }
    expect(saveTask(seedTasks, next)).toHaveLength(seedTasks.length + 1)
    expect(saveTask(seedTasks, { ...seedTasks[0]!, title: '已更新' })).toHaveLength(
      seedTasks.length,
    )
  })
})
