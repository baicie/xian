import { describe, expect, it } from 'vitest'
import {
  appPaths,
  getProjectIdFromPath,
  getSettingsSectionFromPath,
  isProjectPath,
  settingsSections,
  workspacePageRoutes,
} from './routes'

describe('application routes', () => {
  it('builds stable project URLs', () => {
    expect(appPaths.project('project/with spaces')).toBe('/projects/project%2Fwith%20spaces')
  })

  it('extracts project IDs only from complete project paths', () => {
    expect(getProjectIdFromPath('/projects/project-42')).toBe('project-42')
    expect(getProjectIdFromPath('/projects/project%2F42')).toBe('project/42')
    expect(getProjectIdFromPath('/projects/project-42/settings')).toBeUndefined()
    expect(getProjectIdFromPath('/overview')).toBeUndefined()
  })

  it('identifies project routes', () => {
    expect(isProjectPath('/projects/project-42')).toBe(true)
    expect(isProjectPath('/projects/project-42/settings')).toBe(false)
    expect(isProjectPath('/projects')).toBe(false)
  })

  it('defines each workspace page route once', () => {
    expect(workspacePageRoutes).toEqual([
      'inbox',
      'overview',
      'calendar',
      'plans',
      'documents',
      'archived',
      'members',
      'settings',
    ])
  })

  it('builds and parses route-managed settings sections', () => {
    expect(appPaths.settingsSection('assets')).toBe('/settings/assets')
    expect(getSettingsSectionFromPath('/settings/integrations')).toBe('integrations')
    expect(getSettingsSectionFromPath('/settings')).toBe('overview')
    expect(getSettingsSectionFromPath('/settings/unknown')).toBe('overview')
    expect(settingsSections).toContain('assets')
  })
})
