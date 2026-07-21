import { expect, test } from '@playwright/test'

test('keeps workspace routes available when the workspace has no projects', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const responses: Record<string, unknown> = {
      '/api/v1/auth/me': { user: { id: 'user-1', name: '测试用户' }, csrfToken: 'csrf' },
      '/api/v1/workspaces': [{ id: 'workspace-1', name: '空工作区', slug: 'empty', role: 'OWNER' }],
      '/api/v1/workspaces/workspace-1/projects': [],
      '/api/v1/workspaces/workspace-1/members': [
        {
          id: 'user-1',
          name: '测试用户',
          email: 'test@example.com',
          role: 'OWNER',
          disabledAt: null,
        },
      ],
      '/api/v1/workspaces/workspace-1/invitations': [],
      '/api/v1/auth/config': {
        registrationMode: 'admin_only',
        allowWorkspaceCreate: true,
        bootstrapAvailable: false,
      },
    }
    const body = responses[pathname]
    await route.fulfill({
      status: body === undefined ? 404 : 200,
      contentType: 'application/json',
      body: JSON.stringify(body ?? { message: `Unhandled request: ${pathname}` }),
    })
  })

  await page.goto('/members')
  await expect(page.getByRole('heading', { name: '成员' })).toBeVisible()
  await page.getByRole('link', { name: '设置' }).click()
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
})

test('opens the document context menu at the pointer position', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const responses: Record<string, unknown> = {
      '/api/v1/auth/me': { user: { id: 'user-1', name: '测试用户' }, csrfToken: 'csrf' },
      '/api/v1/workspaces': [{ id: 'workspace-1', name: '测试空间', slug: 'test', role: 'OWNER' }],
      '/api/v1/workspaces/workspace-1/projects': [],
      '/api/v1/workspaces/workspace-1/members': [
        {
          id: 'user-1',
          name: '测试用户',
          email: 'test@example.com',
          role: 'OWNER',
          disabledAt: null,
        },
      ],
      '/api/v1/workspaces/workspace-1/documents': [],
      '/api/v1/workspaces/workspace-1/documents/folders': [
        {
          id: 'folder-1',
          parentId: null,
          name: '测试文件夹',
          createdAt: '2026-07-21T00:00:00.000Z',
          updatedAt: '2026-07-21T00:00:00.000Z',
        },
      ],
      '/api/v1/auth/config': {
        registrationMode: 'admin_only',
        allowWorkspaceCreate: true,
        bootstrapAvailable: false,
      },
    }
    const body = responses[pathname]
    await route.fulfill({
      status: body === undefined ? 404 : 200,
      contentType: 'application/json',
      body: JSON.stringify(body ?? { message: `Unhandled request: ${pathname}` }),
    })
  })

  await page.goto('/documents')
  await expect(page.getByRole('heading', { name: '设计文档' })).toBeVisible()
  await page.locator('.documents-page').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished))
  })

  const folder = page.locator('.folder-row').filter({ hasText: '测试文件夹' })
  const folderBox = await folder.boundingBox()
  expect(folderBox).not.toBeNull()
  const position = { x: 80, y: 20 }
  await folder.click({ button: 'right', position })

  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem', { name: '重命名' })).toBeVisible()
  const menuBox = await menu.boundingBox()
  expect(menuBox).not.toBeNull()
  expect(menuBox!.x).toBeCloseTo(folderBox!.x + position.x, 0)
  expect(menuBox!.y).toBeCloseTo(folderBox!.y + position.y + 4, 0)

  await menu.getByRole('menuitem', { name: '删除' }).click()
  await expect(
    page.getByRole('alertdialog').getByRole('heading', { name: '确认删除' }),
  ).toBeVisible()
})

