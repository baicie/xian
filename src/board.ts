export type ColumnId = 'backlog' | 'progress' | 'review' | 'done'
export type Priority = '高' | '中' | '低'

export type Task = {
  id: number
  title: string
  column: ColumnId
  priority: Priority
  assignee: string
  due: string
  tags: string[]
}

export const columns: { id: ColumnId; label: string; accent: string }[] = [
  { id: 'backlog', label: '待处理', accent: '#84908b' },
  { id: 'progress', label: '进行中', accent: '#2367d1' },
  { id: 'review', label: '待验收', accent: '#d5792a' },
  { id: 'done', label: '已完成', accent: '#27825a' },
]

export const seedTasks: Task[] = [
  { id: 1042, title: '重构登录页信息层级', column: 'progress', priority: '高', assignee: '林默', due: '7月15日', tags: ['设计', 'Web'] },
  { id: 1043, title: '补充接口错误码文档', column: 'backlog', priority: '中', assignee: '周屿', due: '7月18日', tags: ['文档'] },
  { id: 1044, title: '移动端导航交互验收', column: 'review', priority: '高', assignee: '陈鹿', due: '今天', tags: ['移动端'] },
  { id: 1045, title: '埋点方案确认', column: 'backlog', priority: '低', assignee: '沈括', due: '7月22日', tags: ['数据'] },
  { id: 1046, title: '建立发布回滚清单', column: 'done', priority: '中', assignee: '周屿', due: '7月12日', tags: ['运维'] },
  { id: 1047, title: '任务详情评论区', column: 'progress', priority: '中', assignee: '林默', due: '7月19日', tags: ['开发'] },
]

export function moveTask(tasks: Task[], taskId: number, column: ColumnId) {
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
