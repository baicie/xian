import type { TaskKind } from './board'

export type TaskDependencySummary = {
  id: string
  number: number
  code: string
  title: string
  kind: TaskKind
  stateType: 'BACKLOG' | 'ACTIVE' | 'REVIEW' | 'DONE'
  archived: boolean
  blockerCount: number
}

export type TaskDependencies = {
  blocked: boolean
  blockerCount: number
  blockers: TaskDependencySummary[]
  dependents: TaskDependencySummary[]
}

export type TaskDependencyCandidate = Omit<TaskDependencySummary, 'archived' | 'blockerCount'>

export type TaskDependencyCandidatePage = {
  data: TaskDependencyCandidate[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}
