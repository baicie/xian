import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { analyzeTaskWorkbook, parseTaskWorkbook } from './task-xlsx.js'

describe('parseTaskWorkbook', () => {
  it('imports a titled sheet whose headers start on the second row', async () => {
    const workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet('测试记录')
    sheet.addRow(['系统测试记录表'])
    sheet.addRow(['序号', '模块', '预期结果', '实际结果', '是否解决'])
    sheet.addRow([-1])
    sheet.addRow([0, '批量导入工作记录', '可以批量导入', '无该功能', '是'])
    sheet.addRow([1, ''])
    const result = await parseTaskWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()))
    expect(result).toMatchObject({ sheetName: '测试记录', headerRow: 2, ignoredRows: 2 })
    expect(result.tasks).toEqual([
      {
        title: '批量导入工作记录',
        description: '预期结果：可以批量导入\n实际结果：无该功能\n是否解决：是',
        kind: 'TASK',
        priority: 'MEDIUM',
        sourceRow: 4,
      },
    ])
  })

  it('supports common optional type and priority columns', async () => {
    const workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet('Tasks')
    sheet.addRow(['任务标题', '描述', '类型', '优先级'])
    sheet.addRow(['登录失败', '无法登录', 'Bug', '高'])
    const result = await parseTaskWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()))
    expect(result.tasks[0]).toMatchObject({
      title: '登录失败',
      kind: 'BUG',
      priority: 'HIGH',
      description: '描述：无法登录',
    })
  })

  it('previews custom column mappings, invalid rows, and duplicates', async () => {
    const workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet('自定义清单')
    sheet.addRow(['记录名称', '补充信息', '分类'])
    sheet.addRow(['发布检查', '确认数据库迁移', '需求'])
    sheet.addRow(['发布检查', '重复记录', '任务'])
    sheet.addRow(['', '缺少标题', '缺陷'])
    const result = await analyzeTaskWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()), {
      titleColumn: 0,
      descriptionColumns: [1],
      kindColumn: 2,
      priorityColumn: null,
    })
    expect(result.rows[0]).toMatchObject({
      title: '发布检查',
      kind: 'STORY',
      errors: [],
      duplicateInFile: false,
    })
    expect(result.rows[1]?.duplicateInFile).toBe(true)
    expect(result.rows[2]?.errors).toEqual(['缺少任务标题'])
  })
})
