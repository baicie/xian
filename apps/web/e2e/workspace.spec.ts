import { expect, test } from '@playwright/test'

test('keeps workspace routes available when the workspace has no projects', async ({ page }) => {
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    const responses: Record<string, unknown> = {
      '/api/v1/auth/me': { user: { id: 'user-1', name: '测试用户' }, csrfToken: 'csrf' },
      '/api/v1/workspaces': [{ id: 'workspace-1', name: '空工作区', slug: 'empty', role: 'OWNER' }],
      '/api/v1/workspaces/workspace-1/projects': [],
      '/api/v1/workspaces/workspace-1/members': [{ id: 'user-1', name: '测试用户', email: 'test@example.com', role: 'OWNER', disabledAt: null }],
      '/api/v1/workspaces/workspace-1/invitations': [],
      '/api/v1/auth/config': { registrationMode: 'admin_only', allowWorkspaceCreate: true, bootstrapAvailable: false },
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

test('registers a workspace, creates a task, and opens a document editor', async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', error => pageErrors.push(error))
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
  const taskDialog=page.getByRole('dialog',{name:'任务详情'})
  await taskDialog.getByLabel('任务标题').fill('登录服务异常')
  await taskDialog.getByRole('combobox',{name:'类型'}).click()
  await page.getByRole('option',{name:'Bug'}).click()
  await expect(taskDialog.getByRole('heading',{name:'缺陷信息'})).toBeVisible()
  await taskDialog.getByLabel('复现步骤 *').fill('1. 打开登录页\n2. 提交账号密码')
  await taskDialog.getByLabel('预期结果 *').fill('成功进入工作台')
  await taskDialog.getByLabel('实际结果 *').fill('提示服务异常')
  await taskDialog.getByLabel('运行环境').fill('Chrome 126 / macOS')
  await taskDialog.getByRole('combobox',{name:'类型'}).click()
  await page.getByRole('option',{name:'需求'}).click()
  await expect(taskDialog.getByLabel('用户故事')).toBeVisible()
  await expect(taskDialog.getByLabel('复现步骤 *')).not.toBeVisible()
  await taskDialog.getByRole('combobox',{name:'类型'}).click()
  await page.getByRole('option',{name:'Bug'}).click()
  await expect(taskDialog.getByLabel('复现步骤 *')).toHaveValue('1. 打开登录页\n2. 提交账号密码')
  await taskDialog.getByRole('button',{name:'保存任务'}).click()
  await expect(page.getByText('登录服务异常',{exact:true})).toBeVisible()

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
