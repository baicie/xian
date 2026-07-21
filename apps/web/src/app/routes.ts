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

export const settingsSections = ['overview', 'integrations', 'audit', 'assets', 'data'] as const

export type SettingsSection = (typeof settingsSections)[number]

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
  settingsSection: (section: SettingsSection) => `/settings/${section}`,
} as const

export function getSettingsSectionFromPath(pathname: string): SettingsSection {
  const section = matchPath('/settings/:section', pathname)?.params.section
  return settingsSections.find((item) => item === section) ?? 'overview'
}

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
