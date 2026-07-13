import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, CalendarDays, Check, ChevronDown, Clock3, Command, Filter, LayoutDashboard, List, LogOut, Moon, MoreHorizontal, Plus, Search, Settings, Sparkles, Sun, Trash2, Users, X } from 'lucide-react'
import { ColumnId, Priority, Task, TaskKind, filterTasks, moveTask } from './board'
import { api } from './api'
import AuthScreen from './AuthScreen'
import WorkspacePage, { Page } from './WorkspacePage'
import ChoiceSelect from './components/ChoiceSelect'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './components/ui/alert-dialog'

type Lang='zh'|'en'
type Theme='light'|'dark'
type Project={id:string;name:string;code:string;color:string}
type Workspace={id:string;name:string;slug:string;role:string}
type Member={id:string;name:string;email:string;role:string;disabledAt:string|null}
type BoardColumn={id:string;label:string;accent:string}

const copy={
  zh:{overview:'概览',myTasks:'我的任务',calendar:'日历',project:'项目',newProject:'新建项目',archived:'已归档',members:'成员',settings:'设置',loggedIn:'已登录',switchWorkspace:'切换工作区',newWorkspace:'新建工作区',account:'账户',language:'切换到 English',themeDark:'切换到深色',themeLight:'切换到浅色',logout:'退出登录',search:'搜索当前项目的任务、负责人或标签…',clearSearch:'清除搜索',viewMembers:'查看工作区成员',newTask:'新建任务',board:'看板',list:'列表',allTypes:'全部类型',task:'任务',story:'需求',bug:'Bug',tasksCount:'个任务',status:'状态',type:'类型',priority:'优先级',high:'高',medium:'中',low:'低',assignee:'负责人',due:'截止时间',tags:'标签',description:'描述',taskTitle:'任务标题',taskDetails:'任务详情',cancel:'取消',save:'保存任务',deleteProject:'删除项目',deleteTitle:'确认删除项目？',deleteDescription:'项目和其中任务将被移入软删除状态，此操作不会立即擦除数据库记录。',delete:'删除',noResults:'没有匹配的任务',emptyColumn:'把任务拖到这里',addTask:'添加任务',inProgress:'进行中',tagline:'让每一次协作都有清晰的下一步。',createFirst:'创建第一个项目'},
  en:{overview:'Overview',myTasks:'My tasks',calendar:'Calendar',project:'Projects',newProject:'New project',archived:'Archived',members:'Members',settings:'Settings',loggedIn:'Signed in',switchWorkspace:'Switch workspace',newWorkspace:'New workspace',account:'Account',language:'切换到简体中文',themeDark:'Use dark theme',themeLight:'Use light theme',logout:'Sign out',search:'Search tasks, assignees, or tags in this project…',clearSearch:'Clear search',viewMembers:'View workspace members',newTask:'New task',board:'Board',list:'List',allTypes:'All types',task:'Task',story:'Story',bug:'Bug',tasksCount:'tasks',status:'Status',type:'Type',priority:'Priority',high:'High',medium:'Medium',low:'Low',assignee:'Assignee',due:'Due date',tags:'Tags',description:'Description',taskTitle:'Task title',taskDetails:'Task details',cancel:'Cancel',save:'Save task',deleteProject:'Delete project',deleteTitle:'Delete this project?',deleteDescription:'The project and its tasks will be soft deleted. Database records are retained for safety.',delete:'Delete',noResults:'No matching tasks',emptyColumn:'Drop tasks here',addTask:'Add task',inProgress:'Active',tagline:'Give every collaboration a clear next step.',createFirst:'Create first project'},
} as const
type Copy={ [K in keyof typeof copy.zh]:string }

function Avatar({name,small=false}:{name:string;small?:boolean}){return <span className={`avatar${small?' avatar--small':''}`} title={name}>{name.trim().slice(0,2).toUpperCase()}</span>}

