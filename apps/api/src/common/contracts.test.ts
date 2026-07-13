import { describe, expect, it } from 'vitest'
import { taskSchema } from './contracts.js'

describe('task type contract',()=>{
  const base={projectId:'11111111-1111-4111-8111-111111111111',columnId:'22222222-2222-4222-8222-222222222222',title:'修复登录失败'}
  it('defaults to TASK and accepts BUG',()=>{
    expect(taskSchema.parse(base).kind).toBe('TASK')
    expect(taskSchema.parse({...base,kind:'BUG'}).kind).toBe('BUG')
  })
})
