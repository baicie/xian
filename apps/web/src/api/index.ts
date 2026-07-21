import type { Task } from '@/models/board'
import { createTaskTypeFields, type TaskTypeFields } from '@/models/taskFields'
import type { ProjectWorkflow, TaskTransitionEvent, WorkflowTemplateKey } from '@/models/workflow'

export type DocumentKind = 'ARCHITECTURE' | 'REQUIREMENT' | 'DESIGN' | 'MEETING' | 'RETROSPECTIVE'
export type WorkspaceDocument = {
  id: string
  projectId: string | null
  folderId: string | null
  title: string
  kind: DocumentKind
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  content: string
  version: number
  createdAt: string
  updatedAt: string
}
export type DocumentSummary = Omit<WorkspaceDocument, 'content' | 'createdAt'> & {
  projectName: string | null
  updatedByName: string
}
export type DocumentFolder = {
  id: string
  parentId: string | null
  name: string
  createdAt: string
  updatedAt: string
}
export type PlanItem = {
  id: string
  position: number
  title: string
  description: string
  kind: Task['kind']
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  taskId: string | null
}
export type ProjectPlan = {
  id: string
  projectId: string
  title: string
  goal: string
  status: 'DRAFT' | 'APPLIED'
  source: string
  version: number
  items: PlanItem[]
  appliedAt: string | null
  updatedAt: string
}
export type PlanSummary = Omit<ProjectPlan, 'items' | 'appliedAt'> & {
  projectName: string
  itemCount: number
}
export type GitHubReference = {
  kind: 'ISSUE' | 'PR'
  number: number
  title: string
  url: string
  state: 'open' | 'closed'
}
export type TaskColumnRole = 'TITLE' | 'DESCRIPTION' | 'KIND' | 'PRIORITY' | 'IGNORE'
export type TaskWorkbookMapping = {
  titleColumn: number
  descriptionColumns: number[]
  kindColumn: number | null
  priorityColumn: number | null
}
export type TaskImportPreview = {
  sheetName: string
  headerRow: number
  columns: { index: number; header: string; suggestedRole: TaskColumnRole }[]
  mapping: TaskWorkbookMapping
  rows: {
    title: string
    description: string
    kind: Task['kind']
    priority: 'HIGH' | 'MEDIUM' | 'LOW'
    sourceRow: number
    errors: string[]
    duplicateInFile: boolean
    duplicate: boolean
  }[]
  ignoredRows: number
  counts: { total: number; valid: number; invalid: number; duplicates: number; ignored: number }
}
export type TaskBulkAction =
  | { type: 'ASSIGN'; assigneeIds: string[] }
  | { type: 'MOVE'; columnId: string }
  | { type: 'KIND'; kind: Task['kind'] }
  | { type: 'PRIORITY'; priority: 'HIGH' | 'MEDIUM' | 'LOW' }
  | { type: 'DELETE' }
export type Subtask = { id: string; title: string; isDone: boolean; position: number }
export type Asset = {
  id: string
  originalName: string
  contentType: string
  sizeBytes: number
  sha256: string
  createdAt: string
  referenceCount: number
  deduplicated?: boolean
}
export type TaskComment = {
  id: string
  body: string
  status: 'OPEN' | 'RESOLVED'
  author: string
  createdAt: string
  assets: { id: string; name: string; contentType: string; sizeBytes: number }[]
}
export type Notification = {
  id: number
  title: string
  body: string
  action: string
  taskId: string | null
  isRead: boolean
  createdAt: string
  actorName: string | null
  code: string | null
  number: number | null
  taskTitle: string | null
}
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED'
export type WorkspaceInvitation = {
  id: string
  email: string
  role: string
  status: InvitationStatus
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
  createdAt: string
}
export type AuditLog = {
  id: string
  action: string
  entityType: string
  entityId: string | null
  beforeData: Record<string, unknown> | null
  afterData: Record<string, unknown> | null
  requestId: string
  createdAt: string
  actorName: string | null
  actorEmail: string | null
}
type RawTask = {
  id: string
  number: number
  projectId: string
  columnId: string
  title: string
  description: string
  kind: Task['kind']
  typeFields: Partial<TaskTypeFields>
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  dueDate: string | null
  version: number
  subtaskDone: number
  subtaskTotal: number
  assignees: { id: string; name: string }[]
  labels: string[]
}

