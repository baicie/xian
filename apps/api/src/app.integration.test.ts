import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NestFactory } from '@nestjs/core'
import request from 'supertest'
import type { INestApplication } from '@nestjs/common'
import { AppModule } from './app.module.js'
import { ApiErrorFilter } from './common/error.filter.js'

const binary = (res: NodeJS.ReadableStream, done: (error: Error | null, body?: Buffer) => void) => {
  const chunks: Buffer[] = []
  res.on('data', (chunk: Buffer) => chunks.push(chunk))
  res.on('end', () => done(null, Buffer.concat(chunks)))
  res.on('error', (error: Error) => done(error))
}

describe('authenticated project flow', () => {
  let app: INestApplication,
    cookie = '',
    csrf = '',
    workspaceId = '',
    projectId = '',
    columnId = '',
    columnId2 = '',
    taskId = '',
    currentUserId = '',
    version = 0
  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })
    app.setGlobalPrefix('api/v1', { exclude: ['mcp'] })
    app.useGlobalFilters(new ApiErrorFilter())
    await app.init()
  })
  afterAll(async () => app?.close())
  it('registers and logs in', async () => {
    const email = `test-${Date.now()}@example.com`,
      password = 'secure-password',
      registration = { email, password, name: '测试用户', workspaceName: '测试空间' }
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(registration).expect(201)
    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(409)
    expect(duplicate.body.code).toBe('EMAIL_EXISTS')
    const previousNodeEnv = process.env.NODE_ENV,
      previousOrigin = process.env.APP_ORIGIN
    process.env.NODE_ENV = 'production'
    process.env.APP_ORIGIN = 'http://example.com'
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201)
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN
    else process.env.APP_ORIGIN = previousOrigin
    expect(response.headers['set-cookie'][0]).not.toContain('Secure')
    cookie = response.headers['set-cookie'][0].split(';')[0]
    csrf = response.body.csrfToken
    currentUserId = response.body.user.id
    expect(cookie).toContain('session=')
  })
  it('isolates workspace resources and creates a task', async () => {
    const workspaces = await request(app.getHttpServer())
      .get('/api/v1/workspaces')
      .set('Cookie', cookie)
      .expect(200)
    workspaceId = workspaces.body[0].id
    const projects = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Cookie', cookie)
      .expect(200)
    projectId = projects.body[0].id
    const columns = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/columns`)
      .set('Cookie', cookie)
      .expect(200)
    columnId = columns.body[0].id
    columnId2 = columns.body[1].id
    const typeFields = {
      reproductionSteps: '1. 打开登录页',
      expectedResult: '成功登录',
      actualResult: '提示服务异常',
      environment: 'Chrome 126',
      severity: 'CRITICAL',
      affectedVersion: '1.8.0',
    }
    const task = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/tasks`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ projectId, columnId, title: '集成测试任务', kind: 'BUG', typeFields })
      .expect(201)
    taskId = task.body.id
    version = task.body.version
    expect(task.body.key).toBe('TEAM-1')
    const tasks = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/tasks?projectId=${projectId}`)
      .set('Cookie', cookie)
      .expect(200)
    expect(tasks.body.data).toHaveLength(1)
    expect(tasks.body.data[0].typeFields).toMatchObject(typeFields)
  })
  it('tracks, reorders, and removes subtasks', async () => {
    const first = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}/subtasks`)
        .set('Cookie', cookie)
        .set('x-csrf-token', csrf)
        .send({ title: '第一项' })
        .expect(201),
      second = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}/subtasks`)
        .set('Cookie', cookie)
        .set('x-csrf-token', csrf)
        .send({ title: '第二项' })
        .expect(201)
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}/subtasks/${second.body.id}`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ isDone: true })
      .expect(200)
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}/subtasks/reorder`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ subtaskIds: [second.body.id, first.body.id] })
      .expect(200)
    const subtasks = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}/subtasks`)
      .set('Cookie', cookie)
      .expect(200)
    expect(subtasks.body.map((item: { id: string }) => item.id)).toEqual([
      second.body.id,
      first.body.id,
    ])
    const tasks = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/tasks?projectId=${projectId}`)
      .set('Cookie', cookie)
      .expect(200)
    expect(tasks.body.data[0]).toMatchObject({ subtaskTotal: 2, subtaskDone: 1 })
    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}/subtasks/${first.body.id}`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .expect(200)
  })
  it('automatically follows created tasks and can toggle following', async () => {
    const initial = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}/watch`)
      .set('Cookie', cookie)
      .expect(200)
    expect(initial.body.watching).toBe(true)
    await request(app.getHttpServer())
      .put(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}/watch`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ watching: false })
      .expect(200)
    const changed = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}/watch`)
      .set('Cookie', cookie)
      .expect(200)
    expect(changed.body.watching).toBe(false)
    await request(app.getHttpServer())
      .put(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}/watch`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ watching: true })
      .expect(200)
  })
  it('persists task details and rejects stale concurrent updates', async () => {
    const typeFields = {
      reproductionSteps: '1. 打开登录页\n2. 提交表单',
      expectedResult: '成功登录',
      actualResult: '提示服务异常',
      environment: 'Chrome 126',
      severity: 'BLOCKER',
      affectedVersion: '1.8.0',
    }
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({
        title: '第一次更新',
        description: '验收描述',
        typeFields,
        labels: ['回归'],
        dueDate: '2026-07-20',
        version,
      })
      .expect(200)
    const listed = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/tasks?projectId=${projectId}`)
      .set('Cookie', cookie)
      .expect(200)
    expect(listed.body.data[0]).toMatchObject({
      description: '验收描述',
      typeFields,
      labels: ['回归'],
      dueDate: '2026-07-20',
    })
    const conflict = await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ title: '过期更新', version })
      .expect(409)
    expect(conflict.body.code).toBe('TASK_VERSION_CONFLICT')
  })
  it('adds repair feedback with deduplicated image and document attachments', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    const uploaded = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/assets`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .attach('file', png, { filename: 'proof.png', contentType: 'image/png' })
      .expect(201)
    const duplicate = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/assets`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .attach('file', png, { filename: 'copy.png', contentType: 'image/png' })
      .expect(201)
    expect(duplicate.body).toMatchObject({ id: uploaded.body.id, deduplicated: true })
    const pdf = Buffer.from('%PDF-1.7\n%%EOF'),
      document = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/assets`)
        .set('Cookie', cookie)
        .set('x-csrf-token', csrf)
        .attach('file', pdf, {
          filename: 'architecture.pdf',
          contentType: 'application/octet-stream',
        })
        .expect(201)
    expect(document.body.contentType).toBe('application/pdf')
    const downloaded = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/assets/${document.body.id}`)
      .set('Cookie', cookie)
      .buffer(true)
      .parse(binary)
      .expect(200)
    expect(downloaded.headers['content-disposition']).toContain('attachment')
    expect(downloaded.headers['x-content-type-options']).toBe('nosniff')
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}/comments`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({
        body: '设计文档与截图验证通过',
        status: 'RESOLVED',
        assetIds: [uploaded.body.id, document.body.id],
      })
      .expect(201)
    const comments = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}/comments`)
      .set('Cookie', cookie)
      .expect(200)
    expect(comments.body[0]).toMatchObject({ body: '设计文档与截图验证通过', status: 'RESOLVED' })
    expect(comments.body[0].assets).toHaveLength(2)
    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceId}/assets/${uploaded.body.id}`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .expect(409)
  })
  it('updates and deletes selected tasks in bulk', async () => {
    const first = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/tasks`)
        .set('Cookie', cookie)
        .set('x-csrf-token', csrf)
        .send({ projectId, columnId, title: '批量任务一' })
        .expect(201),
      second = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/tasks`)
        .set('Cookie', cookie)
        .set('x-csrf-token', csrf)
        .send({ projectId, columnId, title: '批量任务二' })
        .expect(201),
      taskIds = [first.body.id, second.body.id]
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/tasks/bulk`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ taskIds, action: { type: 'ASSIGN', assigneeIds: [currentUserId] } })
      .expect(200)
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/tasks/bulk`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ taskIds, action: { type: 'PRIORITY', priority: 'HIGH' } })
      .expect(200)
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/tasks/bulk`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ taskIds, action: { type: 'MOVE', columnId: columnId2 } })
      .expect(200)
    const listed = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/tasks?projectId=${projectId}`)
        .set('Cookie', cookie)
        .expect(200),
      changed = listed.body.data.filter((task: { id: string }) => taskIds.includes(task.id))
    expect(changed).toHaveLength(2)
    expect(
      changed.every(
        (task: { priority: string; columnId: string; assignees: { id: string }[] }) =>
          task.priority === 'HIGH' &&
          task.columnId === columnId2 &&
          task.assignees[0]?.id === currentUserId,
      ),
    ).toBe(true)
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/tasks/bulk`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ taskIds, action: { type: 'DELETE' } })
      .expect(200)
    const remaining = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/tasks?projectId=${projectId}`)
      .set('Cookie', cookie)
      .expect(200)
    expect(remaining.body.data).toHaveLength(1)
  })
  it('organizes, duplicates, and versions design documents', async () => {
    const folder = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/documents/folders`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ name: '接口方案' })
      .expect(201)
    const created = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/documents`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ title: '接口设计', projectId, folderId: folder.body.id, content: '# v1' })
      .expect(201)
    expect(created.body.folderId).toBe(folder.body.id)
    const duplicate = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/documents/${created.body.id}/duplicate`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .expect(201)
    expect(duplicate.body).toMatchObject({
      title: '接口设计 副本',
      folderId: folder.body.id,
      content: '# v1',
    })
    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceId}/documents/${duplicate.body.id}`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .expect(200)
    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/documents/${created.body.id}`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ content: '# v2', version: 1, changeNote: '补充接口' })
      .expect(200)
    expect(updated.body.version).toBe(2)
    const versions = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/documents/${created.body.id}/versions`)
      .set('Cookie', cookie)
      .expect(200)
    expect(versions.body.map((item: { version: number }) => item.version)).toEqual([2, 1])
    const conflict = await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/documents/${created.body.id}`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ content: '# stale', version: 1 })
      .expect(409)
    expect(conflict.body.code).toBe('DOCUMENT_VERSION_CONFLICT')
    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceId}/documents/folders/${folder.body.id}`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .expect(200)
    const moved = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/documents/${created.body.id}`)
      .set('Cookie', cookie)
      .expect(200)
    expect(moved.body.folderId).toBeNull()
  })
  it('applies a reviewed plan exactly once', async () => {
    const plan = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/plans`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({
        projectId,
        title: '发布计划',
        goal: '准备发布',
        items: [
          { title: '补齐回归测试', kind: 'TASK' },
          { title: '修复登录缺陷', kind: 'BUG', priority: 'HIGH' },
        ],
      })
      .expect(201)
    const first = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/plans/${plan.body.id}/apply`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .expect(201)
    const second = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/plans/${plan.body.id}/apply`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .expect(201)
    expect(first.body.taskIds).toHaveLength(2)
    expect(second.body).toMatchObject({ alreadyApplied: true, taskIds: first.body.taskIds })
    const tasks = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/tasks?projectId=${projectId}`)
      .set('Cookie', cookie)
      .expect(200)
    expect(tasks.body.data).toHaveLength(3)
  })
  it('issues a one-time MCP token and accepts Streamable HTTP initialization', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/mcp-tokens`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ name: '集成测试', write: true })
      .expect(201)
    expect(created.body.token).toMatch(/^thm_/)
    const listed = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/mcp-tokens`)
      .set('Cookie', cookie)
      .expect(200)
    expect(listed.body[0].token).toBeUndefined()
    const initialized = await request(app.getHttpServer())
      .post('/mcp')
      .set('Authorization', `Bearer ${created.body.token}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'integration-test', version: '1.0.0' },
        },
      })
      .expect(200)
    expect(initialized.body.result.serverInfo.name).toBe('task-harbor')
  })
  it('exports, previews, and restores a portable workspace archive', async () => {
    const exported = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/export`)
      .set('Cookie', cookie)
      .buffer(true)
      .parse(binary)
      .expect(200)
    expect(Buffer.isBuffer(exported.body)).toBe(true)
    const preview = await request(app.getHttpServer())
      .post('/api/v1/workspaces/import/preview')
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .attach('file', exported.body, 'workspace.taskharbor.zip')
      .expect(201)
    expect(preview.body.counts).toMatchObject({
      projects: 1,
      tasks: 3,
      documents: 1,
      plans: 1,
      assets: 2,
    })
    const restored = await request(app.getHttpServer())
      .post('/api/v1/workspaces/import')
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .attach('file', exported.body, 'workspace.taskharbor.zip')
    expect(restored.status, JSON.stringify(restored.body)).toBe(201)
    const importedProjects = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${restored.body.id}/projects`)
      .set('Cookie', cookie)
      .expect(200)
    expect(importedProjects.body).toHaveLength(1)
    const importedTasks = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${restored.body.id}/tasks?projectId=${importedProjects.body[0].id}`)
      .set('Cookie', cookie)
      .expect(200)
    expect(importedTasks.body.data).toHaveLength(3)
    const restoredTask = importedTasks.body.data.find(
      (task: { title: string }) => task.title === '第一次更新',
    )
    expect(restoredTask).toBeTruthy()
    expect(restoredTask.typeFields).toMatchObject({ severity: 'BLOCKER', affectedVersion: '1.8.0' })
    const importedComments = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${restored.body.id}/tasks/${restoredTask.id}/comments`)
      .set('Cookie', cookie)
      .expect(200)
    expect(importedComments.body[0]).toMatchObject({
      body: '设计文档与截图验证通过',
      status: 'RESOLVED',
    })
    expect(importedComments.body[0].assets).toHaveLength(2)
  })
  it('rejects a restore request without a backup file', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/workspaces/import/preview')
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .expect(400)
    expect(response.body.code).toBe('BACKUP_FILE_REQUIRED')
  })
  it('mirrors to GitHub and queues pull conflicts without overwriting local tasks', async () => {
    let issueNumber = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input),
        method = init?.method ?? 'GET'
      if (url.endsWith('/repos/baicie/task-harbor') && method === 'GET')
        return new Response(JSON.stringify({ full_name: 'baicie/task-harbor' }), { status: 200 })
      if (url.includes('/issues?'))
        return new Response(
          JSON.stringify([
            { number: 1, title: '远程修改标题', body: '远程描述', state: 'open', labels: [] },
            {
              number: 99,
              title: 'GitHub 新任务',
              body: '从 GitHub 导入',
              state: 'open',
              labels: ['bug'],
            },
          ]),
          { status: 200 },
        )
      if (url.includes('/issues') && (method === 'POST' || method === 'PATCH'))
        return new Response(
          JSON.stringify({
            number: method === 'POST' ? ++issueNumber : Number(url.split('/').pop()),
            title: 'ok',
            body: '',
            state: 'open',
            labels: [],
          }),
          { status: 200 },
        )
      if (url.includes('/contents/') && method === 'PUT')
        return new Response(JSON.stringify({ content: { sha: 'abc123' } }), { status: 200 })
      return new Response('{}', { status: 404 })
    })
    try {
      await request(app.getHttpServer())
        .put(`/api/v1/workspaces/${workspaceId}/integrations/github`)
        .set('Cookie', cookie)
        .set('x-csrf-token', csrf)
        .send({
          repoUrl: 'https://github.com/baicie/task-harbor',
          token: 'github_pat_integration_test_token',
          projectId,
        })
        .expect(200)
      const pushed = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/integrations/github/push`)
        .set('Cookie', cookie)
        .set('x-csrf-token', csrf)
        .expect(201)
      expect(pushed.body).toEqual({ tasks: 3, documents: 1 })
      const pulled = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/integrations/github/pull`)
        .set('Cookie', cookie)
        .set('x-csrf-token', csrf)
        .expect(201)
      expect(pulled.body).toEqual({ imported: 1, conflicts: 1 })
      const conflicts = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/integrations/github/conflicts`)
        .set('Cookie', cookie)
        .expect(200)
      expect(conflicts.body).toHaveLength(1)
      await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceId}/integrations/github/conflicts/${conflicts.body[0].id}/resolve`,
        )
        .set('Cookie', cookie)
        .set('x-csrf-token', csrf)
        .send({ resolution: 'KEEP_LOCAL' })
        .expect(201)
    } finally {
      fetchMock.mockRestore()
    }
  })
  it('soft deletes a project and its tasks', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceId}/projects/${projectId}`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .expect(200)
    const projects = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Cookie', cookie)
      .expect(200)
    expect(projects.body).toHaveLength(0)
    const tasks = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/tasks?projectId=${projectId}`)
      .set('Cookie', cookie)
      .expect(200)
    expect(tasks.body.data).toHaveLength(0)
  })
  it('enforces workflow transitions through the task API', async () => {
    const project = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ name: '状态流转验证', code: 'FLOW' })
      .expect(201)
    const columns = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/projects/${project.body.id}/columns`)
      .set('Cookie', cookie)
      .expect(200)
    const task = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/tasks`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ projectId: project.body.id, columnId: columns.body[0].id, title: '流程验证任务' })
      .expect(201)
    const skipped = await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/tasks/${task.body.id}`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ columnId: columns.body[2].id, version: task.body.version })
      .expect(400)
    expect(skipped.body.code).toBe('WORKFLOW_TRANSITION_NOT_ALLOWED')
    const started = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/tasks/${task.body.id}/transitions`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ toColumnId: columns.body[1].id, version: task.body.version })
      .expect(201)
    expect(started.body).toMatchObject({ columnId: columns.body[1].id, actionName: '开始开发' })
  })
})