test('opens task card actions from the context menu', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const responses: Record<string, unknown> = {
      '/api/v1/auth/me': { user: { id: 'user-1', name: '测试用户' }, csrfToken: 'csrf' },
      '/api/v1/workspaces': [{ id: 'workspace-1', name: '测试空间', slug: 'test', role: 'OWNER' }],
      '/api/v1/workspaces/workspace-1/projects': [
        { id: 'project-1', name: '测试项目', code: 'TEST', color: '#2367d1' },
      ],
      '/api/v1/workspaces/workspace-1/members': [
        {
          id: 'user-1',
          name: '测试用户',
          email: 'test@example.com',
          role: 'OWNER',
          disabledAt: null,
        },
      ],
      '/api/v1/workspaces/workspace-1/projects/project-1/workflow': {
        template: 'SIMPLE',
        columns: [
          {
            id: 'todo',
            key: 'TODO',
            name: '待处理',
            color: '#8b9691',
            stateType: 'BACKLOG',
            position: 0,
          },
          {
            id: 'done',
            key: 'DONE',
            name: '已完成',
            color: '#287451',
            stateType: 'DONE',
            position: 1,
          },
        ],
        transitions: [
          {
            id: 'complete',
            fromColumnId: 'todo',
            toColumnId: 'done',
            name: '完成',
            bugName: '修复',
            requiresComment: false,
            position: 0,
          },
        ],
      },
      '/api/v1/workspaces/workspace-1/tasks': {
        data: [
          {
            id: 'task-1',
            number: 1,
            projectId: 'project-1',
            columnId: 'todo',
            title: '右键测试任务',
            description: '',
            kind: 'TASK',
            typeFields: {},
            priority: 'MEDIUM',
            dueDate: null,
            version: 1,
            subtaskDone: 0,
            subtaskTotal: 0,
            assignees: [{ id: 'user-1', name: '测试用户' }],
            labels: [],
          },
        ],
      },
      '/api/v1/auth/config': {
        registrationMode: 'admin_only',
        allowWorkspaceCreate: true,
        bootstrapAvailable: false,
      },
    }
    const body = responses[pathname]
    await route.fulfill({
      status: body === undefined ? 404 : 200,
      contentType: 'application/json',
      body: JSON.stringify(body ?? { message: `Unhandled request: ${pathname}` }),
    })
  })

  await page.goto('/projects/project-1')
  const taskCard = page.locator('.task-card').filter({ hasText: '右键测试任务' })
  await expect(taskCard).toBeVisible()
  await taskCard.click({ button: 'right' })

  const taskMenu = page.getByRole('menu')
  await expect(taskMenu.getByRole('menuitem', { name: '打开任务' })).toBeVisible()
  await expect(taskMenu.getByRole('menuitem', { name: '移动到' })).toBeVisible()
  await expect(taskMenu.getByRole('menuitem', { name: '删除任务' })).toBeVisible()
  await taskMenu.getByRole('menuitem', { name: '打开任务' }).click()
  await expect(page.getByRole('dialog', { name: '任务详情' })).toBeVisible()
  await page.keyboard.press('Escape')

  await taskCard.click({ button: 'right' })
  await page.getByRole('menu').getByRole('menuitem', { name: '删除任务' }).click()
  await expect(
    page.getByRole('alertdialog').getByRole('heading', { name: '确认删除任务？' }),
  ).toBeVisible()
})

test('registers a workspace, creates a task, and opens a document editor', async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  await page.goto('/')
  await page.getByRole('button', { name: '还没有账号？创建工作区' }).click()
  await page.getByLabel('你的名字').fill('浏览器测试')
  await page.getByLabel('工作区名称').fill(`验收空间-${unique}`)
  await page.getByLabel('邮箱').fill(`e2e-${unique}@example.com`)
  await page.getByLabel('密码').fill('browser-test-password')
  await page.getByRole('button', { name: '注册并进入' }).click()

  await expect(page.getByRole('heading', { name: '第一个项目' })).toBeVisible()
  await page.getByLabel('输入任务标题，按回车创建').fill('浏览器验收任务')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByText('浏览器验收任务', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '新建任务' }).click()
  const taskDialog = page.getByRole('dialog', { name: '任务详情' })
  await taskDialog.getByLabel('任务标题').fill('登录服务异常')
  await taskDialog.getByRole('combobox', { name: '类型' }).click()
  await page.getByRole('option', { name: 'Bug' }).click()
  await expect(taskDialog.getByRole('heading', { name: '缺陷信息' })).toBeVisible()
  await taskDialog.getByLabel('复现步骤 *').fill('1. 打开登录页\n2. 提交账号密码')
  await taskDialog.getByLabel('预期结果 *').fill('成功进入工作台')
  await taskDialog.getByLabel('实际结果 *').fill('提示服务异常')
  await taskDialog.getByLabel('运行环境').fill('Chrome 126 / macOS')
  await taskDialog.getByRole('combobox', { name: '类型' }).click()
  await page.getByRole('option', { name: '需求' }).click()
  await expect(taskDialog.getByLabel('用户故事')).toBeVisible()
  await expect(taskDialog.getByLabel('复现步骤 *')).not.toBeVisible()
  await taskDialog.getByRole('combobox', { name: '类型' }).click()
  await page.getByRole('option', { name: 'Bug' }).click()
  await expect(taskDialog.getByLabel('复现步骤 *')).toHaveValue('1. 打开登录页\n2. 提交账号密码')
  await taskDialog.getByRole('button', { name: '保存任务' }).click()
  await expect(page.getByText('登录服务异常', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: '设计文档' }).click()
  await expect(page.getByRole('heading', { name: '设计文档' })).toBeVisible()
  await page.getByRole('button', { name: '新建文档' }).click()
  const documentDialog = page.getByRole('dialog', { name: '新建设计文档' })
  await documentDialog.getByRole('textbox').first().fill('浏览器验收文档')
  await documentDialog.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByLabel('文档标题')).toHaveValue('浏览器验收文档')
  await expect(page.locator('[contenteditable="true"]')).toBeVisible()
  expect(pageErrors).toEqual([])
})
