import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Archive, Bell, CalendarDays, Check, ChevronDown, CircleHelp, Clock3,
  Command, Filter, LayoutDashboard, List, MoreHorizontal, Plus, Search,
  Settings, SlidersHorizontal, Sparkles, Users, X,
} from 'lucide-react'
import { ColumnId, Priority, Task, TaskKind, filterTasks, moveTask } from './board'
import { api } from './api'
import AuthScreen from './AuthScreen'
import WorkspacePage, { Page } from './WorkspacePage'

const people: Record<string, string> = { '林默': 'LM', '周屿': 'ZY', '陈鹿': 'CL', '沈括': 'SK' }
type Project={id:string;name:string;code:string;color:string}
type BoardColumn={id:string;label:string;accent:string}

function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return <span className={`avatar${small ? ' avatar--small' : ''}`} title={name}>{people[name] ?? name.slice(0, 2)}</span>
}

function Sidebar({ projects,page,onNavigate,activeProject,setActiveProject,onNewProject,taskCount,user }: { projects:Project[];page:Page;onNavigate:(page:Page)=>void;activeProject:number;setActiveProject:(index:number)=>void;onNewProject:()=>void;taskCount:number;user:string }) {
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark">闲</span><span>闲序</span><button aria-label="切换工作区"><ChevronDown size={15} /></button></div>
    <nav aria-label="主导航">
      <p className="nav-label">工作区</p>
      <button className={`nav-item ${page==='overview'?'active':''}`} onClick={()=>onNavigate('overview')}><LayoutDashboard size={17} />概览</button>
      <button className={`nav-item ${page==='tasks'?'active':''}`} onClick={()=>onNavigate('tasks')}><Command size={17} />我的任务<span className="count">{taskCount}</span></button>
      <button className={`nav-item ${page==='calendar'?'active':''}`} onClick={()=>onNavigate('calendar')}><CalendarDays size={17} />日历</button>
      <p className="nav-label nav-label--project">项目 <button aria-label="新建项目" onClick={onNewProject}><Plus size={14} /></button></p>
      {projects.map((project, index) => <button className={`project-link ${index === activeProject ? 'selected' : ''}`} key={project.code} onClick={() => setActiveProject(index)}>
        <span className="project-dot" style={{ background: project.color }} />{project.name}
      </button>)}
      <button className={`nav-item ${page==='archived'?'active':''}`} onClick={()=>onNavigate('archived')}><Archive size={17} />已归档</button>
    </nav>
    <div className="sidebar-bottom">
      <button className={`nav-item ${page==='members'?'active':''}`} onClick={()=>onNavigate('members')}><Users size={17} />成员</button><button className={`nav-item ${page==='settings'?'active':''}`} onClick={()=>onNavigate('settings')}><Settings size={17} />设置</button>
      <div className="profile"><Avatar name={user} /><div><strong>{user}</strong><small>已登录</small></div><MoreHorizontal size={17} /></div>
    </div>
  </aside>
}

