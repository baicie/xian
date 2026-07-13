import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Archive, Bell, CalendarDays, Check, ChevronDown, CircleHelp, Clock3,
  Command, Filter, LayoutDashboard, List, MoreHorizontal, Plus, Search,
  Settings, SlidersHorizontal, Sparkles, Users, X,
} from 'lucide-react'
import { ColumnId, Priority, Task, columns, filterTasks, moveTask, saveTask, seedTasks } from './board'

const storageKey = 'xian-board-tasks'
const people: Record<string, string> = { '林默': 'LM', '周屿': 'ZY', '陈鹿': 'CL', '沈括': 'SK' }
const projects = [
  { name: '官方网站重构', code: 'WEB', color: '#2367d1' },
  { name: '移动端 2.0', code: 'APP', color: '#d5792a' },
  { name: '增长实验', code: 'GRO', color: '#27825a' },
]

function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return <span className={`avatar${small ? ' avatar--small' : ''}`} title={name}>{people[name] ?? name.slice(0, 2)}</span>
}

function Sidebar({ activeProject, setActiveProject }: { activeProject: number; setActiveProject: (index: number) => void }) {
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark">闲</span><span>闲序</span><button aria-label="切换工作区"><ChevronDown size={15} /></button></div>
    <nav aria-label="主导航">
      <p className="nav-label">工作区</p>
      <a href="#overview"><LayoutDashboard size={17} />概览</a>
      <a className="active" href="#board"><Command size={17} />我的任务<span className="count">6</span></a>
      <a href="#calendar"><CalendarDays size={17} />日历</a>
      <p className="nav-label nav-label--project">项目 <button aria-label="新建项目"><Plus size={14} /></button></p>
      {projects.map((project, index) => <button className={`project-link ${index === activeProject ? 'selected' : ''}`} key={project.code} onClick={() => setActiveProject(index)}>
        <span className="project-dot" style={{ background: project.color }} />{project.name}
      </button>)}
      <a href="#archived"><Archive size={17} />已归档</a>
    </nav>
    <div className="sidebar-bottom">
      <a href="#members"><Users size={17} />成员</a><a href="#settings"><Settings size={17} />设置</a>
      <div className="profile"><Avatar name="林默" /><div><strong>林默</strong><small>管理员</small></div><MoreHorizontal size={17} /></div>
    </div>
  </aside>
}

