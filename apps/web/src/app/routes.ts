import { matchPath } from 'react-router-dom'

export const workspacePageRoutes = [
  'inbox',
  'overview',
  'calendar',
  'plans',
  'documents',
  'archived',
  'members',
  'settings',
] as const

export type WorkspacePageRoute = (typeof workspacePageRoutes)[number]

export const appPaths = {
  home: '/',
  login: '/login',
  invitePattern: '/invite/:token',
  setupPattern: '/setup/:token',
  invite: (token: string) => `/invite/${encodeURIComponent(token)}`,
  setup: (token: string) => `/setup/${encodeURIComponent(token)}`,
  legacyTasks: '/tasks',
  projectPattern: '/projects/:projectId',
  project: (projectId: string) => `/projects/${encodeURIComponent(projectId)}`,
  inbox: '/inbox',
  overview: '/overview',
  calendar: '/calendar',
  plans: '/plans',
  documents: '/documents',
  archived: '/archived',
  members: '/members',
  settings: '/settings',
} as const

export function getProjectIdFromPath(pathname: string) {
  const projectId = matchPath(appPaths.projectPattern, pathname)?.params.projectId

  if (!projectId) return undefined

  try {
    return decodeURIComponent(projectId)
  } catch {
    return undefined
  }
}

export function isProjectPath(pathname: string) {
  return getProjectIdFromPath(pathname) !== undefined
}