function TaskCard({ task, columns, onMove, onEdit }: { task:Task;columns:BoardColumn[];onMove:(id:string,column:ColumnId)=>void;onEdit:(task:Task)=>void }) {
  const [dragging, setDragging] = useState(false)
  return <article className={`task-card ${dragging ? 'dragging' : ''}`} draggable onDragStart={(event) => { setDragging(true); event.dataTransfer.setData('text/plain', String(task.id)) }} onDragEnd={() => setDragging(false)} onClick={() => onEdit(task)}>
    <div className="task-top"><span className={`priority priority--${task.priority}`}>{task.priority}优先级</span><button aria-label="任务菜单" onClick={(event) => event.stopPropagation()}><MoreHorizontal size={17} /></button></div>
    <span className={`kind kind--${task.kind.toLowerCase()}`}>{task.kind==='BUG'?'Bug':task.kind==='STORY'?'需求':'任务'}</span>
    <h3>{task.title}</h3>
    <div className="tags">{task.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
    <div className="task-meta"><span className={task.due === '今天' ? 'due-today' : ''}><Clock3 size={14} />{task.due}</span><Avatar name={task.assignee} small /></div>
    <select aria-label={`移动任务 ${task.title}`} value={task.column} onClick={(event) => event.stopPropagation()} onChange={(event) => onMove(task.id, event.target.value as ColumnId)}>
      {columns.map((column) => <option value={column.id} key={column.id}>{column.label}</option>)}
    </select>
  </article>
}

function TaskDialog({ task, columns, code, onClose, onSave }: { task:Task|null;columns:BoardColumn[];code:string;onClose:()=>void;onSave:(task:Task)=>void }) {
  const [draft, setDraft] = useState<Task | null>(task)
  useEffect(() => setDraft(task), [task])
  if (!draft) return null
  const submit = (event: FormEvent) => { event.preventDefault(); onSave(draft) }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title" onSubmit={submit}>
      <div className="dialog-head"><div><small>{code}-{draft.number||'新'}</small><h2 id="task-dialog-title">任务详情</h2></div><button type="button" aria-label="关闭" onClick={onClose}><X size={20} /></button></div>
      <label>任务标题<input autoFocus required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <div className="form-grid">
        <label>类型<select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as TaskKind })}><option value="TASK">任务</option><option value="STORY">需求</option><option value="BUG">Bug</option></select></label>
        <label>状态<select value={draft.column} onChange={(event) => setDraft({ ...draft, column: event.target.value as ColumnId })}>{columns.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label>
        <label>优先级<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}>{['高', '中', '低'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>负责人<select value={draft.assignee} onChange={(event) => setDraft({ ...draft, assignee: event.target.value })}>{Object.keys(people).map((name) => <option key={name}>{name}</option>)}</select></label>
        <label>截止时间<input value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} /></label>
      </div>
      <label>标签<input value={draft.tags.join('、')} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(/[、,，]/).filter(Boolean) })} /></label>
      <label>描述<textarea placeholder="补充任务背景、验收标准或相关链接…" rows={5} /></label>
      <div className="dialog-actions"><button type="button" className="button ghost" onClick={onClose}>取消</button><button className="button primary"><Check size={16} />保存任务</button></div>
    </form>
  </div>
}

