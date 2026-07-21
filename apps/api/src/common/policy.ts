export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
export type Permission =
  | 'workspace.read'
  | 'workspace.manage'
  | 'member.read'
  | 'member.manage'
  | 'project.create'
  | 'project.read'
  | 'project.update'
  | 'project.archive'
  | 'project.delete'
  | 'task.create'
  | 'task.read'
  | 'task.update'
  | 'task.delete'
  | 'comment.create'
  | 'comment.delete'
  | 'document.create'
  | 'document.read'
  | 'document.update'
  | 'plan.create'
  | 'plan.read'
  | 'plan.update'
  | 'plan.apply'

const read: Permission[] = [
  'workspace.read',
  'member.read',
  'project.read',
  'task.read',
  'document.read',
  'plan.read',
]
const write: Permission[] = [
  ...read,
  'project.create',
  'project.update',
  'task.create',
  'task.update',
  'task.delete',
  'comment.create',
  'comment.delete',
  'document.create',
  'document.update',
  'plan.create',
  'plan.update',
  'plan.apply',
]
const manage: Permission[] = [
  ...write,
  'workspace.manage',
  'member.manage',
  'project.archive',
  'project.delete',
]

export function can(role: Role, permission: Permission) {
  return (
    role === 'OWNER' || role === 'ADMIN' ? manage : role === 'MEMBER' ? write : read
  ).includes(permission)
}
