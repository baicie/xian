export type ColumnId = string
export type Priority = '高' | '中' | '低'

export type Task = {
  id: string
  number: number
  projectId: string
  title: string
  column: ColumnId
  priority: Priority
  assignee: string
  due: string
  tags: string[]
  version: number
}

export const columns: { id: ColumnId; label: string; accent: string }[] = [
  { id: 'backlog', label: '待处理', accent: '#84908b' },
  { id: 'progress', label: '进行中', accent: '#2367d1' },
  { id: 'review', label: '待验收', accent: '#d5792a' },
  { id: 'done', label: '已完成', accent: '#27825a' },
]

export const seedTasks: Task[] = [
  { id: '1042', number:1042, projectId:'demo', title: '重构登录页信息层级', column: 'progress', priority: '高', assignee: '林默', due: '7月15日', tags: ['设计', 'Web'], version:1 },
  { id: '1043', number:1043, projectId:'demo', title: '补充接口错误码文档', column: 'backlog', priority: '中', assignee: '周屿', due: '7月18日', tags: ['文档'], version:1 },
  { id: '1044', number:1044, projectId:'demo', title: '移动端导航交互验收', column: 'review', priority: '高', assignee: '陈鹿', due: '今天', tags: ['移动端'], version:1 },
  { id: '1045', number:1045, projectId:'demo', title: '埋点方案确认', column: 'backlog', priority: '低', assignee: '沈括', due: '7月22日', tags: ['数据'], version:1 },
  { id: '1046', number:1046, projectId:'demo', title: '建立发布回滚清单', column: 'done', priority: '中', assignee: '周屿', due: '7月12日', tags: ['运维'], version:1 },
  { id: '1047', number:1047, projectId:'demo', title: '任务详情评论区', column: 'progress', priority: '中', assignee: '林默', due: '7月19日', tags: ['开发'], version:1 },
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
