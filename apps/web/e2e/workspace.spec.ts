import { expect, test } from '@playwright/test'

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
