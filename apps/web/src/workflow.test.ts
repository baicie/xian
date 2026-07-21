import { describe, expect, it } from 'vitest'
import type { Task } from './board'
import { createTaskTypeFields } from './taskFields'
import { commonTransitionTargets, transitionsForTask, workflowActionLabel, type WorkflowTransition } from './workflow'

const transitions:WorkflowTransition[]=[
  {id:'start',fromColumnId:'backlog',toColumnId:'active',name:'开始开发',bugName:'开始修复',requiresComment:false,position:1000},
  {id:'submit',fromColumnId:'active',toColumnId:'review',name:'提交测试',bugName:'修复完成并提测',requiresComment:false,position:2000},
  {id:'reject',fromColumnId:'review',toColumnId:'active',name:'驳回修改',bugName:'验证失败',requiresComment:true,position:3000},
]
const task=(id:string,column:string,kind:Task['kind']='TASK'):Task=>({id,number:1,projectId:'project',title:id,description:'',kind,typeFields:createTaskTypeFields(),column,priority:'中',assignee:'未分配',assigneeId:'',due:'',tags:[],version:1})

describe('task workflow helpers',()=>{
  it('returns only transitions leaving the current state',()=>{
    expect(transitionsForTask(transitions,task('one','active')).map(item=>item.id)).toEqual(['submit'])
  })

  it('uses bug-specific action labels',()=>{
    expect(workflowActionLabel(transitions[1]!,task('bug','active','BUG'))).toBe('修复完成并提测')
  })

  it('only offers comment-free targets shared by every selected task',()=>{
    expect(commonTransitionTargets(transitions,[task('one','backlog'),task('two','backlog')])).toEqual(['active'])
    expect(commonTransitionTargets(transitions,[task('one','backlog'),task('two','active')])).toEqual([])
    expect(commonTransitionTargets(transitions,[task('one','review')])).toEqual([])
  })
})