export default function App() {
  const [auth,setAuth]=useState<'loading'|'out'|'in'>('loading'),[user,setUser]=useState('')
  const [workspaceId,setWorkspaceId]=useState(''),[projects,setProjects]=useState<Project[]>([]),[columns,setColumns]=useState<BoardColumn[]>([])
  const [tasks, setTasks] = useState<Task[]>([]),[error,setError]=useState('')
  const [query, setQuery] = useState('')
  const [kind,setKind]=useState<'ALL'|TaskKind>('ALL')
  const [page,setPage]=useState<Page>('tasks')
  const [activeProject, setActiveProject] = useState(0)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [editing, setEditing] = useState<Task | null>(null)
  const boot=async()=>{try{const me=await api.me();setUser(me.user.name);const workspaces=await api.workspaces();const workspace=workspaces[0];if(!workspace)throw new Error('请先创建工作区');setWorkspaceId(workspace.id);const nextProjects=await api.projects(workspace.id);setProjects(nextProjects);setAuth('in')}catch{setAuth('out')}}
  useEffect(()=>{void boot()},[])
  useEffect(()=>{const project=projects[activeProject];if(!project||!workspaceId)return;setError('');Promise.all([api.columns(workspaceId,project.id),api.tasks(workspaceId,project.id)]).then(([nextColumns,nextTasks])=>{setColumns(nextColumns.map(column=>({id:column.id,label:column.name,accent:column.color})));setTasks(nextTasks)}).catch(error=>setError(error.message))},[workspaceId,projects,activeProject])
  const shownTasks = useMemo(() => filterTasks(tasks, query).filter(task=>kind==='ALL'||task.kind===kind), [tasks, query,kind])
  const reload=async()=>{const project=projects[activeProject];if(project)setTasks(await api.tasks(workspaceId,project.id))}
  const updateTask=async(next:Task)=>{try{if(next.id==='new')await api.createTask(workspaceId,next);else await api.updateTask(workspaceId,next);setEditing(null);await reload()}catch(error){setError(error instanceof Error?error.message:'保存失败')}}
  const createTask=()=>{const project=projects[activeProject],column=columns[0];if(project&&column)setEditing({id:'new',number:0,projectId:project.id,title:'',kind:'TASK',column:column.id,priority:'中',assignee:user,due:'未设置',tags:[],version:1})}
  const move=async(id:string,column:ColumnId)=>{const task=tasks.find(item=>item.id===id);if(!task)return;setTasks(current=>moveTask(current,id,column));try{const result=await api.updateTask(workspaceId,{...task,column});setTasks(current=>current.map(item=>item.id===id?{...item,column,version:result.version}:item))}catch(error){setTasks(current=>moveTask(current,id,task.column));setError(error instanceof Error?error.message:'移动失败')}}
  const newProject=async()=>{const name=window.prompt('项目名称');if(!name)return;const code=(window.prompt('项目代码（2-8位字母或数字）',name.slice(0,4).toUpperCase())||'').toUpperCase();if(!code)return;try{await api.createProject(workspaceId,{name,code});setProjects(await api.projects(workspaceId));setActiveProject(projects.length)}catch(error){setError(error instanceof Error?error.message:'创建失败')}}

  if(auth==='loading')return <main className="boot">正在连接工作区…</main>
  if(auth==='out')return <AuthScreen onReady={()=>void boot()}/>
  const project=projects[activeProject]
  if(!project)return <main className="boot"><button className="button primary" onClick={()=>void newProject()}>创建第一个项目</button></main>

  return <div className="app-shell">
    <Sidebar projects={projects} page={page} onNavigate={setPage} activeProject={activeProject} setActiveProject={(index)=>{setActiveProject(index);setPage('tasks')}} onNewProject={()=>void newProject()} taskCount={tasks.length} user={user}/>
    <main className="workspace">
      <header className="topbar"><div className="search"><Search size={17} /><input aria-label="搜索任务" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务、负责人或标签…" /><kbd>⌘ K</kbd></div><div className="top-actions"><button aria-label="帮助"><CircleHelp size={19} /></button><button aria-label="通知" className="notification"><Bell size={19} /><i /></button><button className="member-stack" aria-label="项目成员"><Avatar name="林默" small /><Avatar name="周屿" small /><Avatar name="陈鹿" small /><span>+2</span></button></div></header>
      {page==='tasks'?<>
      <section className="page-head"><div className="breadcrumbs"><span>项目</span><b>/</b><span>{project.name}</span></div><div className="title-row"><div><span className="eyebrow">{project.code} · 进行中</span><h1>{project.name}</h1><p>让每一次协作都有清晰的下一步。</p></div><button className="button primary" onClick={createTask}><Plus size={17} />新建任务</button></div>{error&&<p className="page-error" role="alert">{error}</p>}</section>
      <section className="toolbar"><div className="view-switch"><button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}><LayoutDashboard size={16} />看板</button><button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}><List size={16} />列表</button></div><div className="filters"><label><Filter size={16}/><select aria-label="任务类型" value={kind} onChange={event=>setKind(event.target.value as typeof kind)}><option value="ALL">全部类型</option><option value="TASK">任务</option><option value="STORY">需求</option><option value="BUG">Bug</option></select></label><button><SlidersHorizontal size={16} />显示</button><span>{shownTasks.length} 个任务</span></div></section>
      {view === 'board' ? <section className="board" id="board">
        {columns.map((column) => { const columnTasks = shownTasks.filter((task) => task.column === column.id); return <div className="column" key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void move(event.dataTransfer.getData('text/plain'), column.id)}>
          <div className="column-head"><span className="status-dot" style={{ background: column.accent }} /><h2>{column.label}</h2><span>{columnTasks.length}</span><button aria-label={`添加${column.label}任务`} onClick={createTask}><Plus size={16} /></button><button aria-label={`${column.label}菜单`}><MoreHorizontal size={17} /></button></div>
          <div className="task-list">{columnTasks.map((task) => <TaskCard key={task.id} task={task} columns={columns} onMove={(id,column)=>void move(id,column)} onEdit={setEditing} />)}{columnTasks.length === 0 && <div className="empty"><Sparkles size={18} /><span>把任务拖到这里</span></div>}</div>
          <button className="add-inline" onClick={createTask}><Plus size={16} />添加任务</button>
        </div> })}
      </section> : <section className="list-view"><div className="list-head"><span>任务</span><span>状态</span><span>负责人</span><span>截止时间</span></div>{shownTasks.map((task) => <button key={task.id} onClick={() => setEditing(task)}><span><b>{project.code}-{task.number}</b>{task.title}</span><span>{columns.find((column) => column.id === task.column)?.label}</span><span><Avatar name={task.assignee} small />{task.assignee}</span><span>{task.due}</span></button>)}</section>}
      </>:<WorkspacePage page={page} tasks={tasks} workspaceId={workspaceId} projectId={project.id} projectCount={projects.length} user={user}/>}
    </main>
    <TaskDialog task={editing} columns={columns} code={project.code} onClose={() => setEditing(null)} onSave={(task)=>void updateTask(task)} />
  </div>
}
