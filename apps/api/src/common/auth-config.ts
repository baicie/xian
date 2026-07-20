export type RegistrationMode = 'open' | 'invite_only' | 'admin_only'

const modes: RegistrationMode[] = ['open', 'invite_only', 'admin_only']

export function authConfig() {
  const raw = process.env.AUTH_REGISTRATION_MODE ?? 'open'
  const registrationMode = modes.includes(raw as RegistrationMode) ? raw as RegistrationMode : 'admin_only'
  const allowWorkspaceCreate = process.env.AUTH_ALLOW_WORKSPACE_CREATE !== 'false'
  return { registrationMode, allowWorkspaceCreate }
}