function Sidebar({workspaces,workspaceId,onWorkspace,onNewWorkspace,projects,page,onNavigate,activeProject,setActiveProject,onNewProject,onDeleteProject,taskCount,user,members,lang,setLang,theme,setTheme,onLogout,t}:{workspaces:Workspace[];workspaceId:string;onWorkspace:(id:string)=>void;onNewWorkspace:()=>void;projects:Project[];page:Page;onNavigate:(page:Page)=>void;activeProject:number;setActiveProject:(index:number)=>void;onNewProject:()=>void;onDeleteProject:(project:Project)=>void;taskCount:number;user:string;members:Member[];lang:Lang;setLang:(lang:Lang)=>void;theme:Theme;setTheme:(theme:Theme)=>void;onLogout:()=>void;t:Copy}){
  const workspace=workspaces.find(item=>item.id===workspaceId)
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark">闲</span><DropdownMenu><DropdownMenuTrigger render={<button className="workspace-trigger" aria-label={t.switchWorkspace}/>}>{workspace?.name??'闲序'}<ChevronDown/></DropdownMenuTrigger><DropdownMenuContent side="right" align="start"><DropdownMenuGroup><DropdownMenuLabel>{t.switchWorkspace}</DropdownMenuLabel>{workspaces.map(item=><DropdownMenuItem key={item.id} onClick={()=>onWorkspace(item.id)}>{item.id===workspaceId?<Check/>:null}{item.name}</DropdownMenuItem>)}</DropdownMenuGroup><DropdownMenuSeparator/><DropdownMenuGroup><DropdownMenuItem onClick={onNewWorkspace}><Plus/>{t.newWorkspace}</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></div>
    <nav aria-label="主导航">
      <p className="nav-label">{t.switchWorkspace}</p>
      <button className={`nav-item ${page==='overview'?'active':''}`} onClick={()=>onNavigate('overview')}><LayoutDashboard/>{t.overview}</button>
      <button className={`nav-item ${page==='tasks'?'active':''}`} onClick={()=>onNavigate('tasks')}><Command/>{t.myTasks}<span className="count">{taskCount}</span></button>
      <button className={`nav-item ${page==='calendar'?'active':''}`} onClick={()=>onNavigate('calendar')}><CalendarDays/>{t.calendar}</button>
      <p className="nav-label nav-label--project">{t.project}<button aria-label={t.newProject} onClick={onNewProject}><Plus/></button></p>
      {projects.map((project,index)=><div className="project-row" key={project.id}><button className={`project-link ${index===activeProject?'selected':''}`} onClick={()=>setActiveProject(index)}><span className="project-dot" style={{background:project.color}}/>{project.name}</button><DropdownMenu><DropdownMenuTrigger render={<button className="project-menu-trigger" aria-label={`${project.name} ${t.settings}`}/>}><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent side="right" align="start"><DropdownMenuGroup><DropdownMenuItem variant="destructive" onClick={()=>onDeleteProject(project)}><Trash2/>{t.deleteProject}</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></div>)}
      <button className={`nav-item ${page==='archived'?'active':''}`} onClick={()=>onNavigate('archived')}><Archive/>{t.archived}</button>
    </nav>
    <div className="sidebar-bottom">
      <button className={`nav-item ${page==='members'?'active':''}`} onClick={()=>onNavigate('members')}><Users/>{t.members}</button>
      <button className={`nav-item ${page==='settings'?'active':''}`} onClick={()=>onNavigate('settings')}><Settings/>{t.settings}</button>
      <DropdownMenu><DropdownMenuTrigger render={<button className="profile" aria-label={t.account}/>}><Avatar name={user}/><span><strong>{user}</strong><small>{t.loggedIn}</small></span><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent side="right" align="end"><DropdownMenuGroup><DropdownMenuLabel>{t.account}</DropdownMenuLabel><DropdownMenuItem onClick={()=>onNavigate('settings')}><Settings/>{t.settings}</DropdownMenuItem><DropdownMenuItem onClick={()=>setLang(lang==='zh'?'en':'zh')}><span className="menu-icon">文</span>{t.language}</DropdownMenuItem><DropdownMenuItem onClick={()=>setTheme(theme==='light'?'dark':'light')}>{theme==='light'?<Moon/>:<Sun/>}{theme==='light'?t.themeDark:t.themeLight}</DropdownMenuItem></DropdownMenuGroup><DropdownMenuSeparator/><DropdownMenuGroup><DropdownMenuItem variant="destructive" onClick={onLogout}><LogOut/>{t.logout}</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
    </div>
  </aside>
}