function TaskCard({ task, onMove, onEdit }: { task: Task; onMove: (id: number, column: ColumnId) => void; onEdit: (task: Task) => void }) {
  const [dragging, setDragging] = useState(false)
  return <article className={`task-card ${dragging ? 'dragging' : ''}`} draggable onDragStart={(event) => { setDragging(true); event.dataTransfer.setData('text/plain', String(task.id)) }} onDragEnd={() => setDragging(false)} onClick={() => onEdit(task)}>
    <div className="task-top"><span className={`priority priority--${task.priority}`}>{task.priority}优先级</span><button aria-label="任务菜单" onClick={(event) => event.stopPropagation()}><MoreHorizontal size={17} /></button></div>
    <h3>{task.title}</h3>
    <div className="tags">{task.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
    <div className="task-meta"><span className={task.due === '今天' ? 'due-today' : ''}><Clock3 size={14} />{task.due}</span><Avatar name={task.assignee} small /></div>
    <select aria-label={`移动任务 ${task.title}`} value={task.column} onClick={(event) => event.stopPropagation()} onChange={(event) => onMove(task.id, event.target.value as ColumnId)}>
      {columns.map((column) => <option value={column.id} key={column.id}>{column.label}</option>)}
    </select>
  </article>
}

function TaskDialog({ task, onClose, onSave }: { task: Task | null; onClose: () => void; onSave: (task: Task) => void }) {
  const [draft, setDraft] = useState<Task | null>(task)
  useEffect(() => setDraft(task), [task])
  if (!draft) return null
  const submit = (event: FormEvent) => { event.preventDefault(); onSave(draft) }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title" onSubmit={submit}>
      <div className="dialog-head"><div><small>WEB-{draft.id}</small><h2 id="task-dialog-title">任务详情</h2></div><button type="button" aria-label="关闭" onClick={onClose}><X size={20} /></button></div>
      <label>任务标题<input autoFocus required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <div className="form-grid">
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
  const [tasks, setTasks] = useState<Task[]>(() => { try { return JSON.parse(localStorage.getItem(storageKey) || 'null') ?? seedTasks } catch { return seedTasks } })
  const [query, setQuery] = useState('')
  const [activeProject, setActiveProject] = useState(0)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [editing, setEditing] = useState<Task | null>(null)
  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(tasks)), [tasks])
  const shownTasks = useMemo(() => filterTasks(tasks, query), [tasks, query])
  const updateTask = (next: Task) => { setTasks((current) => saveTask(current, next)); setEditing(null) }
  const createTask = () => setEditing({ id: Math.max(...tasks.map((task) => task.id), 1000) + 1, title: '', column: 'backlog', priority: '中', assignee: '林默', due: '未设置', tags: [] })
  const move = (id: number, column: ColumnId) => setTasks((current) => moveTask(current, id, column))

  return <div className="app-shell">
    <Sidebar activeProject={activeProject} setActiveProject={setActiveProject} />
    <main className="workspace">
      <header className="topbar"><div className="search"><Search size={17} /><input aria-label="搜索任务" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务、负责人或标签…" /><kbd>⌘ K</kbd></div><div className="top-actions"><button aria-label="帮助"><CircleHelp size={19} /></button><button aria-label="通知" className="notification"><Bell size={19} /><i /></button><button className="member-stack" aria-label="项目成员"><Avatar name="林默" small /><Avatar name="周屿" small /><Avatar name="陈鹿" small /><span>+2</span></button></div></header>
      <section className="page-head"><div className="breadcrumbs"><span>项目</span><b>/</b><span>{projects[activeProject].name}</span></div><div className="title-row"><div><span className="eyebrow">{projects[activeProject].code} · 进行中</span><h1>{projects[activeProject].name}</h1><p>让每一次协作都有清晰的下一步。</p></div><button className="button primary" onClick={createTask}><Plus size={17} />新建任务</button></div></section>
      <section className="toolbar"><div className="view-switch"><button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}><LayoutDashboard size={16} />看板</button><button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}><List size={16} />列表</button></div><div className="filters"><button><Filter size={16} />筛选</button><button><SlidersHorizontal size={16} />显示</button><span>{shownTasks.length} 个任务</span></div></section>
      {view === 'board' ? <section className="board" id="board">
        {columns.map((column) => { const columnTasks = shownTasks.filter((task) => task.column === column.id); return <div className="column" key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => move(Number(event.dataTransfer.getData('text/plain')), column.id)}>
          <div className="column-head"><span className="status-dot" style={{ background: column.accent }} /><h2>{column.label}</h2><span>{columnTasks.length}</span><button aria-label={`添加${column.label}任务`} onClick={createTask}><Plus size={16} /></button><button aria-label={`${column.label}菜单`}><MoreHorizontal size={17} /></button></div>
          <div className="task-list">{columnTasks.map((task) => <TaskCard key={task.id} task={task} onMove={move} onEdit={setEditing} />)}{columnTasks.length === 0 && <div className="empty"><Sparkles size={18} /><span>把任务拖到这里</span></div>}</div>
          <button className="add-inline" onClick={createTask}><Plus size={16} />添加任务</button>
        </div> })}
      </section> : <section className="list-view"><div className="list-head"><span>任务</span><span>状态</span><span>负责人</span><span>截止时间</span></div>{shownTasks.map((task) => <button key={task.id} onClick={() => setEditing(task)}><span><b>WEB-{task.id}</b>{task.title}</span><span>{columns.find((column) => column.id === task.column)?.label}</span><span><Avatar name={task.assignee} small />{task.assignee}</span><span>{task.due}</span></button>)}</section>}
    </main>
    <TaskDialog task={editing} onClose={() => setEditing(null)} onSave={updateTask} />
  </div>
}
