import type { Sql, TransactionSql } from 'postgres'

export type WorkflowTemplateKey='SIMPLE'|'DELIVERY'|'RELEASE'
export type WorkflowStateType='BACKLOG'|'ACTIVE'|'REVIEW'|'DONE'
type WorkflowColumn={key:string;name:string;color:string;type:WorkflowStateType}
type WorkflowTransition={from:string;to:string;name:string;bugName:string;requiresComment?:boolean}
export type WorkflowTemplate={key:WorkflowTemplateKey;name:string;description:string;columns:WorkflowColumn[];transitions:WorkflowTransition[]}
export type StoredTransition={fromColumnId:string;toColumnId:string;name:string;bugName:string;requiresComment:boolean}

export class WorkflowTransitionError extends Error{
  constructor(readonly code:'WORKFLOW_TRANSITION_NOT_ALLOWED'|'WORKFLOW_COMMENT_REQUIRED',message:string){super(message)}
}

export function resolveTransition(transitions:StoredTransition[],fromColumnId:string,toColumnId:string,kind:'TASK'|'STORY'|'BUG',comment:string){
  const transition=transitions.find(item=>item.fromColumnId===fromColumnId&&item.toColumnId===toColumnId)
  if(!transition)throw new WorkflowTransitionError('WORKFLOW_TRANSITION_NOT_ALLOWED','当前状态不能流转到目标状态')
  const normalizedComment=comment.trim()
  if(transition.requiresComment&&!normalizedComment)throw new WorkflowTransitionError('WORKFLOW_COMMENT_REQUIRED','该状态流转必须填写原因')
  return{...transition,actionName:kind==='BUG'?transition.bugName:transition.name,comment:normalizedComment||null}
}

export const workflowTemplates:WorkflowTemplate[]=[
  {key:'SIMPLE',name:'轻量看板',description:'适合无需独立测试环节的小型工作',columns:[
    {key:'BACKLOG',name:'待处理',color:'#84908b',type:'BACKLOG'},
    {key:'ACTIVE',name:'进行中',color:'#2367d1',type:'ACTIVE'},
    {key:'DONE',name:'已完成',color:'#27825a',type:'DONE'},
  ],transitions:[
    {from:'BACKLOG',to:'ACTIVE',name:'开始处理',bugName:'开始修复'},
    {from:'ACTIVE',to:'DONE',name:'完成',bugName:'修复完成'},
  ]},
  {key:'DELIVERY',name:'研发交付',description:'开发完成后提交测试，支持验收驳回',columns:[
    {key:'BACKLOG',name:'待处理',color:'#84908b',type:'BACKLOG'},
    {key:'ACTIVE',name:'进行中',color:'#2367d1',type:'ACTIVE'},
    {key:'REVIEW',name:'待验收',color:'#d5792a',type:'REVIEW'},
    {key:'DONE',name:'已完成',color:'#27825a',type:'DONE'},
  ],transitions:[
    {from:'BACKLOG',to:'ACTIVE',name:'开始开发',bugName:'开始修复'},
    {from:'ACTIVE',to:'REVIEW',name:'提交测试',bugName:'修复完成并提测'},
    {from:'REVIEW',to:'DONE',name:'验收通过',bugName:'验证通过'},
    {from:'REVIEW',to:'ACTIVE',name:'驳回修改',bugName:'验证失败',requiresComment:true},
  ]},
  {key:'RELEASE',name:'完整研发',description:'覆盖开发、测试和待发布阶段',columns:[
    {key:'BACKLOG',name:'待处理',color:'#84908b',type:'BACKLOG'},
    {key:'DEVELOPMENT',name:'开发中',color:'#2367d1',type:'ACTIVE'},
    {key:'READY_TEST',name:'待测试',color:'#d5792a',type:'REVIEW'},
    {key:'TESTING',name:'测试中',color:'#7c5bb5',type:'REVIEW'},
    {key:'READY_RELEASE',name:'待发布',color:'#16829a',type:'REVIEW'},
    {key:'DONE',name:'已完成',color:'#27825a',type:'DONE'},
  ],transitions:[
    {from:'BACKLOG',to:'DEVELOPMENT',name:'开始开发',bugName:'开始修复'},
    {from:'DEVELOPMENT',to:'READY_TEST',name:'提交测试',bugName:'修复完成并提测'},
    {from:'READY_TEST',to:'TESTING',name:'开始测试',bugName:'开始验证'},
    {from:'TESTING',to:'READY_RELEASE',name:'测试通过',bugName:'验证通过'},
    {from:'TESTING',to:'DEVELOPMENT',name:'测试驳回',bugName:'验证失败',requiresComment:true},
    {from:'READY_RELEASE',to:'DONE',name:'确认发布',bugName:'确认发布'},
  ]},
]

export function workflowTemplate(key:WorkflowTemplateKey){return workflowTemplates.find(template=>template.key===key)!}

export async function installWorkflow(sql:Sql|TransactionSql,workspaceId:string,projectId:string,key:WorkflowTemplateKey){
  const template=workflowTemplate(key),columnIds=new Map<string,string>()
  for(const [index,column] of template.columns.entries()){
    const [created]=await sql<{id:string}[]>`INSERT INTO board_columns(workspace_id,project_id,key,name,color,state_type,position) VALUES(${workspaceId},${projectId},${column.key},${column.name},${column.color},${column.type},${(index+1)*1000}) RETURNING id`
    columnIds.set(column.key,created!.id)
  }
  for(const [index,transition] of template.transitions.entries())await sql`INSERT INTO workflow_transitions(workspace_id,project_id,from_column_id,to_column_id,name,bug_name,requires_comment,position) VALUES(${workspaceId},${projectId},${columnIds.get(transition.from)!},${columnIds.get(transition.to)!},${transition.name},${transition.bugName},${transition.requiresComment??false},${(index+1)*1000})`
}