function TaskCard({task,columns,onMove,onEdit,t}:{task:Task;columns:BoardColumn[];onMove:(id:string,column:ColumnId)=>void;onEdit:(task:Task)=>void;t:Copy}){
  const [dragging,setDragging]=useState(false)
  return <article className={`task-card ${dragging?'dragging':''}`} draggable onDragStart={event=>{setDragging(true);event.dataTransfer.setData('text/plain',String(task.id))}} onDragEnd={()=>setDragging(false)} onClick={()=>onEdit(task)}>
    <div className="task-top"><span className={`priority priority--${task.priority}`}>{({高:t.high,中:t.medium,低:t.low} as Record<Priority,string>)[task.priority]} {t.priority}</span><span className={`kind kind--${task.kind.toLowerCase()}`}>{task.kind==='BUG'?t.bug:task.kind==='STORY'?t.story:t.task}</span></div>
    <h3>{task.title}</h3><div className="tags">{task.tags.map(tag=><span key={tag}>{tag}</span>)}</div>
    <div className="task-meta"><span className={task.due==='今天'?'due-today':''}><Clock3/>{task.due}</span><Avatar name={task.assignee} small/></div>
    <div className="card-status" onClick={event=>event.stopPropagation()}><ChoiceSelect label={`${t.status} ${task.title}`} value={task.column} options={columns.map(column=>({value:column.id,label:column.label}))} onChange={column=>onMove(task.id,column)} className="card-status-select"/></div>
  </article>
}

function TaskDialog({task,columns,members,code,onClose,onSave,t}:{task:Task|null;columns:BoardColumn[];members:Member[];code:string;onClose:()=>void;onSave:(task:Task)=>void;t:Copy}){
  const [draft,setDraft]=useState<Task|null>(task)
  useEffect(()=>setDraft(task),[task])
  if(!draft)return null
  const submit=(event:FormEvent)=>{event.preventDefault();onSave(draft)}
  const people=members.length?members.map(member=>member.name):[draft.assignee]
  return <div className="dialog-backdrop" role="presentation" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><form className="dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title" onSubmit={submit}>
    <div className="dialog-head"><div><small>{code}-{draft.number||'NEW'}</small><h2 id="task-dialog-title">{t.taskDetails}</h2></div><button type="button" aria-label="关闭" onClick={onClose}><X/></button></div>
    <label>{t.taskTitle}<input autoFocus required value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})}/></label>
    <div className="form-grid">
      <label>{t.type}<ChoiceSelect label={t.type} value={draft.kind} options={[{value:'TASK',label:t.task},{value:'STORY',label:t.story},{value:'BUG',label:t.bug}]} onChange={kind=>setDraft({...draft,kind})} className="choice-select"/></label>
      <label>{t.status}<ChoiceSelect label={t.status} value={draft.column} options={columns.map(column=>({value:column.id,label:column.label}))} onChange={column=>setDraft({...draft,column})} className="choice-select"/></label>
      <label>{t.priority}<ChoiceSelect label={t.priority} value={draft.priority} options={[{value:'高',label:t.high},{value:'中',label:t.medium},{value:'低',label:t.low}]} onChange={priority=>setDraft({...draft,priority})} className="choice-select"/></label>
      <label>{t.assignee}<ChoiceSelect label={t.assignee} value={draft.assignee} options={people.map(value=>({value,label:value}))} onChange={assignee=>setDraft({...draft,assignee})} className="choice-select"/></label>
      <label>{t.due}<input value={draft.due} onChange={event=>setDraft({...draft,due:event.target.value})}/></label>
    </div>
    <label>{t.tags}<input value={draft.tags.join('、')} onChange={event=>setDraft({...draft,tags:event.target.value.split(/[、,，]/).filter(Boolean)})}/></label>
    <label>{t.description}<textarea placeholder="补充任务背景、验收标准或相关链接…" rows={5}/></label>
    <div className="dialog-actions"><button type="button" className="button ghost" onClick={onClose}>{t.cancel}</button><button className="button primary"><Check/>{t.save}</button></div>
  </form></div>
}

