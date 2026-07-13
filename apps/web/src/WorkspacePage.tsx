import { useEffect, useState } from 'react'
import { Archive, CalendarDays, CheckCircle2, CircleAlert, FolderKanban, Settings, Users } from 'lucide-react'
import type { Task } from './board'
import { api } from './api'

export type Page='overview'|'tasks'|'calendar'|'archived'|'members'|'settings'
type Props={page:Exclude<Page,'tasks'>;tasks:Task[];workspaceId:string;projectId:string;projectCount:number;user:string}

export default function WorkspacePage({page,tasks,workspaceId,projectId,projectCount,user}:Props){
  const [members,setMembers]=useState<Awaited<ReturnType<typeof api.members>>>([]),[archived,setArchived]=useState<Task[]>([]),[error,setError]=useState('')
  useEffect(()=>{if(page==='members')api.members(workspaceId).then(setMembers).catch(error=>setError(error.message));if(page==='archived')api.tasks(workspaceId,projectId,true).then(setArchived).catch(error=>setError(error.message))},[page,workspaceId,projectId])
  if(page==='overview')return <PageShell title="工作概览" subtitle="当前项目的进度与风险"><div className="metric-grid"><Metric icon={<FolderKanban/>} value={projectCount} label="项目"/><Metric icon={<CircleAlert/>} value={tasks.filter(task=>task.kind==='BUG').length} label="未归档 Bug"/><Metric icon={<CheckCircle2/>} value={tasks.length} label="任务总数"/></div><TaskRows tasks={tasks.slice(0,6)} empty="还没有任务"/></PageShell>
  if(page==='calendar')return <PageShell title="日历" subtitle="按截止日期查看任务"><TaskRows tasks={tasks.filter(task=>task.due!=='未设置').sort((a,b)=>a.due.localeCompare(b.due))} empty="暂无设置截止日期的任务"/></PageShell>
  if(page==='archived')return <PageShell title="已归档" subtitle="保留历史，不干扰当前工作"><TaskRows tasks={archived} empty="暂无归档任务"/></PageShell>
  if(page==='members')return <PageShell title="成员" subtitle="工作区成员与权限">{members.length?<div className="member-list">{members.map(member=><div key={member.id}><span className="avatar">{member.name.slice(0,2)}</span><span><strong>{member.name}</strong><small>{member.email}</small></span><b>{member.role}</b></div>)}</div>:<Empty icon={<Users/>} text={error||'暂无成员'}/>}</PageShell>
  return <PageShell title="设置" subtitle="工作区偏好与账户"><div className="settings-list"><div><Settings/><span><strong>当前账户</strong><small>{user}</small></span></div><div><FolderKanban/><span><strong>项目数量</strong><small>{projectCount} 个项目</small></span></div></div></PageShell>
}

function PageShell({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}){return <section className="secondary-page"><header><h1>{title}</h1><p>{subtitle}</p></header>{children}</section>}
function Metric({icon,value,label}:{icon:React.ReactNode;value:number;label:string}){return <div className="metric">{icon}<strong>{value}</strong><span>{label}</span></div>}
function TaskRows({tasks,empty}:{tasks:Task[];empty:string}){return tasks.length?<div className="page-task-list">{tasks.map(task=><div key={task.id}><span className={`kind kind--${task.kind.toLowerCase()}`}>{task.kind==='BUG'?'Bug':task.kind==='STORY'?'需求':'任务'}</span><strong>{task.title}</strong><small>{task.due}</small></div>)}</div>:<Empty icon={<CalendarDays/>} text={empty}/>} 
function Empty({icon,text}:{icon:React.ReactNode;text:string}){return <div className="page-empty">{icon}<span>{text}</span></div>}
