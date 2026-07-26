import { createHash } from 'node:crypto'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { z } from 'zod'
import {
  ASSET_MAX_FILE_BYTES,
  ASSET_WORKSPACE_QUOTA_BYTES,
  detectAssetType,
  SUPPORTED_ASSET_CONTENT_TYPES,
} from './asset-types.js'
import { taskTypeFieldsSchema } from '../common/contracts.js'

const date = z.string()
const member = z.object({
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
})
const comment = z.object({
  body: z.string(),
  authorEmail: z.string().email(),
  createdAt: date,
  status: z.enum(['OPEN', 'RESOLVED']).default('OPEN'),
  assetSourceIds: z.array(z.string().uuid()).default([]),
})
const checklist = z.object({ title: z.string(), isDone: z.boolean(), position: z.number() })
const stateType = z.enum(['BACKLOG', 'ACTIVE', 'REVIEW', 'DONE'])
const task = z.object({
  sourceId: z.string().uuid(),
  columnSourceId: z.string().uuid(),
  iterationSourceId: z.string().uuid().nullable().default(null),
  number: z.number().int(),
  title: z.string(),
  description: z.string(),
  kind: z.enum(['TASK', 'STORY', 'BUG']),
  typeFields: taskTypeFieldsSchema.default(taskTypeFieldsSchema.parse({})),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  dueDate: z.string().nullable(),
  position: z.number(),
  version: z.number().int(),
  archived: z.boolean(),
  assigneeEmails: z.array(z.string().email()),
  labels: z.array(z.string()),
  checklist: z.array(checklist),
  comments: z.array(comment),
})
const column = z.object({
  sourceId: z.string().uuid(),
  key: z.string().optional(),
  name: z.string(),
  color: z.string(),
  stateType: stateType.optional(),
  position: z.number(),
})
const transition = z.object({
  fromColumnSourceId: z.string().uuid(),
  toColumnSourceId: z.string().uuid(),
  name: z.string(),
  bugName: z.string(),
  requiresComment: z.boolean(),
  position: z.number(),
})
const project = z.object({
  sourceId: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  description: z.string(),
  color: z.string(),
  archived: z.boolean(),
  workflowTemplate: z.enum(['SIMPLE', 'DELIVERY', 'RELEASE', 'CUSTOM']).optional(),
  columns: z.array(column),
  transitions: z.array(transition).optional(),
  tasks: z.array(task),
})
const iteration = z.object({
  sourceId: z.string().uuid(),
  projectSourceId: z.string().uuid(),
  title: z.string(),
  goal: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(['PLANNED', 'ACTIVE', 'CLOSED']),
  version: z.number().int(),
  closedAt: z.string().nullable(),
})
const retrospective = z.object({
  iterationSourceId: z.string().uuid(),
  projectSourceId: z.string().uuid(),
  snapshotState: z.enum(['CAPTURED', 'PARTIAL']),
  scopeTaskCount: z.number().int().nonnegative(),
  completedTaskCount: z.number().int().nonnegative(),
  carryOverTaskCount: z.number().int().nonnegative(),
  overdueTaskCount: z.number().int().nonnegative(),
  openBugCount: z.number().int().nonnegative(),
  blockedTaskCount: z.number().int().nonnegative(),
  summary: z.string(),
  wentWell: z.string(),
  improvements: z.string(),
  actionItems: z.string(),
  version: z.number().int().positive(),
  createdAt: date,
  updatedAt: date,
})
const dependency = z.object({
  blockerTaskSourceId: z.string().uuid(),
  blockedTaskSourceId: z.string().uuid(),
})
const documentVersion = z.object({
  version: z.number().int(),
  title: z.string(),
  kind: z.enum(['ARCHITECTURE', 'REQUIREMENT', 'DESIGN', 'MEETING', 'RETROSPECTIVE']),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  content: z.string(),
  changeNote: z.string(),
  createdAt: date,
})
const document = z.object({
  sourceId: z.string().uuid(),
  projectSourceId: z.string().uuid().nullable(),
  title: z.string(),
  kind: z.enum(['ARCHITECTURE', 'REQUIREMENT', 'DESIGN', 'MEETING', 'RETROSPECTIVE']),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  content: z.string(),
  version: z.number().int(),
  versions: z.array(documentVersion),
})
const planItem = z.object({
  position: z.number().int(),
  title: z.string(),
  description: z.string(),
  kind: z.enum(['TASK', 'STORY', 'BUG']),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  taskSourceId: z.string().uuid().nullable(),
})
const plan = z.object({
  sourceId: z.string().uuid(),
  projectSourceId: z.string().uuid(),
  title: z.string(),
  goal: z.string(),
  status: z.enum(['DRAFT', 'APPLIED']),
  source: z.string(),
  version: z.number().int(),
  items: z.array(planItem),
})
const asset = z.object({
  sourceId: z.string().uuid(),
  originalName: z.string(),
  contentType: z.enum(SUPPORTED_ASSET_CONTENT_TYPES),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().length(64),
})
const snapshotFieldsSchema = z.object({
  schemaVersion: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
  ]),
  workspace: z.object({ name: z.string() }),
  members: z.array(member),
  projects: z.array(project),
  iterations: z.array(iteration).default([]),
  retrospectives: z.array(retrospective).default([]),
  dependencies: z.array(dependency).default([]),
  documents: z.array(document),
  plans: z.array(plan),
  assets: z.array(asset).default([]),
})
export const snapshotSchema = snapshotFieldsSchema.superRefine((snapshot, context) => {
  const taskProjects = new Map<string, string>()
  for (const project of snapshot.projects)
    for (const task of project.tasks) taskProjects.set(task.sourceId, project.sourceId)

  const iterations = new Map(snapshot.iterations.map((item) => [item.sourceId, item])),
    retrospectiveIterations = new Set<string>()
  for (const [index, item] of snapshot.retrospectives.entries()) {
    const referenced = iterations.get(item.iterationSourceId),
      path = ['retrospectives', index]
    if (retrospectiveIterations.has(item.iterationSourceId))
      context.addIssue({
        code: 'custom',
        path,
        message: 'An iteration can have only one retrospective',
      })
    retrospectiveIterations.add(item.iterationSourceId)
    if (
      !referenced ||
      referenced.projectSourceId !== item.projectSourceId ||
      referenced.status !== 'CLOSED'
    )
      context.addIssue({
        code: 'custom',
        path,
        message: 'Retrospectives must reference a closed iteration in the same project',
      })
    if (item.scopeTaskCount !== item.completedTaskCount + item.carryOverTaskCount)
      context.addIssue({
        code: 'custom',
        path,
        message: 'Retrospective scope must equal completed and carried-over tasks',
      })
    if (
      item.overdueTaskCount > item.carryOverTaskCount ||
      item.openBugCount > item.carryOverTaskCount ||
      item.blockedTaskCount > item.carryOverTaskCount
    )
      context.addIssue({
        code: 'custom',
        path,
        message: 'Retrospective risk counts cannot exceed carried-over tasks',
      })
  }

  const adjacency = new Map<string, string[]>(),
    inDegree = new Map<string, number>(),
    edges = new Set<string>()
  for (const [index, dependency] of snapshot.dependencies.entries()) {
    const blockerProject = taskProjects.get(dependency.blockerTaskSourceId),
      blockedProject = taskProjects.get(dependency.blockedTaskSourceId),
      path = ['dependencies', index]
    if (dependency.blockerTaskSourceId === dependency.blockedTaskSourceId) {
      context.addIssue({ code: 'custom', path, message: 'A task cannot block itself' })
      continue
    }
    if (!blockerProject || !blockedProject || blockerProject !== blockedProject) {
      context.addIssue({
        code: 'custom',
        path,
        message: 'Task dependencies must reference tasks in the same project',
      })
      continue
    }
    const edge = `${dependency.blockerTaskSourceId}:${dependency.blockedTaskSourceId}`
    if (edges.has(edge)) {
      context.addIssue({ code: 'custom', path, message: 'Task dependencies must be unique' })
      continue
    }
    edges.add(edge)
    const dependents = adjacency.get(dependency.blockerTaskSourceId)
    if (dependents) dependents.push(dependency.blockedTaskSourceId)
    else adjacency.set(dependency.blockerTaskSourceId, [dependency.blockedTaskSourceId])
    if (!inDegree.has(dependency.blockerTaskSourceId))
      inDegree.set(dependency.blockerTaskSourceId, 0)
    inDegree.set(
      dependency.blockedTaskSourceId,
      (inDegree.get(dependency.blockedTaskSourceId) ?? 0) + 1,
    )
  }

  const queue = [...inDegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([taskId]) => taskId)
  let processed = 0
  for (let index = 0; index < queue.length; index++) {
    const taskId = queue[index]!
    processed++
    for (const dependentId of adjacency.get(taskId) ?? []) {
      const degree = inDegree.get(dependentId)! - 1
      inDegree.set(dependentId, degree)
      if (degree === 0) queue.push(dependentId)
    }
  }
  if (processed !== inDegree.size)
    context.addIssue({
      code: 'custom',
      path: ['dependencies'],
      message: 'Task dependencies cannot contain a cycle',
    })
})
export type WorkspaceSnapshot = z.infer<typeof snapshotSchema>