export default function App(){
  const [auth,setAuth]=useState<'loading'|'out'|'in'>('loading'),[user,setUser]=useState('')
  const [workspaces,setWorkspaces]=useState<Workspace[]>([]),[workspaceId,setWorkspaceId]=useState(''),[projects,setProjects]=useState<Project[]>([]),[members,setMembers]=useState<Member[]>([]),[columns,setColumns]=useState<BoardColumn[]>([])
  const [tasks,setTasks]=useState<Task[]>([]),[error,setError]=useState(''),[query,setQuery]=useState(''),[kind,setKind]=useState<'ALL'|TaskKind>('ALL')
  const [page,setPage]=useState<Page>('tasks'),[activeProject,setActiveProject]=useState(0),[view,setView]=useState<'board'|'list'>('board'),[editing,setEditing]=useState<Task|null>(null),[deleting,setDeleting]=useState<Project|null>(null)
  const [lang,setLang]=useState<Lang>(()=>(localStorage.getItem('lang') as Lang)||'zh'),[theme,setTheme]=useState<Theme>(()=>(localStorage.getItem('theme') as Theme)||'light')
  const searchRef=useRef<HTMLInputElement>(null),t:Copy=copy[lang]

  const loadWorkspace=async(id:string)=>{const [nextProjects,nextMembers]=await Promise.all([api.projects(id),api.members(id)]);setWorkspaceId(id);setProjects(nextProjects);setMembers(nextMembers);setActiveProject(0);setTasks([]);setQuery('');setPage('tasks')}
  const boot=async()=>{try{const me=await api.me();setUser(me.user.name);const next=await api.workspaces();setWorkspaces(next);if(!next[0])throw new Error('请先创建工作区');await loadWorkspace(next[0].id);setAuth('in')}catch{setAuth('out')}}
  useEffect(()=>{void boot()},[])
  useEffect(()=>{document.documentElement.lang=lang==='zh'?'zh-CN':'en';localStorage.setItem('lang',lang)},[lang])
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('theme',theme)},[theme])
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();searchRef.current?.focus()}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[])
  useEffect(()=>{const project=projects[activeProject];if(!project||!workspaceId)return;setError('');Promise.all([api.columns(workspaceId,project.id),api.tasks(workspaceId,project.id)]).then(([nextColumns,nextTasks])=>{setColumns(nextColumns.map(column=>({id:column.id,label:column.name,accent:column.color})));setTasks(nextTasks)}).catch(reason=>setError(reason.message))},[workspaceId,projects,activeProject])

  const shownTasks=useMemo(()=>filterTasks(tasks,query).filter(task=>kind==='ALL'||task.kind===kind),[tasks,query,kind])
  const project=projects[activeProject]
  const reload=async()=>{if(project)setTasks(await api.tasks(workspaceId,project.id))}
  const updateTask=async(next:Task)=>{try{if(next.id==='new')await api.createTask(workspaceId,next);else await api.updateTask(workspaceId,next);setEditing(null);await reload()}catch(reason){setError(reason instanceof Error?reason.message:'保存失败')}}
  const createTask=()=>{const column=columns[0];if(project&&column)setEditing({id:'new',number:0,projectId:project.id,title:'',kind:'TASK',column:column.id,priority:'中',assignee:user,due:'未设置',tags:[],version:1})}
  const move=async(id:string,column:ColumnId)=>{const task=tasks.find(item=>item.id===id);if(!task)return;setTasks(current=>moveTask(current,id,column));try{const result=await api.updateTask(workspaceId,{...task,column});setTasks(current=>current.map(item=>item.id===id?{...item,column,version:result.version}:item))}catch(reason){setTasks(current=>moveTask(current,id,task.column));setError(reason instanceof Error?reason.message:'移动失败')}}
  const newProject=async()=>{const name=window.prompt(t.newProject);if(!name)return;const code=(window.prompt('项目代码（2-8位字母或数字）',name.slice(0,4).toUpperCase())||'').toUpperCase();if(!code)return;try{await api.createProject(workspaceId,{name,code});const next=await api.projects(workspaceId);setProjects(next);setActiveProject(next.length-1)}catch(reason){setError(reason instanceof Error?reason.message:'创建失败')}}
  const newWorkspace=async()=>{const name=window.prompt(t.newWorkspace);if(!name)return;try{const workspace=await api.createWorkspace(name);await api.createProject(workspace.id,{name:lang==='zh'?'第一个项目':'First project',code:'TEAM'});const next=await api.workspaces();setWorkspaces(next);await loadWorkspace(workspace.id)}catch(reason){setError(reason instanceof Error?reason.message:'创建失败')}}
  const selectWorkspace=async(id:string)=>{try{await loadWorkspace(id)}catch(reason){setError(reason instanceof Error?reason.message:'切换失败')}}
  const deleteProject=async()=>{if(!deleting)return;try{await api.deleteProject(workspaceId,deleting.id);setDeleting(null);setActiveProject(0);setProjects(await api.projects(workspaceId))}catch(reason){setError(reason instanceof Error?reason.message:'删除失败')}}
  const logout=async()=>{try{await api.logout()}finally{setAuth('out');setTasks([]);setProjects([]);setWorkspaces([])}}

  if(auth==='loading')return <main className="boot">正在连接工作区…</main>
  if(auth==='out')return <AuthScreen onReady={()=>void boot()}/>
  const sidebar=<Sidebar workspaces={workspaces} workspaceId={workspaceId} onWorkspace={id=>void selectWorkspace(id)} onNewWorkspace={()=>void newWorkspace()} projects={projects} page={page} onNavigate={setPage} activeProject={activeProject} setActiveProject={index=>{setActiveProject(index);setPage('tasks')}} onNewProject={()=>void newProject()} onDeleteProject={setDeleting} taskCount={tasks.length} user={user} members={members} lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} onLogout={()=>void logout()} t={t}/>

  return <div className="app-shell">{sidebar}<main className="workspace">
    <header className="topbar"><div className="search"><Search/><input ref={searchRef} type="search" aria-label={t.search} value={query} onChange={event=>{setQuery(event.target.value);if(event.target.value)setPage('tasks')}} placeholder={t.search}/>{query?<button aria-label={t.clearSearch} onClick={()=>setQuery('')}><X/></button>:<kbd>⌘ K</kbd>}</div>{members.length?<button className="member-stack" aria-label={t.viewMembers} onClick={()=>setPage('members')}>{members.slice(0,3).map(member=><Avatar name={member.name} small key={member.id}/>)}{members.length>3?<span>+{members.length-3}</span>:null}</button>:null}</header>
    {!project?<section className="boot"><button className="button primary" onClick={()=>void newProject()}>{t.createFirst}</button></section>:page==='tasks'?<>
      <section className="page-head"><div className="breadcrumbs"><span>{t.project}</span><b>/</b><span>{project.name}</span></div><div className="title-row"><div><span className="eyebrow">{project.code} · {t.inProgress}</span><h1>{project.name}</h1><p>{t.tagline}</p></div><button className="button primary" onClick={createTask}><Plus/>{t.newTask}</button></div>{error?<p className="page-error" role="alert">{error}</p>:null}</section>
      <section className="toolbar"><div className="view-switch"><button className={view==='board'?'on':''} onClick={()=>setView('board')}><LayoutDashboard/>{t.board}</button><button className={view==='list'?'on':''} onClick={()=>setView('list')}><List/>{t.list}</button></div><div className="filters"><Filter/><ChoiceSelect label={t.type} value={kind} options={[{value:'ALL',label:t.allTypes},{value:'TASK',label:t.task},{value:'STORY',label:t.story},{value:'BUG',label:t.bug}]} onChange={setKind} className="filter-select"/><span aria-live="polite">{shownTasks.length} {t.tasksCount}</span></div></section>
      {query&&shownTasks.length===0?<div className="search-empty" role="status"><Search/><strong>{t.noResults}</strong><button onClick={()=>setQuery('')}>{t.clearSearch}</button></div>:view==='board'?<section className="board">{columns.map(column=>{const columnTasks=shownTasks.filter(task=>task.column===column.id);return <div className="column" key={column.id} onDragOver={event=>event.preventDefault()} onDrop={event=>void move(event.dataTransfer.getData('text/plain'),column.id)}><div className="column-head"><span className="status-dot" style={{background:column.accent}}/><h2>{column.label}</h2><span>{columnTasks.length}</span><button aria-label={`${t.addTask} ${column.label}`} onClick={createTask}><Plus/></button></div><div className="task-list">{columnTasks.map(task=><TaskCard key={task.id} task={task} columns={columns} onMove={(id,column)=>void move(id,column)} onEdit={setEditing} t={t}/>)}{columnTasks.length===0?<div className="empty"><Sparkles/><span>{t.emptyColumn}</span></div>:null}</div><button className="add-inline" onClick={createTask}><Plus/>{t.addTask}</button></div>})}</section>:<section className="list-view"><div className="list-head"><span>{t.task}</span><span>{t.status}</span><span>{t.assignee}</span><span>{t.due}</span></div>{shownTasks.map(task=><button key={task.id} onClick={()=>setEditing(task)}><span><b>{project.code}-{task.number}</b>{task.title}</span><span>{columns.find(column=>column.id===task.column)?.label}</span><span><Avatar name={task.assignee} small/>{task.assignee}</span><span>{task.due}</span></button>)}</section>}
    </>:<WorkspacePage page={page} tasks={tasks} workspaceId={workspaceId} projectId={project.id} projectCount={projects.length} user={user} lang={lang}/>}
  </main>{project?<TaskDialog task={editing} columns={columns} members={members} code={project.code} onClose={()=>setEditing(null)} onSave={task=>void updateTask(task)} t={t}/>:null}
  <AlertDialog open={Boolean(deleting)} onOpenChange={open=>!open&&setDeleting(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle><AlertDialogDescription><strong>{deleting?.name}</strong><br/>{t.deleteDescription}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t.cancel}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={()=>void deleteProject()}>{t.delete}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}
