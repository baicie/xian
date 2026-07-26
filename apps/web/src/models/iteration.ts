import type { TaskKind } from './board'

export type IterationStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED'

export type Iteration = {
  id: string
  projectId: string
  title: string
  goal: string
  startDate: string
  endDate: string
  status: IterationStatus
  version: number
  closedAt: string | null
  createdAt: string
  updatedAt: string
  taskCount: number
  completedCount: number
}

export type IterationTask = {
  id: string
  number: number
  title: string
  kind: TaskKind
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  dueDate: string | null
  version: number
  columnId: string
  columnName: string
  stateType: 'BACKLOG' | 'ACTIVE' | 'REVIEW' | 'DONE'
  archivedAt: string | null
  blockerCount: number
  assignees: { id: string; name: string }[]
}

export type IterationTaskCandidate = {
  id: string
  number: number
  title: string
  assignees: { id: string; name: string }[]
}

export type IterationTaskCandidatePage = {
  data: IterationTaskCandidate[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

export type IterationRetrospective = {
  iterationId: string
  snapshotState: 'CAPTURED' | 'PARTIAL'
  scopeTaskCount: number
  completedTaskCount: number
  carryOverTaskCount: number
  overdueTaskCount: number
  openBugCount: number
  blockedTaskCount: number
  completionRate: number
  summary: string
  wentWell: string
  improvements: string
  actionItems: string
  version: number
  createdAt: string | null
  updatedAt: string | null
  updatedByName: string | null
}

export type IterationRetrospectiveUpdate = Pick<
  IterationRetrospective,
  'summary' | 'wentWell' | 'improvements' | 'actionItems' | 'version'
>

export type ProjectHealth = {
  totalTasks: number
  completedTasks: number
  completionRate: number
  overdueTasks: number
  openBugs: number
  unassignedTasks: number
  blockedTasks: number
  activeIteration: {
    id: string
    title: string
    totalTasks: number
    completedTasks: number
    blockedTasks: number
    completionRate: number
  } | null
}
