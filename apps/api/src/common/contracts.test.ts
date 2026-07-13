import { describe, expect, it } from 'vitest'
import { documentCreateSchema, documentUpdateSchema, planCreateSchema, taskSchema } from './contracts.js'

describe('task type contract',()=>{
  const base={projectId:'11111111-1111-4111-8111-111111111111',columnId:'22222222-2222-4222-8222-222222222222',title:'修复登录失败'}
  it('defaults to TASK and accepts BUG',()=>{
    expect(taskSchema.parse(base).kind).toBe('TASK')
    expect(taskSchema.parse({...base,kind:'BUG'}).kind).toBe('BUG')
  })
})

describe('plan contract', () => {
  it('requires at least one bounded plan item', () => {
    const input={projectId:'4b55d43e-7dd1-47a7-814c-2210f788468b',title:'发布计划',goal:'按期发布',items:[{title:'完成验收'}]}
    expect(planCreateSchema.parse(input).items[0]).toMatchObject({kind:'TASK',priority:'MEDIUM'})
    expect(planCreateSchema.safeParse({...input,items:[]}).success).toBe(false)
  })
})

describe('document contracts', () => {
  it('normalizes a new design document', () => {
    expect(documentCreateSchema.parse({ title: ' API 设计 ' })).toEqual({
      title: 'API 设计',
      kind: 'DESIGN',
      content: '',
      projectId: null,
    })
  })

  it('requires the current version when updating content', () => {
    expect(documentUpdateSchema.safeParse({ content: '# 新内容' }).success).toBe(false)
    expect(documentUpdateSchema.parse({ content: '# 新内容', version: 2 }).version).toBe(2)
  })
})