const mapTask = (task: RawTask): Task => ({
  id: task.id,
  number: task.number,
  projectId: task.projectId,
  title: task.title,
  description: task.description,
  kind: task.kind,
  column: task.columnId,
  priority: { HIGH: '高', MEDIUM: '中', LOW: '低' }[task.priority] as Task['priority'],
  assignee: task.assignees[0]?.name ?? '未分配',
  assigneeId: task.assignees[0]?.id ?? '',
  due: task.dueDate ?? '',
  tags: task.labels,
  typeFields: { ...createTaskTypeFields(), ...task.typeFields },
  version: task.version,
  subtaskDone: task.subtaskDone,
  subtaskTotal: task.subtaskTotal,
})

async function uploadFields<T>(path: string, file: File, fields: Record<string, string>) {
  const body = new FormData()
  body.append('file', file)
  Object.entries(fields).forEach(([key, value]) => body.append(key, value))
  const response = await fetch('/api/v1' + path, {
    method: 'POST',
    body,
    credentials: 'include',
    headers: csrf ? { 'x-csrf-token': csrf } : {},
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || '上传失败')
  return data as T
}

export type RegistrationMode = 'open' | 'invite_only' | 'admin_only'
export type AuthConfig = {
  registrationMode: RegistrationMode
  allowWorkspaceCreate: boolean
  bootstrapAvailable: boolean
}

const base = '/api/v1'
let csrf = ''
async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(base + path, {
      ...init,
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
        ...init.headers,
      },
    }),
    text = await response.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  const message =
    data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
      ? data.message
      : '请求失败'
  if (!response.ok) throw new Error(message)
  return data as T
}
async function upload<T>(path: string, file: File) {
  const body = new FormData()
  body.append('file', file)
  const response = await fetch(base + path, {
    method: 'POST',
    body,
    credentials: 'include',
    headers: csrf ? { 'x-csrf-token': csrf } : {},
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || '上传失败')
  return data as T
}
export const api = {
  authConfig() {
    return request<AuthConfig>('/auth/config')
  },
  async me() {
    const data = await request<{ user: { id: string; name: string }; csrfToken: string }>(
      '/auth/me',
    )
    csrf = data.csrfToken
    return data
  },
  async login(email: string, password: string) {
    const data = await request<{ user: { id: string; name: string }; csrfToken: string }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    )
    csrf = data.csrfToken
    return data
  },
  register(input: { email: string; name: string; password: string; workspaceName: string }) {
    return request('/auth/register', { method: 'POST', body: JSON.stringify(input) })
  },
  previewInvite(token: string) {
    return request<{
      workspaceName: string
      email: string
      role: string
      expired: boolean
      revoked: boolean
      accepted: boolean
      usable: boolean
    }>(`/invites/${encodeURIComponent(token)}`)
  },
  async registerInvite(input: { token: string; name: string; password: string }) {
    const data = await request<{
      user: { id: string; name: string }
      csrfToken: string
      workspace: { id: string; name: string }
    }>('/auth/register/invite', { method: 'POST', body: JSON.stringify(input) })
    csrf = data.csrfToken
    return data
  },
  acceptInvite(token: string) {
    return request<{ ok: true; workspace: { id: string; name: string } }>('/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
  },
  previewSetup(token: string) {
    return request<{
      email: string
      name: string
      expired: boolean
      used: boolean
      usable: boolean
    }>(`/auth/setup/${encodeURIComponent(token)}`)
  },
  async completeSetup(token: string, password: string) {
    const data = await request<{ user: { id: string; name: string }; csrfToken: string }>(
      '/auth/setup',
      { method: 'POST', body: JSON.stringify({ token, password }) },
    )
    csrf = data.csrfToken
    return data
  },
  logout() {
    return request('/auth/logout', { method: 'POST' })
  },
  workspaces() {
    return request<{ id: string; name: string; slug: string; role: string }[]>('/workspaces')
  },
  createWorkspace(name: string) {
    return request<{ id: string; name: string; slug: string }>('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  },
  projects(workspaceId: string) {
    return request<{ id: string; name: string; code: string; color: string }[]>(
      `/workspaces/${workspaceId}/projects`,
    )
  },
  createProject(
    workspaceId: string,
    input: { name: string; code: string; workflowTemplate?: WorkflowTemplateKey },
  ) {
    return request(`/workspaces/${workspaceId}/projects`, {
      method: 'POST',
      body: JSON.stringify({ ...input, description: '', color: '#2367d1' }),
    })
  },
  updateProject(workspaceId: string, projectId: string, input: { name: string }) {
    return request<{ id: string; name: string; code: string; color: string }>(
      `/workspaces/${workspaceId}/projects/${projectId}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    )
  },
  deleteProject(workspaceId: string, projectId: string) {
    return request(`/workspaces/${workspaceId}/projects/${projectId}`, { method: 'DELETE' })
  },
  workflow(workspaceId: string, projectId: string) {
    return request<ProjectWorkflow>(`/workspaces/${workspaceId}/projects/${projectId}/workflow`)
  },
  async tasks(workspaceId: string, projectId: string, archived = false) {
    const result = await request<{ data: RawTask[] }>(
      `/workspaces/${workspaceId}/tasks?projectId=${projectId}&archived=${archived}`,
    )
    return result.data.map(mapTask)
  },
  async myTasks(workspaceId: string) {
    const result = await request<{ data: RawTask[] }>(
      `/workspaces/${workspaceId}/tasks?mine=true&pageSize=100`,
    )
    return result.data.map(mapTask)
  },
  notifications(workspaceId: string) {
    return request<{ items: Notification[]; unread: number }>(
      `/notifications?workspaceId=${encodeURIComponent(workspaceId)}`,
    )
  },
  readNotifications(ids: number[] = []) {
    return request<{ ok: true }>('/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
  },
  members(workspaceId: string) {
    return request<
      { id: string; name: string; email: string; role: string; disabledAt: string | null }[]
    >(`/workspaces/${workspaceId}/members`)
  },
  addMember(workspaceId: string, input: { email: string; role: 'ADMIN' | 'MEMBER' | 'VIEWER' }) {
    return request<{
      ok: true
      added?: true
      invited?: true
      invitation?: { id: string; email: string; role: string; expiresAt: string; inviteUrl: string }
    }>(`/workspaces/${workspaceId}/members`, { method: 'POST', body: JSON.stringify(input) })
  },
  provisionMember(
    workspaceId: string,
    input: { email: string; name: string; role: 'ADMIN' | 'MEMBER' | 'VIEWER' },
  ) {
    return request<{
      ok: true
      added?: true
      provisioned?: true
      setupUrl?: string
      user?: { id: string; email: string; name: string; role: string }
    }>(`/workspaces/${workspaceId}/members/provision`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  invitations(workspaceId: string) {
    return request<WorkspaceInvitation[]>(`/workspaces/${workspaceId}/invitations`)
  },
  revokeInvitation(workspaceId: string, invitationId: string) {
    return request<{ ok: true }>(`/workspaces/${workspaceId}/invitations/${invitationId}`, {
      method: 'DELETE',
    })
  },
  auditLogs(workspaceId: string) {
    return request<AuditLog[]>(`/workspaces/${workspaceId}/audit-logs`)
  },
  createTask(workspaceId: string, task: Task) {
    return request(`/workspaces/${workspaceId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({
        projectId: task.projectId,
        columnId: task.column,
        title: task.title,
        description: task.description,
        kind: task.kind,
        typeFields: task.typeFields,
        priority: { 高: 'HIGH', 中: 'MEDIUM', 低: 'LOW' }[task.priority],
        assigneeIds: task.assigneeId ? [task.assigneeId] : [],
        dueDate: task.due || null,
        labels: task.tags,
      }),
    })
  },
  updateTask(workspaceId: string, task: Task) {
    return request<{ id: string; version: number }>(`/workspaces/${workspaceId}/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: task.title,
        description: task.description,
        kind: task.kind,
        typeFields: task.typeFields,
        columnId: task.column,
        priority: { 高: 'HIGH', 中: 'MEDIUM', 低: 'LOW' }[task.priority],
        assigneeIds: task.assigneeId ? [task.assigneeId] : [],
        dueDate: task.due || null,
        labels: task.tags,
        version: task.version,
      }),
    })
  },
  transitionTask(
    workspaceId: string,
    taskId: string,
    toColumnId: string,
    version: number,
    comment = '',
  ) {
    return request<{ id: string; version: number; columnId: string; actionName: string }>(
      `/workspaces/${workspaceId}/tasks/${taskId}/transitions`,
      { method: 'POST', body: JSON.stringify({ toColumnId, version, comment }) },
    )
  },
  taskTransitions(workspaceId: string, taskId: string) {
    return request<TaskTransitionEvent[]>(`/workspaces/${workspaceId}/tasks/${taskId}/transitions`)
  },
  bulkUpdateTasks(workspaceId: string, taskIds: string[], action: TaskBulkAction) {
    return request<{ updated: number }>(`/workspaces/${workspaceId}/tasks/bulk`, {
      method: 'PATCH',
      body: JSON.stringify({ taskIds, action }),
    })
  },
  deleteTask(workspaceId: string, taskId: string) {
    return request<{ ok: true }>(`/workspaces/${workspaceId}/tasks/${taskId}`, { method: 'DELETE' })
  },
  taskWatch(workspaceId: string, taskId: string) {
    return request<{ watching: boolean }>(`/workspaces/${workspaceId}/tasks/${taskId}/watch`)
  },
  setTaskWatch(workspaceId: string, taskId: string, watching: boolean) {
    return request<{ watching: boolean }>(`/workspaces/${workspaceId}/tasks/${taskId}/watch`, {
      method: 'PUT',
      body: JSON.stringify({ watching }),
    })
  },
  subtasks(workspaceId: string, taskId: string) {
    return request<Subtask[]>(`/workspaces/${workspaceId}/tasks/${taskId}/subtasks`)
  },
  createSubtask(workspaceId: string, taskId: string, title: string) {
    return request<Subtask>(`/workspaces/${workspaceId}/tasks/${taskId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    })
  },
  updateSubtask(
    workspaceId: string,
    taskId: string,
    subtaskId: string,
    input: { title?: string; isDone?: boolean },
  ) {
    return request<Subtask>(`/workspaces/${workspaceId}/tasks/${taskId}/subtasks/${subtaskId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  reorderSubtasks(workspaceId: string, taskId: string, subtaskIds: string[]) {
    return request<{ ok: true }>(`/workspaces/${workspaceId}/tasks/${taskId}/subtasks/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ subtaskIds }),
    })
  },
  deleteSubtask(workspaceId: string, taskId: string, subtaskId: string) {
    return request<{ ok: true }>(
      `/workspaces/${workspaceId}/tasks/${taskId}/subtasks/${subtaskId}`,
      { method: 'DELETE' },
    )
  },
  taskComments(workspaceId: string, taskId: string) {
    return request<TaskComment[]>(`/workspaces/${workspaceId}/tasks/${taskId}/comments`)
  },
  createTaskComment(
    workspaceId: string,
    taskId: string,
    input: { body: string; status: 'OPEN' | 'RESOLVED'; assetIds: string[] },
  ) {
    return request<TaskComment>(`/workspaces/${workspaceId}/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  updateTaskComment(
    workspaceId: string,
    taskId: string,
    commentId: string,
    status: 'OPEN' | 'RESOLVED',
  ) {
    return request<{ id: string; status: 'OPEN' | 'RESOLVED' }>(
      `/workspaces/${workspaceId}/tasks/${taskId}/comments/${commentId}`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
    )
  },
  assets(workspaceId: string) {
    return request<{ assets: Asset[]; usage: { usedBytes: number; quotaBytes: number } }>(
      `/workspaces/${workspaceId}/assets`,
    )
  },
  updateAssetQuota(workspaceId: string, quotaBytes: number) {
    return request<{ usedBytes: number; quotaBytes: number }>(
      `/workspaces/${workspaceId}/assets/quota`,
      { method: 'PATCH', body: JSON.stringify({ quotaBytes }) },
    )
  },
  uploadAsset(workspaceId: string, file: File) {
    return upload<Asset & { deduplicated: boolean }>(`/workspaces/${workspaceId}/assets`, file)
  },
  deleteAsset(workspaceId: string, assetId: string) {
    return request<{ ok: true }>(`/workspaces/${workspaceId}/assets/${assetId}`, {
      method: 'DELETE',
    })
  },
  assetUrl(workspaceId: string, assetId: string) {
    return `${base}/workspaces/${workspaceId}/assets/${assetId}`
  },
  previewTaskImport(
    workspaceId: string,
    file: File,
    projectId: string,
    mapping?: TaskWorkbookMapping,
  ) {
    return uploadFields<TaskImportPreview>(
      `/workspaces/${workspaceId}/tasks/import/xlsx/preview`,
      file,
      { projectId, ...(mapping ? { mapping: JSON.stringify(mapping) } : {}) },
    )
  },
  importTasks(
    workspaceId: string,
    file: File,
    projectId: string,
    columnId: string,
    mapping: TaskWorkbookMapping,
  ) {
    return uploadFields<{
      imported: number
      invalidRows: number
      duplicateRows: number
      ignoredRows: number
      sheetName: string
    }>(`/workspaces/${workspaceId}/tasks/import/xlsx`, file, {
      projectId,
      columnId,
      mapping: JSON.stringify(mapping),
    })
  },
  documents(workspaceId: string) {
    return request<DocumentSummary[]>(`/workspaces/${workspaceId}/documents`)
  },
  documentFolders(workspaceId: string) {
    return request<DocumentFolder[]>(`/workspaces/${workspaceId}/documents/folders`)
  },
  document(workspaceId: string, documentId: string) {
    return request<WorkspaceDocument>(`/workspaces/${workspaceId}/documents/${documentId}`)
  },
  createDocument(
    workspaceId: string,
    input: {
      title: string
      kind?: DocumentKind
      projectId?: string | null
      folderId?: string | null
      content?: string
    },
  ) {
    return request<WorkspaceDocument>(`/workspaces/${workspaceId}/documents`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  updateDocument(
    workspaceId: string,
    documentId: string,
    input: Partial<
      Pick<WorkspaceDocument, 'title' | 'kind' | 'status' | 'content' | 'projectId' | 'folderId'>
    > & { version: number; changeNote?: string },
  ) {
    return request<WorkspaceDocument>(`/workspaces/${workspaceId}/documents/${documentId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  duplicateDocument(workspaceId: string, documentId: string) {
    return request<WorkspaceDocument>(
      `/workspaces/${workspaceId}/documents/${documentId}/duplicate`,
      { method: 'POST' },
    )
  },
  deleteDocument(workspaceId: string, documentId: string) {
    return request<{ ok: true }>(`/workspaces/${workspaceId}/documents/${documentId}`, {
      method: 'DELETE',
    })
  },
  createDocumentFolder(workspaceId: string, input: { name: string; parentId?: string | null }) {
    return request<DocumentFolder>(`/workspaces/${workspaceId}/documents/folders`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  updateDocumentFolder(
    workspaceId: string,
    folderId: string,
    input: { name?: string; parentId?: string | null },
  ) {
    return request<DocumentFolder>(`/workspaces/${workspaceId}/documents/folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  deleteDocumentFolder(workspaceId: string, folderId: string) {
    return request<{ ok: true }>(`/workspaces/${workspaceId}/documents/folders/${folderId}`, {
      method: 'DELETE',
    })
  },
  documentVersions(workspaceId: string, documentId: string) {
    return request<
      {
        id: string
        version: number
        title: string
        status: WorkspaceDocument['status']
        changeNote: string
        createdAt: string
        createdByName: string
      }[]
    >(`/workspaces/${workspaceId}/documents/${documentId}/versions`)
  },
  plans(workspaceId: string) {
    return request<PlanSummary[]>(`/workspaces/${workspaceId}/plans`)
  },
  plan(workspaceId: string, planId: string) {
    return request<ProjectPlan>(`/workspaces/${workspaceId}/plans/${planId}`)
  },
  createPlan(
    workspaceId: string,
    input: {
      projectId: string
      title: string
      goal: string
      items: {
        title: string
        description?: string
        kind?: Task['kind']
        priority?: PlanItem['priority']
      }[]
    },
  ) {
    return request<ProjectPlan>(`/workspaces/${workspaceId}/plans`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  updatePlan(
    workspaceId: string,
    planId: string,
    input: {
      title?: string
      goal?: string
      items?: Omit<PlanItem, 'id' | 'position' | 'taskId'>[]
      version: number
    },
  ) {
    return request<ProjectPlan>(`/workspaces/${workspaceId}/plans/${planId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  applyPlan(workspaceId: string, planId: string) {
    return request<{ status: 'APPLIED'; alreadyApplied: boolean; taskIds: string[] }>(
      `/workspaces/${workspaceId}/plans/${planId}/apply`,
      { method: 'POST' },
    )
  },
  mcpTokens(workspaceId: string) {
    return request<
      { id: string; name: string; scopes: string[]; lastUsedAt: string | null; createdAt: string }[]
    >(`/workspaces/${workspaceId}/mcp-tokens`)
  },
  createMcpToken(workspaceId: string, input: { name: string; write: boolean }) {
    return request<{
      id: string
      name: string
      scopes: string[]
      createdAt: string
      token: string
    }>(`/workspaces/${workspaceId}/mcp-tokens`, { method: 'POST', body: JSON.stringify(input) })
  },
  revokeMcpToken(workspaceId: string, tokenId: string) {
    return request(`/workspaces/${workspaceId}/mcp-tokens/${tokenId}`, { method: 'DELETE' })
  },
  async exportWorkspace(workspaceId: string) {
    const response = await fetch(`${base}/workspaces/${workspaceId}/export`, {
      credentials: 'include',
    })
    if (!response.ok) throw new Error('导出失败')
    return {
      blob: await response.blob(),
      filename:
        response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ||
        'workspace.taskharbor.zip',
    }
  },
  previewImport(file: File) {
    return upload<{
      workspaceName: string
      suggestedName: string
      counts: {
        members: number
        projects: number
        tasks: number
        documents: number
        plans: number
        assets: number
      }
    }>('/workspaces/import/preview', file)
  },
  importWorkspace(file: File) {
    return upload<{ id: string; name: string }>('/workspaces/import', file)
  },
  githubIntegration(workspaceId: string) {
    return request<{
      projectId: string
      owner: string
      repo: string
      tokenLast4: string
      syncTasks: boolean
      syncDocuments: boolean
      pullIssues: boolean
      updatedAt: string
    } | null>(`/workspaces/${workspaceId}/integrations/github`)
  },
  configureGitHub(
    workspaceId: string,
    input: {
      repoUrl: string
      token: string
      projectId: string
      syncTasks: boolean
      syncDocuments: boolean
      pullIssues: boolean
    },
  ) {
    return request(`/workspaces/${workspaceId}/integrations/github`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
  },
  removeGitHub(workspaceId: string) {
    return request(`/workspaces/${workspaceId}/integrations/github`, { method: 'DELETE' })
  },
  pushGitHub(workspaceId: string) {
    return request<{ tasks: number; documents: number }>(
      `/workspaces/${workspaceId}/integrations/github/push`,
      { method: 'POST' },
    )
  },
  pullGitHub(workspaceId: string) {
    return request<{ imported: number; conflicts: number; disabled?: boolean }>(
      `/workspaces/${workspaceId}/integrations/github/pull`,
      { method: 'POST' },
    )
  },
  githubDiagnostics(workspaceId: string) {
    return request<{
      ok: boolean
      repository: string
      private: boolean
      issuesReadable: boolean
      repositoryWritable: boolean
      checkedAt: string
    }>(`/workspaces/${workspaceId}/integrations/github/diagnostics`)
  },
  githubConflicts(workspaceId: string) {
    return request<
      {
        id: string
        entityId: string
        remoteRef: string
        remoteData: { title: string; description: string }
        createdAt: string
        localTitle: string
      }[]
    >(`/workspaces/${workspaceId}/integrations/github/conflicts`)
  },
  githubReferences(workspaceId: string) {
    return request<{ projectId: string; items: GitHubReference[] }>(
      `/workspaces/${workspaceId}/integrations/github/references`,
    )
  },
  taskGitHubLinks(workspaceId: string, taskId: string) {
    return request<GitHubReference[]>(
      `/workspaces/${workspaceId}/integrations/github/tasks/${taskId}/links`,
    )
  },
  setTaskGitHubLinks(
    workspaceId: string,
    taskId: string,
    links: Pick<GitHubReference, 'kind' | 'number'>[],
  ) {
    return request<{ links: GitHubReference[] }>(
      `/workspaces/${workspaceId}/integrations/github/tasks/${taskId}/links`,
      { method: 'PUT', body: JSON.stringify({ links }) },
    )
  },
  resolveGitHubConflict(
    workspaceId: string,
    conflictId: string,
    resolution: 'KEEP_LOCAL' | 'USE_GITHUB',
  ) {
    return request(
      `/workspaces/${workspaceId}/integrations/github/conflicts/${conflictId}/resolve`,
      { method: 'POST', body: JSON.stringify({ resolution }) },
    )
  },
}