type Manifest = {
  format: 'taskharbor'
  version: 1
  exportedAt: string
  workspaceName: string
  files: { path: string; sha256: string }[]
}
const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
const csv = (rows: (string | number | null)[][]) =>
  rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? '')
          return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
        })
        .join(','),
    )
    .join('\n')
const safeName = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'document'

export function createArchive(
  snapshot: WorkspaceSnapshot,
  assetFiles: Map<string, Uint8Array> = new Map(),
) {
  const value = snapshotSchema.parse(snapshot),
    files: Record<string, Uint8Array> = {}
  files['data/workspace.json'] = strToU8(JSON.stringify(value, null, 2))
  files['csv/projects.csv'] = strToU8(
    csv([
      ['code', 'name', 'description', 'archived'],
      ...value.projects.map((project) => [
        project.code,
        project.name,
        project.description,
        String(project.archived),
      ]),
    ]),
  )
  files['csv/tasks.csv'] = strToU8(
    csv([
      ['project', 'number', 'type', 'priority', 'title', 'due_date', 'archived'],
      ...value.projects.flatMap((project) =>
        project.tasks.map((task) => [
          project.code,
          task.number,
          task.kind,
          task.priority,
          task.title,
          task.dueDate,
          String(task.archived),
        ]),
      ),
    ]),
  )
  for (const document of value.documents)
    files[`documents/${safeName(document.title)}-${document.sourceId}.md`] = strToU8(
      document.content,
    )
  for (const asset of value.assets) {
    const data = assetFiles.get(asset.sourceId)
    if (!data) throw new Error(`Asset file is missing: ${asset.originalName}`)
    if (data.length !== asset.sizeBytes || digest(data) !== asset.sha256)
      throw new Error(`Asset checksum failed: ${asset.originalName}`)
    files[`assets/${asset.sourceId}`] = data
  }
  const manifest: Manifest = {
    format: 'taskharbor',
    version: 1,
    exportedAt: new Date().toISOString(),
    workspaceName: value.workspace.name,
    files: Object.entries(files).map(([path, data]) => ({ path, sha256: digest(data) })),
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
  return zipSync(files, { level: 6 })
}

export function readArchiveBundle(data: Uint8Array) {
  if (data.length > 300 * 1024 * 1024) throw new Error('Archive exceeds 300 MB')
  let total = 0
  const files = unzipSync(data, {
    filter: (file) => {
      total += file.originalSize
      if (file.originalSize > 300 * 1024 * 1024 || total > 600 * 1024 * 1024)
        throw new Error('Archive expands beyond the safe limit')
      return true
    },
  })
  const paths = Object.keys(files)
  if (
    paths.length > 5000 ||
    paths.some((path) => path.startsWith('/') || path.split('/').includes('..'))
  )
    throw new Error('Archive contains unsafe paths')
  const manifestFile = files['manifest.json']
  if (!manifestFile) throw new Error('Archive manifest is missing')
  const manifest = z
    .object({
      format: z.literal('taskharbor'),
      version: z.literal(1),
      files: z.array(z.object({ path: z.string(), sha256: z.string().length(64) })).max(4999),
    })
    .parse(JSON.parse(strFromU8(manifestFile)))
  const expected = new Set(['manifest.json', ...manifest.files.map((file) => file.path)])
  if (paths.some((path) => !expected.has(path)) || expected.size !== paths.length)
    throw new Error('Archive file list does not match its manifest')
  for (const entry of manifest.files) {
    const file = files[entry.path]
    if (!file || digest(file) !== entry.sha256) throw new Error(`Checksum failed: ${entry.path}`)
  }
  const snapshotFile = files['data/workspace.json']
  if (!snapshotFile) throw new Error('Workspace snapshot is missing')
  const snapshot = snapshotSchema.parse(JSON.parse(strFromU8(snapshotFile))),
    assetFiles = new Map<string, Uint8Array>()
  let assetBytes = 0
  for (const asset of snapshot.assets) {
    const file = files[`assets/${asset.sourceId}`]
    if (!file || file.length !== asset.sizeBytes || digest(file) !== asset.sha256)
      throw new Error(`Asset file is invalid: ${asset.originalName}`)
    if (file.length > ASSET_MAX_FILE_BYTES)
      throw new Error(`Asset exceeds the per-file quota: ${asset.originalName}`)
    assetBytes += file.length
    if (assetBytes > ASSET_WORKSPACE_QUOTA_BYTES)
      throw new Error('Assets exceed the workspace quota')
    if (detectAssetType(asset.originalName, Buffer.from(file)) !== asset.contentType)
      throw new Error(`Asset type does not match its content: ${asset.originalName}`)
    assetFiles.set(asset.sourceId, file)
  }
  return { snapshot, assetFiles }
}

export function readArchive(data: Uint8Array) {
  return readArchiveBundle(data).snapshot
}
