import type { Task } from './board'

export type WorkflowTemplateKey='SIMPLE'|'DELIVERY'|'RELEASE'
export type WorkflowStateType='BACKLOG'|'ACTIVE'|'REVIEW'|'DONE'
export type WorkflowColumn={id:string;key:string;name:string;color:string;stateType:WorkflowStateType;position:number}
export type WorkflowTransition={id:string;fromColumnId:string;toColumnId:string;name:string;bugName:string;requiresComment:boolean;position:number}
export type ProjectWorkflow={template:WorkflowTemplateKey|'CUSTOM';columns:WorkflowColumn[];transitions:WorkflowTransition[]}
export type TaskTransitionEvent={id:number;fromColumnId:string;fromColumnName:string;toColumnId:string;toColumnName:string;actionName:string;comment:string|null;createdAt:string;actor:string}

export const workflowTemplateOptions:{value:WorkflowTemplateKey;name:string;description:string}[]=[
  {value:'SIMPLE',name:'轻量看板',description:'待处理、进行中、已完成'},
  {value:'DELIVERY',name:'研发交付',description:'开发、提测、验收与驳回'},
  {value:'RELEASE',name:'完整研发',description:'开发、测试、待发布与完成'},
]

export const transitionsForTask=(transitions:WorkflowTransition[],task:Pick<Task,'column'>)=>transitions.filter(transition=>transition.fromColumnId===task.column)
export const workflowActionLabel=(transition:WorkflowTransition,task:Pick<Task,'kind'>)=>task.kind==='BUG'?transition.bugName:transition.name
export function commonTransitionTargets(transitions:WorkflowTransition[],tasks:Pick<Task,'column'>[]){
  if(!tasks.length)return[]
  const allowed=tasks.map(task=>new Set(transitions.filter(transition=>transition.fromColumnId===task.column&&!transition.requiresComment).map(transition=>transition.toColumnId)))
  return [...allowed[0]!].filter(target=>allowed.every(targets=>targets.has(target)))
}
