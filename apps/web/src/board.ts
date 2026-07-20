import { createTaskTypeFields, type TaskTypeFields } from './taskFields'

export type ColumnId = string
export type Priority = '高' | '中' | '低'
export type TaskKind = 'TASK' | 'STORY' | 'BUG'

export type Task = {
  id: string
  number: number
  projectId: string
  title: string
  kind: TaskKind
  column: ColumnId
  priority: Priority
  assignee: string
  assigneeId: string
  due: string
  tags: string[]
  description: string
  typeFields: TaskTypeFields
  version: number
  subtaskDone?: number
  subtaskTotal?: number
}

export const columns: { id: ColumnId; label: string; accent: string }[] = [
  { id: 'backlog', label: '待处理', accent: '#84908b' },
  { id: 'progress', label: '进行中', accent: '#2367d1' },
  { id: 'review', label: '待验收', accent: '#d5792a' },
  { id: 'done', label: '已完成', accent: '#27825a' },
]

export const seedTasks: Task[] = [
  { id: '1042', number:1042, projectId:'demo', title: '重构登录页信息层级', kind:'STORY', column: 'progress', priority: '高', assignee: '林默', assigneeId:'1', due: '2026-07-15', tags: ['设计', 'Web'], description:'', typeFields:createTaskTypeFields(), version:1 },
  { id: '1043', number:1043, projectId:'demo', title: '补充接口错误码文档', kind:'TASK', column: 'backlog', priority: '中', assignee: '周屿', assigneeId:'2', due: '2026-07-18', tags: ['文档'], description:'', typeFields:createTaskTypeFields(), version:1 },
  { id: '1044', number:1044, projectId:'demo', title: '移动端导航交互验收', kind:'BUG', column: 'review', priority: '高', assignee: '陈鹿', assigneeId:'3', due: '2026-07-13', tags: ['移动端'], description:'', typeFields:createTaskTypeFields(), version:1 },
  { id: '1045', number:1045, projectId:'demo', title: '埋点方案确认', kind:'TASK', column: 'backlog', priority: '低', assignee: '沈括', assigneeId:'4', due: '2026-07-22', tags: ['数据'], description:'', typeFields:createTaskTypeFields(), version:1 },
  { id: '1046', number:1046, projectId:'demo', title: '建立发布回滚清单', kind:'TASK', column: 'done', priority: '中', assignee: '周屿', assigneeId:'2', due: '2026-07-12', tags: ['运维'], description:'', typeFields:createTaskTypeFields(), version:1 },
  { id: '1047', number:1047, projectId:'demo', title: '任务详情评论区', kind:'STORY', column: 'progress', priority: '中', assignee: '林默', assigneeId:'1', due: '2026-07-19', tags: ['开发'], description:'', typeFields:createTaskTypeFields(), version:1 },
]

export function moveTask(tasks: Task[], taskId: string, column: ColumnId) {
  return tasks.map((task) => task.id === taskId ? { ...task, column } : task)
}

export function saveTask(tasks: Task[], next: Task) {
  return tasks.some((task) => task.id === next.id)
    ? tasks.map((task) => task.id === next.id ? next : task)
    : [...tasks, next]
}

export function filterTasks(tasks: Task[], query: string) {
  const needle = query.trim().toLocaleLowerCase()
  return needle ? tasks.filter((task) => [task.title, task.assignee, ...task.tags].some((value) => value.toLocaleLowerCase().includes(needle))) : tasks
}
