import { useEffect, useState } from 'react'
import { ArrowRight, GitCommitHorizontal, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { Task } from '../../board'
import { api } from '../../api'
import { transitionsForTask, workflowActionLabel, type WorkflowColumn, type WorkflowTransition } from '../../workflow'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Field, FieldLabel } from '../../components/ui/field'
import { Textarea } from '../../components/ui/textarea'

export default function TaskWorkflow({workspaceId,task,columns,transitions,en,onTransition}:{workspaceId:string;task:Task;columns:WorkflowColumn[];transitions:WorkflowTransition[];en:boolean;onTransition:(transition:WorkflowTransition,comment:string)=>Promise<void>}){
  const [history,setHistory]=useState<Awaited<ReturnType<typeof api.taskTransitions>>>([]),[pending,setPending]=useState<WorkflowTransition|null>(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false)
  const available=transitionsForTask(transitions,task),current=columns.find(column=>column.id===task.column)
  useEffect(()=>{let active=true;api.taskTransitions(workspaceId,task.id).then(items=>active&&setHistory(items)).catch(()=>active&&setHistory([]));return()=>{active=false}},[workspaceId,task.id])
  const run=async(transition:WorkflowTransition,comment='')=>{setBusy(true);try{await onTransition(transition,comment);setPending(null);setReason('')}catch(error){toast.error(error instanceof Error?error.message:(en?'Transition failed':'状态流转失败'))}finally{setBusy(false)}}
  return <section className="task-workflow" aria-label={en?'Task workflow':'任务流程'}>
    <header><span><small>{en?'Current status':'当前状态'}</small><Badge variant="secondary">{current?.name??'-'}</Badge></span>{available.length?<div className="workflow-actions">{available.map(transition=><Button key={transition.id} type="button" size="sm" variant={transition.requiresComment?'outline':'default'} disabled={busy} onClick={()=>transition.requiresComment?setPending(transition):void run(transition)}>{transition.requiresComment?<RotateCcw data-icon="inline-start"/>:<ArrowRight data-icon="inline-start"/>}{workflowActionLabel(transition,task)}</Button>)}</div>:<small>{en?'No further actions':'当前没有可执行动作'}</small>}</header>
    {history.length?<div className="workflow-history"><strong><GitCommitHorizontal/>{en?'Recent transitions':'最近流转'}</strong>{history.slice(0,5).map(event=><div key={event.id}><span><b>{event.actionName}</b><small>{event.actor} · {new Date(event.createdAt).toLocaleString(en?'en-US':'zh-CN')}</small></span><span>{event.fromColumnName}<ArrowRight/>{event.toColumnName}</span>{event.comment?<p>{event.comment}</p>:null}</div>)}</div>:null}
    <AlertDialog open={Boolean(pending)} onOpenChange={open=>{if(!open&&!busy){setPending(null);setReason('')}}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{pending?workflowActionLabel(pending,task):''}</AlertDialogTitle><AlertDialogDescription>{en?'Record why this work needs to return.':'记录本次驳回原因，便于负责人修改和重新提测。'}</AlertDialogDescription></AlertDialogHeader><Field><FieldLabel htmlFor="workflow-reason">{en?'Reason':'驳回原因'}</FieldLabel><Textarea id="workflow-reason" autoFocus rows={4} maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)} placeholder={en?'Describe what did not pass...':'说明未通过项或需要修改的内容…'}/></Field><AlertDialogFooter><AlertDialogCancel disabled={busy}>{en?'Cancel':'取消'}</AlertDialogCancel><AlertDialogAction disabled={busy||!reason.trim()} onClick={()=>pending&&void run(pending,reason)}>{busy?(en?'Submitting...':'提交中…'):(en?'Confirm return':'确认驳回')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>
}
