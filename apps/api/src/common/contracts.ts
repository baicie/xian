import { z } from 'zod'

export const registerSchema = z.object({ email: z.string().email(), name: z.string().trim().min(1).max(80), password: z.string().min(10).max(128), workspaceName: z.string().trim().min(1).max(80) }).strict()
export const registerInviteSchema = z.object({ token: z.string().min(16), name: z.string().trim().min(1).max(80), password: z.string().min(10).max(128) }).strict()
export const acceptInviteSchema = z.object({ token: z.string().min(16) }).strict()
export const provisionMemberSchema = z.object({ email: z.string().email(), name: z.string().trim().min(1).max(80), role: z.enum(['ADMIN','MEMBER','VIEWER']) }).strict()
export const setupPasswordSchema = z.object({ token: z.string().min(16), password: z.string().min(10).max(128) }).strict()
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) }).strict()
export const workspaceSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict()
export const memberSchema = z.object({ email: z.string().email(), role: z.enum(['ADMIN','MEMBER','VIEWER']) }).strict()
export const projectSchema = z.object({ name: z.string().trim().min(1).max(120), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/), description: z.string().max(4000).default(''), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2367d1') }).strict()
export const taskSchema = z.object({ projectId: z.string().uuid(), columnId: z.string().uuid(), title: z.string().trim().min(1).max(300), description: z.string().max(20000).default(''), kind: z.enum(['TASK','STORY','BUG']).default('TASK'), priority: z.enum(['HIGH','MEDIUM','LOW']).default('MEDIUM'), assigneeIds: z.array(z.string().uuid()).max(20).default([]), dueDate: z.string().date().nullable().default(null), labels: z.array(z.string().trim().min(1).max(40)).max(20).default([]) }).strict()
export const taskPatchSchema = z.object({
  columnId: z.string().uuid().optional(), title: z.string().trim().min(1).max(300).optional(), description: z.string().max(20000).optional(),
  kind: z.enum(['TASK','STORY','BUG']).optional(), priority: z.enum(['HIGH','MEDIUM','LOW']).optional(), assigneeIds: z.array(z.string().uuid()).max(20).optional(),
  dueDate: z.string().date().nullable().optional(), labels: z.array(z.string().trim().min(1).max(40)).max(20).optional(), version: z.number().int().positive(),
}).strict()
const bulkTaskIds = z.array(z.string().uuid()).min(1).max(100).refine(ids => new Set(ids).size === ids.length, 'taskIds must be unique')
export const taskBulkSchema = z.object({
  taskIds: bulkTaskIds,
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('ASSIGN'), assigneeIds: z.array(z.string().uuid()).max(20) }).strict(),
    z.object({ type: z.literal('MOVE'), columnId: z.string().uuid() }).strict(),
    z.object({ type: z.literal('KIND'), kind: z.enum(['TASK', 'STORY', 'BUG']) }).strict(),
    z.object({ type: z.literal('PRIORITY'), priority: z.enum(['HIGH', 'MEDIUM', 'LOW']) }).strict(),
    z.object({ type: z.literal('DELETE') }).strict(),
  ]),
}).strict()
export const commentSchema = z.object({ body: z.string().trim().min(1).max(10000), status: z.enum(['OPEN','RESOLVED']).default('OPEN'), assetIds: z.array(z.string().uuid()).max(12).default([]) }).strict()
export const documentKindSchema = z.enum(['ARCHITECTURE', 'REQUIREMENT', 'DESIGN', 'MEETING', 'RETROSPECTIVE'])
export const documentStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
export const documentCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: documentKindSchema.default('DESIGN'),
  content: z.string().max(200000).default(''),
  projectId: z.string().uuid().nullable().default(null),
  folderId: z.string().uuid().nullable().default(null),
}).strict()
export const documentUpdateSchema = documentCreateSchema.partial().extend({
  status: documentStatusSchema.optional(),
  changeNote: z.string().trim().max(300).default(''),
  version: z.number().int().positive(),
}).strict()
export const documentFolderCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.string().uuid().nullable().default(null),
}).strict()
export const documentFolderUpdateSchema = documentFolderCreateSchema.partial().strict()
export const planItemSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20000).default(''),
  kind: z.enum(['TASK', 'STORY', 'BUG']).default('TASK'),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
}).strict()
export const planCreateSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  goal: z.string().trim().min(1).max(4000),
  items: z.array(planItemSchema).min(1).max(100),
}).strict()
export const planUpdateSchema = planCreateSchema.omit({ projectId: true }).partial().extend({ version: z.number().int().positive() }).strict()

export type ApiErrorResponse = { code: string; message: string; requestId: string; details?: Record<string, unknown> }
