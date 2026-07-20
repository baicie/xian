import { describe, expect, it } from 'vitest'
import { documentCreateSchema, documentUpdateSchema, planCreateSchema, taskBulkSchema, taskPatchSchema, taskSchema } from './contracts.js'

describe('task type contract',()=>{
  const base={projectId:'11111111-1111-4111-8111-111111111111',columnId:'22222222-2222-4222-8222-222222222222',title:'修复登录失败'}
  it('defaults to TASK and accepts BUG',()=>{
    expect(taskSchema.parse(base).kind).toBe('TASK')
    expect(taskSchema.parse({...base,kind:'BUG'}).kind).toBe('BUG')
  })
  it('does not inject create defaults into partial updates',()=>expect(taskPatchSchema.parse({version:1})).toEqual({version:1}))
  it('accepts bulk priority and type actions and rejects duplicate task ids',()=>{const id='33333333-3333-4333-8333-333333333333';expect(taskBulkSchema.parse({taskIds:[id],action:{type:'PRIORITY',priority:'HIGH'}}).action.type).toBe('PRIORITY');expect(taskBulkSchema.parse({taskIds:[id],action:{type:'KIND',kind:'BUG'}}).action).toEqual({type:'KIND',kind:'BUG'});expect(taskBulkSchema.safeParse({taskIds:[id,id],action:{type:'DELETE'}}).success).toBe(false)})
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
      folderId: null,
    })
  })

  it('requires the current version when updating content', () => {
    expect(documentUpdateSchema.safeParse({ content: '# 新内容' }).success).toBe(false)
    expect(documentUpdateSchema.parse({ content: '# 新内容', version: 2 }).version).toBe(2)
  })
})
