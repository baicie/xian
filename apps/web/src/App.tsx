import { DragEvent, FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Archive,
  Bell,
  BellOff,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Command,
  FileText,
  FileUp,
  CircleDot,
  ExternalLink,
  GitPullRequest,
  Filter,
  Flag,
  LayoutDashboard,
  List,
  LogOut,
  Moon,
  MoreHorizontal,
  PencilLine,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { matchPath, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ColumnId,
  Priority,
  Task,
  TaskKind,
  filterTasks,
  moveTask,
} from "./board";
import { api, type GitHubReference, type TaskColumnRole, type TaskImportPreview, type TaskWorkbookMapping } from "./api";
import AuthScreen from "./AuthScreen";
import InviteScreen from "./InviteScreen";
import SetupScreen from "./SetupScreen";
import ChoiceSelect from "./components/ChoiceSelect";
import {
  appPaths,
  getProjectIdFromPath,
  workspacePageRoutes,
} from "./routes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./components/ui/alert-dialog";

const WorkspacePage = lazy(() => import("./WorkspacePage"));
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "./components/ui/avatar";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Checkbox } from "./components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "./components/ui/field";
import { Input } from "./components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "./components/ui/input-group";
import { Kbd } from "./components/ui/kbd";
import { Textarea } from "./components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./components/ui/sheet";
import { Toaster } from "./components/ui/sonner";
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "./components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./components/ui/breadcrumb";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
import TaskComments from "./features/tasks/TaskComments";
import TaskSubtasks from "./features/tasks/TaskSubtasks";

type Lang = "zh" | "en";
type Theme = "light" | "dark";
type Project = { id: string; name: string; code: string; color: string };
type Workspace = { id: string; name: string; slug: string; role: string };
type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  disabledAt: string | null;
};
type BoardColumn = { id: string; label: string; accent: string };

const copy = {
  zh: {
    overview: "概览",
    inbox: "我的工作",
    myTasks: "我的任务",
    calendar: "日历",
    documents: "设计文档",
    plans: "任务规划",
    project: "项目",
    newProject: "新建项目",
    archived: "已归档",
    members: "成员",
    settings: "设置",
    loggedIn: "已登录",
    switchWorkspace: "切换工作区",
    newWorkspace: "新建工作区",
    account: "账户",
    language: "切换到 English",
    themeDark: "切换到深色",
    themeLight: "切换到浅色",
    logout: "退出登录",
    search: "搜索当前项目的任务、负责人或标签…",
    clearSearch: "清除搜索",
    viewMembers: "查看工作区成员",
    newTask: "新建任务",
    board: "看板",
    list: "列表",
    allTypes: "全部类型",
    task: "任务",
    story: "需求",
    bug: "Bug",
    tasksCount: "个任务",
    status: "状态",
    type: "类型",
    priority: "优先级",
    high: "高",
    medium: "中",
    low: "低",
    assignee: "负责人",
    due: "截止时间",
    tags: "标签",
    description: "描述",
    taskTitle: "任务标题",
    taskDetails: "任务详情",
    cancel: "取消",
    save: "保存任务",
    deleteTask: "删除任务",
    deleteTaskTitle: "确认删除任务？",
    deleteTaskDescription: "任务将被软删除，并从当前项目中隐藏。此操作不会立即擦除数据库记录。",
    selectedTasks: "个任务已选择",
    selectAllTasks: "选择当前结果中的全部任务",
    clearSelection: "清除选择",
    assignToMe: "指派给我",
    changeAssignee: "更改负责人",
    unassigned: "取消指派",
    changeStatus: "移动状态",
    changeType: "修改类型",
    changePriority: "修改优先级",
    quickEntry: "输入任务标题，按回车创建",
    bulkDelete: "批量删除",
    bulkDeleteTitle: "删除所选任务？",
    bulkDeleteDescription: "所选任务将被软删除，并从当前项目中隐藏。",
    renameProject: "重命名项目",
    deleteProject: "删除项目",
    deleteTitle: "确认删除项目？",
    deleteDescription:
      "项目和其中任务将被移入软删除状态，此操作不会立即擦除数据库记录。",
    delete: "删除",
    noResults: "没有匹配的任务",
    emptyColumn: "把任务拖到这里",
    addTask: "添加任务",
    inProgress: "进行中",
    tagline: "让每一次协作都有清晰的下一步。",
    createFirst: "创建第一个项目",
  },
  en: {
    overview: "Overview",
    inbox: "My work",
    myTasks: "My tasks",
    calendar: "Calendar",
    documents: "Documents",
    plans: "Planning",
    project: "Projects",
    newProject: "New project",
    archived: "Archived",
    members: "Members",
    settings: "Settings",
    loggedIn: "Signed in",
    switchWorkspace: "Switch workspace",
    newWorkspace: "New workspace",
    account: "Account",
    language: "切换到简体中文",
    themeDark: "Use dark theme",
    themeLight: "Use light theme",
    logout: "Sign out",
    search: "Search tasks, assignees, or tags in this project…",
    clearSearch: "Clear search",
    viewMembers: "View workspace members",
    newTask: "New task",
    board: "Board",
    list: "List",
    allTypes: "All types",
    task: "Task",
    story: "Story",
    bug: "Bug",
    tasksCount: "tasks",
    status: "Status",
    type: "Type",
    priority: "Priority",
    high: "High",
    medium: "Medium",
    low: "Low",
    assignee: "Assignee",
    due: "Due date",
    tags: "Tags",
    description: "Description",
    taskTitle: "Task title",
    taskDetails: "Task details",
    cancel: "Cancel",
    save: "Save task",
    deleteTask: "Delete task",
    deleteTaskTitle: "Delete this task?",
    deleteTaskDescription: "The task will be soft deleted and hidden from the current project. Its database record is retained.",
    selectedTasks: "tasks selected",
    selectAllTasks: "Select all tasks in the current results",
    clearSelection: "Clear selection",
    assignToMe: "Assign to me",
    changeAssignee: "Change assignee",
    unassigned: "Unassign",
    changeStatus: "Move status",
    changeType: "Change type",
    changePriority: "Change priority",
    quickEntry: "Enter a task title and press Enter",
    bulkDelete: "Delete selected",
    bulkDeleteTitle: "Delete selected tasks?",
    bulkDeleteDescription: "The selected tasks will be soft deleted and hidden from this project.",
    renameProject: "Rename project",
    deleteProject: "Delete project",
    deleteTitle: "Delete this project?",
    deleteDescription:
      "The project and its tasks will be soft deleted. Database records are retained for safety.",
    delete: "Delete",
    noResults: "No matching tasks",
    emptyColumn: "Drop tasks here",
    addTask: "Add task",
    inProgress: "Active",
    tagline: "Give every collaboration a clear next step.",
    createFirst: "Create first project",
  },
} as const;
type Copy = { [K in keyof typeof copy.zh]: string };

function UserAvatar({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  return (
    <Avatar size={small ? "sm" : "default"} title={name}>
      <AvatarFallback>{name.trim().slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

function AppSidebar({
  workspaces,
  workspaceId,
  onWorkspace,
  onNewWorkspace,
  projects,
  activeProjectId,
  onNewProject,
  onRenameProject,
  onDeleteProject,
  taskCount,
  user,
  lang,
  setLang,
  theme,
  setTheme,
  onLogout,
  t,
}: {
  workspaces: Workspace[];
  workspaceId: string;
  onWorkspace: (id: string) => void;
  onNewWorkspace: () => void;
  projects: Project[];
  activeProjectId: string;
  onNewProject: () => void;
  onRenameProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  taskCount: number;
  user: string;
  lang: Lang;
  setLang: (lang: Lang) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  onLogout: () => void;
  t: Copy;
}) {
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const navigate = useNavigate();
  const navClassName = ({ isActive }: { isActive: boolean }) =>
    `nav-item ${isActive ? "active" : ""}`;
  return (
    <ShadcnSidebar className="app-sidebar" collapsible="icon">
      <SidebarHeader>
      <div className="brand">
        <span className="brand-mark">闲</span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="workspace-trigger"
                aria-label={t.switchWorkspace}
              />
            }
          >
            {workspace?.name ?? "闲序"}
            <ChevronDown data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t.switchWorkspace}</DropdownMenuLabel>
              {workspaces.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => onWorkspace(item.id)}
                >
                  {item.id === workspaceId ? <Check /> : null}
                  {item.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onNewWorkspace}>
                <Plus />
                {t.newWorkspace}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </SidebarHeader>
      <SidebarContent>
      <nav aria-label="主导航">
        <p className="nav-label">{t.switchWorkspace}</p>
        <NavLink className={navClassName} to={appPaths.inbox}>
          <Bell data-icon="inline-start" />
          {t.inbox}
        </NavLink>
        <NavLink className={navClassName} to={appPaths.overview}>
          <LayoutDashboard data-icon="inline-start" />
          {t.overview}
        </NavLink>
        <NavLink
          className={({ isActive }) =>
            `nav-item ${isActive ? "active" : ""}`
          }
          to={activeProjectId ? appPaths.project(activeProjectId) : appPaths.home}
        >
          <Command data-icon="inline-start" />
          {t.myTasks}
          <Badge className="count" variant="secondary">
            {taskCount}
          </Badge>
        </NavLink>
        <NavLink className={navClassName} to={appPaths.calendar}>
          <CalendarDays data-icon="inline-start" />
          {t.calendar}
        </NavLink>
        <NavLink className={navClassName} to={appPaths.documents}>
          <FileText data-icon="inline-start" />
          {t.documents}
        </NavLink>
        <NavLink className={navClassName} to={appPaths.plans}>
          <Sparkles data-icon="inline-start" />
          {t.plans}
        </NavLink>
        <p className="nav-label nav-label--project">
          {t.project}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t.newProject}
            onClick={onNewProject}
          >
            <Plus />
          </Button>
        </p>
        {projects.map((project) => (
          <div className="project-row" key={project.id}>
            <NavLink
              className={({ isActive }) =>
                `project-link ${isActive ? "selected" : ""}`
              }
              to={appPaths.project(project.id)}
            >
              <span
                className="project-dot"
                style={{ background: project.color }}
              />
              {project.name}
            </NavLink>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="project-menu-trigger"
                    aria-label={`${project.name} ${t.settings}`}
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => onRenameProject(project)}>
                    <PencilLine />
                    {t.renameProject}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDeleteProject(project)}
                  >
                    <Trash2 />
                    {t.deleteProject}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
        <NavLink className={navClassName} to={appPaths.archived}>
          <Archive data-icon="inline-start" />
          {t.archived}
        </NavLink>
      </nav>
      </SidebarContent>
      <SidebarFooter>
      <div className="sidebar-bottom">
        <NavLink className={navClassName} to={appPaths.members}>
          <Users data-icon="inline-start" />
          {t.members}
        </NavLink>
        <NavLink className={navClassName} to={appPaths.settings}>
          <Settings data-icon="inline-start" />
          {t.settings}
        </NavLink>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="profile"
                aria-label={t.account}
              />
            }
          >
            <UserAvatar name={user} />
            <span>
              <strong>{user}</strong>
              <small>{t.loggedIn}</small>
            </span>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t.account}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigate(appPaths.settings)}>
                <Settings />
                {t.settings}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              >
                <span className="menu-icon">文</span>
                {t.language}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              >
                {theme === "light" ? <Moon /> : <Sun />}
                {theme === "light" ? t.themeDark : t.themeLight}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onClick={onLogout}>
                <LogOut />
                {t.logout}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </SidebarFooter>
      <SidebarRail />
    </ShadcnSidebar>
  );
}

function TaskCard({
  task,
  onEdit,
  t,
  code,
}: {
  task: Task;
  onEdit: (task: Task) => void;
  t: Copy;
  code: string;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <Button
      type="button"
      className={`task-card ${dragging ? "dragging" : ""}`}
      variant="ghost"
      draggable
      onDragStart={(event) => {
        setDragging(true);
        event.dataTransfer.setData("text/plain", String(task.id));
      }}
      onDragEnd={() => setDragging(false)}
      onClick={() => onEdit(task)}
    >
      <span className="task-top">
        <span className="task-key">{code}-{task.number}</span>
        <Badge variant={task.kind === "BUG" ? "destructive" : "secondary"}>
          {task.kind === "BUG" ? t.bug : task.kind === "STORY" ? t.story : t.task}
        </Badge>
      </span>
      <span className="task-title">{task.title}</span>
      {task.subtaskTotal?<span className="task-progress"><span><List/>{task.subtaskDone}/{task.subtaskTotal}</span><i><b style={{width:`${(task.subtaskDone??0)/task.subtaskTotal*100}%`}}/></i></span>:null}
      <span className="task-details-row">
        <Badge variant="ghost" className={`priority priority--${task.priority}`}>
          {
            (
              { 高: t.high, 中: t.medium, 低: t.low } as Record<
                Priority,
                string
              >
            )[task.priority]
          }{" "}
          {t.priority}
        </Badge>
      </span>
      <span className="tags">
        {task.tags.map((tag) => (
          <Badge variant="outline" key={tag}>
            {tag}
          </Badge>
        ))}
      </span>
      <span className="task-meta">
        <span className={task.due === "今天" ? "due-today" : ""}>
          <Clock3 />
          {task.due || (t.due === "截止时间" ? "未设置" : "Not set")}
        </span>
        <span className="task-assignee"><UserAvatar name={task.assignee} small />{task.assignee}</span>
      </span>
    </Button>
  );
}

function TaskDialog({
  task,
  workspaceId,
  columns,
  members,
  code,
  onClose,
  onSave,
  onDelete,
  onSubtasksChanged,
  t,
}: {
  task: Task | null;
  workspaceId: string;
  columns: BoardColumn[];
  members: Member[];
  code: string;
  onClose: () => void;
  onSave: (task: Task) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
  onSubtasksChanged: () => Promise<void>;
  t: Copy;
}) {
  const [draft, setDraft] = useState<Task | null>(task);
  const [confirmingDelete,setConfirmingDelete]=useState(false),[deletingTask,setDeletingTask]=useState(false)
  const [githubReferences,setGithubReferences]=useState<GitHubReference[]|null>(null),[githubLinks,setGithubLinks]=useState<GitHubReference[]>([]),[initialGithubLinks,setInitialGithubLinks]=useState<GitHubReference[]>([]),[watching,setWatching]=useState(false)
  useEffect(() => {setDraft(task);setConfirmingDelete(false);setDeletingTask(false)}, [task]);
  useEffect(()=>{if(!task||task.id==='new'){setGithubReferences(null);setGithubLinks([]);setInitialGithubLinks([]);return}let active=true;Promise.all([api.githubReferences(workspaceId),api.taskGitHubLinks(workspaceId,task.id)]).then(([references,links])=>{if(active){setGithubReferences(references.projectId===task.projectId?references.items:null);setGithubLinks(links);setInitialGithubLinks(links)}}).catch(()=>{if(active){setGithubReferences(null);setGithubLinks([]);setInitialGithubLinks([])}});return()=>{active=false}},[task?.id,workspaceId])
  useEffect(()=>{if(!task||task.id==='new'){setWatching(false);return}let active=true;api.taskWatch(workspaceId,task.id).then(value=>active&&setWatching(value.watching)).catch(()=>active&&setWatching(false));return()=>{active=false}},[task?.id,workspaceId])
  if (!draft) return null;
  return (
    <Sheet open={Boolean(task)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="task-sheet">
        <form
          className="task-sheet-form"
          onSubmit={async (event: FormEvent) => {
            event.preventDefault();
            try{
              const linkKeys=(links:GitHubReference[])=>links.map(link=>`${link.kind}:${link.number}`).sort().join(',')
              if(draft.id!=='new'&&githubReferences&&linkKeys(githubLinks)!==linkKeys(initialGithubLinks))await api.setTaskGitHubLinks(workspaceId,draft.id,githubLinks.map(({kind,number})=>({kind,number})))
              await onSave(draft);
            }catch(reason){toast.error(reason instanceof Error?reason.message:(t.taskDetails==='任务详情'?'保存 GitHub 关联失败':'Failed to save GitHub links'))}
          }}
        >
          <SheetHeader>
            <span className="dialog-key">
              {code}-{draft.number || "NEW"}
            </span>
            <SheetTitle>{t.taskDetails}</SheetTitle>
            <SheetDescription>{t.tagline}</SheetDescription>
          </SheetHeader>
          <div className="task-sheet-body"><FieldGroup className="dialog-fields">
            <Field>
              <FieldLabel htmlFor="task-title">{t.taskTitle}</FieldLabel>
              <Input
                id="task-title"
                autoFocus
                required
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </Field>
            <FieldGroup className="form-grid">
              <Field>
                <FieldLabel>{t.type}</FieldLabel>
                <ChoiceSelect
                  label={t.type}
                  value={draft.kind}
                  options={[
                    { value: "TASK", label: t.task },
                    { value: "STORY", label: t.story },
                    { value: "BUG", label: t.bug },
                  ]}
                  onChange={(kind) => setDraft({ ...draft, kind })}
                  className="choice-select"
                />
              </Field>
              <Field>
                <FieldLabel>{t.status}</FieldLabel>
                <ChoiceSelect
                  label={t.status}
                  value={draft.column}
                  options={columns.map((column) => ({
                    value: column.id,
                    label: column.label,
                  }))}
                  onChange={(column) => setDraft({ ...draft, column })}
                  className="choice-select"
                />
              </Field>
              <Field>
                <FieldLabel>{t.priority}</FieldLabel>
                <ChoiceSelect
                  label={t.priority}
                  value={draft.priority}
                  options={[
                    { value: "高", label: t.high },
                    { value: "中", label: t.medium },
                    { value: "低", label: t.low },
                  ]}
                  onChange={(priority) => setDraft({ ...draft, priority })}
                  className="choice-select"
                />
              </Field>
              <Field>
                <FieldLabel>{t.assignee}</FieldLabel>
                <ChoiceSelect
                  label={t.assignee}
                  value={draft.assigneeId || "NONE"}
                  options={[{value:"NONE",label:t.assignee === "负责人" ? "未分配" : "Unassigned"},...members.map((member) => ({ value: member.id, label: member.name }))]}
                  onChange={(assigneeId) => { const assignee=members.find(member=>member.id===assigneeId)?.name??"未分配";setDraft({ ...draft, assigneeId:assigneeId==="NONE"?"":assigneeId,assignee }) }}
                  className="choice-select"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="task-due">{t.due}</FieldLabel>
                <Input
                  id="task-due"
                  type="date"
                  value={draft.due}
                  onChange={(event) =>
                    setDraft({ ...draft, due: event.target.value })
                  }
                />
              </Field>
            </FieldGroup>
            <Field>
              <FieldLabel htmlFor="task-tags">{t.tags}</FieldLabel>
              <Input
                id="task-tags"
                value={draft.tags.join("、")}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    tags: event.target.value.split(/[、,，]/).filter(Boolean),
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="task-description">
                {t.description}
              </FieldLabel>
              <Textarea
                id="task-description"
                placeholder="补充任务背景、验收标准或相关链接…"
                rows={5}
                value={draft.description}
                onChange={(event)=>setDraft({...draft,description:event.target.value})}
              />
            </Field>
            {githubReferences?<Field><FieldLabel>{t.taskDetails==='任务详情'?'关联 GitHub':'GitHub links'}</FieldLabel><div className="github-reference-list">{githubReferences.length?githubReferences.map(reference=>{const checked=githubLinks.some(link=>link.kind===reference.kind&&link.number===reference.number),id=`github-reference-${reference.kind}-${reference.number}`;return <div className="github-reference" key={`${reference.kind}:${reference.number}`}><Checkbox id={id} checked={checked} onCheckedChange={()=>setGithubLinks(current=>checked?current.filter(link=>link.kind!==reference.kind||link.number!==reference.number):[...current,reference])}/>{reference.kind==='PR'?<GitPullRequest/>:<CircleDot/>}<label htmlFor={id}><strong>{reference.kind} #{reference.number}</strong><small>{reference.title}</small></label><a href={reference.url} target="_blank" rel="noreferrer" aria-label={`Open ${reference.kind} ${reference.number}`}><ExternalLink/></a></div>}):<p className="github-reference-empty">{t.taskDetails==='任务详情'?'仓库中暂无 Issue 或 PR':'No Issues or pull requests found'}</p>}</div></Field>:null}
            {draft.id!=="new"?<TaskSubtasks workspaceId={workspaceId} taskId={draft.id} en={t.taskDetails!=="任务详情"} onChanged={onSubtasksChanged}/>:null}
            {draft.id!=="new"?<TaskComments workspaceId={workspaceId} taskId={draft.id} en={t.taskDetails!=="任务详情"}/>:null}
          </FieldGroup></div>
          <SheetFooter className="task-sheet-footer">
            {draft.id!=="new"?<Button type="button" variant="destructive" className="task-delete-button" onClick={()=>setConfirmingDelete(true)}><Trash2 data-icon="inline-start"/>{t.deleteTask}</Button>:null}
            {draft.id!=="new"?<Button type="button" variant="outline" onClick={()=>void api.setTaskWatch(workspaceId,draft.id,!watching).then(value=>setWatching(value.watching))}>{watching?<BellOff data-icon="inline-start"/>:<Bell data-icon="inline-start"/>}{watching?(t.taskDetails==='任务详情'?'取消关注':'Unfollow'):(t.taskDetails==='任务详情'?'关注任务':'Follow')}</Button>:null}
            <Button type="button" variant="outline" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button type="submit">
              <Check data-icon="inline-start" />
              {t.save}
            </Button>
          </SheetFooter>
        </form>
        <AlertDialog open={confirmingDelete} onOpenChange={open=>!deletingTask&&setConfirmingDelete(open)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t.deleteTaskTitle}</AlertDialogTitle><AlertDialogDescription><strong>{draft.title}</strong><br/>{t.deleteTaskDescription}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deletingTask}>{t.cancel}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deletingTask} onClick={async()=>{setDeletingTask(true);try{await onDelete(draft);setConfirmingDelete(false)}catch(reason){toast.error(reason instanceof Error?reason.message:(t.taskDetails==='任务详情'?'删除失败':'Delete failed'))}finally{setDeletingTask(false)}}}>{deletingTask?(t.taskDetails==='任务详情'?'删除中…':'Deleting…'):t.deleteTask}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

function CreateDialog({
  kind,
  lang,
  onClose,
  onCreate,
}: {
  kind: "workspace" | "project" | null;
  lang: Lang;
  onClose: () => void;
  onCreate: (name: string, code?: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    en = lang === "en";
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    try {
      await onCreate(
        String(values.get("name")),
        kind === "project"
          ? String(values.get("code")).toUpperCase()
          : undefined,
      );
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : en
            ? "Creation failed"
            : "创建失败",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={Boolean(kind)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {kind === "workspace"
                ? en
                  ? "New workspace"
                  : "新建工作区"
                : en
                  ? "New project"
                  : "新建项目"}
            </DialogTitle>
            <DialogDescription>
              {kind === "workspace"
                ? en
                  ? "A default project will be created automatically."
                  : "将自动创建一个默认项目。"
                : en
                  ? "Choose a name and a 2–8 character code."
                  : "填写项目名称和 2–8 位项目代码。"}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="create-form">
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="create-name">
                {en ? "Name" : "名称"}
              </FieldLabel>
              <Input
                id="create-name"
                name="name"
                required
                maxLength={120}
                aria-invalid={Boolean(error)}
              />
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
            {kind === "project" ? (
              <Field>
                <FieldLabel htmlFor="create-code">
                  {en ? "Code" : "项目代码"}
                </FieldLabel>
                <Input
                  id="create-code"
                  name="code"
                  required
                  minLength={2}
                  maxLength={8}
                  pattern="[A-Za-z0-9]+"
                  placeholder="TEAM"
                />
              </Field>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {en ? "Cancel" : "取消"}
            </Button>
          <Button type="submit" disabled={busy}>
              {busy ? (en ? "Creating…" : "创建中…") : en ? "Create" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameProjectDialog({
  project,
  lang,
  onClose,
  onRename,
}: {
  project: Project | null;
  lang: Lang;
  onClose: () => void;
  onRename: (project: Project, name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const en = lang === "en";

  useEffect(() => {
    setName(project?.name ?? "");
    setError("");
  }, [project]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!project) return;
    const nextName = name.trim();
    if (!nextName) {
      setError(en ? "Project name is required" : "项目名称不能为空");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await onRename(project, nextName);
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : en
            ? "Rename failed"
            : "重命名失败",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(project)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{en ? "Rename project" : "重命名项目"}</DialogTitle>
            <DialogDescription>
              {en
                ? "Change the project name. Its code and task keys stay the same."
                : "修改项目名称，项目代码和任务编号保持不变。"}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="create-form">
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="rename-project-name">
                {en ? "Project name" : "项目名称"}
              </FieldLabel>
              <Input
                id="rename-project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={120}
                autoFocus
                aria-invalid={Boolean(error)}
              />
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {en ? "Cancel" : "取消"}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? (en ? "Saving..." : "保存中...") : en ? "Save" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const importRoleLabels:Record<TaskColumnRole,{zh:string;en:string}>={TITLE:{zh:'任务标题',en:'Title'},DESCRIPTION:{zh:'描述',en:'Description'},KIND:{zh:'类型',en:'Type'},PRIORITY:{zh:'优先级',en:'Priority'},IGNORE:{zh:'忽略',en:'Ignore'}}
function mappedRole(mapping:TaskWorkbookMapping,index:number):TaskColumnRole{return mapping.titleColumn===index?'TITLE':mapping.descriptionColumns.includes(index)?'DESCRIPTION':mapping.kindColumn===index?'KIND':mapping.priorityColumn===index?'PRIORITY':'IGNORE'}

function TaskImportDialog({file,preview,mapping,busy,en,onClose,onMappingChange,onRefresh,onImport}:{file:File|null;preview:TaskImportPreview|null;mapping:TaskWorkbookMapping|null;busy:boolean;en:boolean;onClose:()=>void;onMappingChange:(index:number,role:TaskColumnRole)=>void;onRefresh:()=>void;onImport:()=>void}){
  return <Dialog open={Boolean(file)} onOpenChange={open=>!open&&onClose()}><DialogContent className="task-import-dialog"><DialogHeader><DialogTitle>{en?'Review Excel import':'确认 Excel 导入'}</DialogTitle><DialogDescription>{file?.name}{preview?` · ${preview.sheetName}`:''}</DialogDescription></DialogHeader>
    {busy&&!preview?<div className="import-loading">{en?'Analyzing workbook...':'正在分析工作簿...'}</div>:null}
    {preview&&mapping?<><div className="import-summary"><span><strong>{preview.counts.valid}</strong>{en?'Ready':'可导入'}</span><span><strong>{preview.counts.invalid}</strong>{en?'Invalid':'无效'}</span><span><strong>{preview.counts.duplicates}</strong>{en?'Duplicates':'重复'}</span><span><strong>{preview.counts.ignored}</strong>{en?'Ignored':'忽略'}</span></div>
      <div className="import-mapping"><div className="import-section-head"><strong>{en?'Column mapping':'字段映射'}</strong><Button type="button" variant="outline" size="sm" disabled={busy||mapping.titleColumn<0} onClick={onRefresh}>{busy?(en?'Analyzing...':'分析中...'):(en?'Refresh preview':'重新分析')}</Button></div><div className="import-mapping-grid">{preview.columns.map(column=><div className="import-mapping-field" key={column.index}><span>{column.header}</span><ChoiceSelect label={`${column.header} ${en?'mapping':'字段映射'}`} value={mappedRole(mapping,column.index)} options={(Object.keys(importRoleLabels) as TaskColumnRole[]).map(role=>({value:role,label:importRoleLabels[role][en?'en':'zh']}))} onChange={role=>onMappingChange(column.index,role)} className="import-mapping-select"/></div>)}</div></div>
      <div className="import-rows"><div className="import-section-head"><strong>{en?'Row report':'行校验结果'}</strong><small>{en?`${preview.counts.total} data rows`:`${preview.counts.total} 行数据`}</small></div><div className="import-table"><div className="import-table-head"><span>{en?'Row':'行'}</span><span>{en?'Title':'标题'}</span><span>{en?'Type':'类型'}</span><span>{en?'Result':'结果'}</span></div>{preview.rows.map(row=><div className="import-table-row" key={row.sourceRow}><span>{row.sourceRow}</span><strong>{row.title||'—'}</strong><span>{row.kind}</span><span className={row.errors.length?'is-invalid':row.duplicate?'is-duplicate':'is-valid'}>{row.errors[0]??(row.duplicate?(en?'Duplicate':'重复'):(en?'Ready':'可导入'))}</span></div>)}</div></div></>:null}
    <DialogFooter><Button type="button" variant="outline" onClick={onClose}>{en?'Cancel':'取消'}</Button><Button type="button" disabled={busy||!preview||!mapping||mapping.titleColumn<0||preview.counts.valid===0} onClick={onImport}>{busy?(en?'Importing...':'导入中...'):(en?`Import ${preview?.counts.valid??0} tasks`:`导入 ${preview?.counts.valid??0} 个任务`)}</Button></DialogFooter>
  </DialogContent></Dialog>
}

export default function App() {
  const [auth, setAuth] = useState<"loading" | "out" | "in">("loading"),
    [user, setUser] = useState(""),
    [userId, setUserId] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]),
    [workspaceId, setWorkspaceId] = useState(""),
    [projects, setProjects] = useState<Project[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [columns, setColumns] = useState<BoardColumn[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState<"ALL" | TaskKind>("ALL"),
    [importDragging,setImportDragging]=useState(false),
    [importFile,setImportFile]=useState<File|null>(null),
    [importPreview,setImportPreview]=useState<TaskImportPreview|null>(null),
    [importMapping,setImportMapping]=useState<TaskWorkbookMapping|null>(null),
    [importBusy,setImportBusy]=useState(false),
    [selectedTaskIds,setSelectedTaskIds]=useState<string[]>([]),
    [bulkBusy,setBulkBusy]=useState(false),
    [confirmingBulkDelete,setConfirmingBulkDelete]=useState(false),
    [quickTitle,setQuickTitle]=useState(''),
    [quickBusy,setQuickBusy]=useState(false);
  const [activeProjectId, setActiveProjectId] = useState(""),
    [editing, setEditing] = useState<Task | null>(null),
    [renaming, setRenaming] = useState<Project | null>(null),
    [deleting, setDeleting] = useState<Project | null>(null),
    [creating, setCreating] = useState<"workspace" | "project" | null>(null);
  const [lang, setLang] = useState<Lang>(
      () => (localStorage.getItem("lang") as Lang) || "zh",
    ),
    [theme, setTheme] = useState<Theme>(
      () => (localStorage.getItem("theme") as Theme) || "light",
    );
  const searchRef = useRef<HTMLInputElement>(null),
    importRef = useRef<HTMLInputElement>(null),
    t: Copy = copy[lang];
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const routeProjectId = getProjectIdFromPath(location.pathname);
  const project =
      projects.find((item) => item.id === routeProjectId) ??
      projects.find((item) => item.id === activeProjectId),
    view: "board" | "list" =
      searchParams.get("view") === "list" ? "list" : "board",
    setView = (next: "board" | "list") =>
      setSearchParams(next === "board" ? {} : { view: next }, { replace: true });
  const loadWorkspace = async (id: string, resetPath = true) => {
    const [nextProjects, nextMembers] = await Promise.all([
      api.projects(id),
      api.members(id),
    ]);
    setWorkspaceId(id);
    setProjects(nextProjects);
    setMembers(nextMembers);
    setActiveProjectId(nextProjects[0]?.id ?? "");
    setTasks([]);
    setQuery("");
    if (resetPath)
      navigate(
        nextProjects[0]
          ? appPaths.project(nextProjects[0].id)
          : appPaths.inbox,
        { replace: true },
      );
  };
  const boot = async () => {
    try {
      const me = await api.me();
      setUser(me.user.name);
      setUserId(me.user.id);
      const next = await api.workspaces();
      setWorkspaces(next);
      if (!next[0]) throw new Error("请先创建工作区");
      await loadWorkspace(next[0].id, false);
      setAuth("in");
    } catch {
      setAuth("out");
    }
  };
  useEffect(() => {
    void boot();
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    localStorage.setItem("lang", lang);
  }, [lang]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!project || !workspaceId) return;
    setError("");
    Promise.all([
      api.columns(workspaceId, project.id),
      api.tasks(workspaceId, project.id),
    ])
      .then(([nextColumns, nextTasks]) => {
        setColumns(
          nextColumns.map((column) => ({
            id: column.id,
            label: column.name,
            accent: column.color,
          })),
        );
        setTasks(nextTasks);
      })
      .catch((reason) => setError(reason.message));
  }, [workspaceId, projects, project?.id]);
  useEffect(() => {
    if (
      routeProjectId &&
      routeProjectId !== activeProjectId &&
      projects.some((item) => item.id === routeProjectId)
    )
      setActiveProjectId(routeProjectId);
  }, [routeProjectId, projects, activeProjectId]);
  useEffect(() => {
    if (
      routeProjectId &&
      projects.length > 0 &&
      !projects.some((item) => item.id === routeProjectId)
    )
      navigate(appPaths.project(projects[0].id), { replace: true });
  }, [routeProjectId, projects, navigate]);
  const shownTasks = useMemo(
    () =>
      filterTasks(tasks, query).filter(
        (task) => kind === "ALL" || task.kind === kind,
      ),
    [tasks, query, kind],
  );
  const selectedTaskCount=selectedTaskIds.length,allShownSelected=shownTasks.length>0&&shownTasks.every(task=>selectedTaskIds.includes(task.id));
  useEffect(()=>{setSelectedTaskIds([]);setConfirmingBulkDelete(false)},[workspaceId,project?.id,view,query,kind])
  const reload = async () => {
    if (project) setTasks(await api.tasks(workspaceId, project.id));
  };
  const updateTask = async (next: Task) => {
    try {
      if (next.id === "new") await api.createTask(workspaceId, next);
      else await api.updateTask(workspaceId, next);
      setEditing(null);
      await reload();
      toast.success(lang === "zh" ? "任务已保存" : "Task saved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    }
  };
  const toggleTaskSelection=(taskId:string,checked:boolean)=>setSelectedTaskIds(current=>checked?[...new Set([...current,taskId])]:current.filter(id=>id!==taskId))
  const toggleAllShown=(checked:boolean)=>setSelectedTaskIds(current=>checked?[...new Set([...current,...shownTasks.map(task=>task.id)])]:current.filter(id=>!shownTasks.some(task=>task.id===id)))
  const applyBulk=async(action:Parameters<typeof api.bulkUpdateTasks>[2],success:string)=>{
    if(!selectedTaskIds.length)return
    setBulkBusy(true);setError('')
    try{const result=await api.bulkUpdateTasks(workspaceId,selectedTaskIds,action);await reload();setSelectedTaskIds([]);setConfirmingBulkDelete(false);toast.success(lang==='zh'?`已更新 ${result.updated} 个任务`:`${result.updated} tasks ${success}`)}
    catch(reason){setError(reason instanceof Error?reason.message:(lang==='zh'?'批量操作失败':'Bulk action failed'))}
    finally{setBulkBusy(false)}
  }
  const createTask = (due = "") => {
    const column = columns[0];
    if (project && column)
      setEditing({
        id: "new",
        number: 0,
        projectId: project.id,
        title: "",
        kind: "TASK",
        column: column.id,
        priority: "中",
        assignee: user,
        assigneeId: members.find((member) => member.name === user)?.id ?? "",
        due,
        tags: [],
        description: "",
        version: 1,
      });
  };
  const quickCreate=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault()
    const title=quickTitle.trim(),column=columns[0]
    if(!title||!project||!column)return
    setQuickBusy(true);setError('')
    try{
      await api.createTask(workspaceId,{id:'new',number:0,projectId:project.id,title,kind:'TASK',column:column.id,priority:'中',assignee:user,assigneeId:members.find(member=>member.name===user)?.id??'',due:'',tags:[],description:'',version:1})
      setQuickTitle('');await reload();toast.success(lang==='zh'?'任务已创建':'Task created')
    }catch(reason){setError(reason instanceof Error?reason.message:(lang==='zh'?'创建失败':'Creation failed'))}
    finally{setQuickBusy(false)}
  }
  const closeTaskImport=()=>{setImportFile(null);setImportPreview(null);setImportMapping(null);setImportBusy(false);if(importRef.current)importRef.current.value=''}
  const previewTaskImport=async(file:File,mapping?:TaskWorkbookMapping)=>{
    if(!project)return
    if(!file.name.toLowerCase().endsWith('.xlsx')){setError(lang==='zh'?'仅支持 .xlsx 文件':'Only .xlsx files are supported');return}
    setImportFile(file);setImportBusy(true);setError('')
    try{const result=await api.previewTaskImport(workspaceId,file,project.id,mapping);setImportPreview(result);setImportMapping(result.mapping)}
    catch(reason){closeTaskImport();setError(reason instanceof Error?reason.message:'Excel 预览失败')}
    finally{setImportBusy(false)}
  }
  const changeImportMapping=(index:number,role:TaskColumnRole)=>setImportMapping(current=>{if(!current)return current;const next={...current,descriptionColumns:current.descriptionColumns.filter(value=>value!==index),kindColumn:current.kindColumn===index?null:current.kindColumn,priorityColumn:current.priorityColumn===index?null:current.priorityColumn,titleColumn:current.titleColumn===index?-1:current.titleColumn};if(role==='TITLE')next.titleColumn=index;if(role==='DESCRIPTION')next.descriptionColumns=[...next.descriptionColumns,index].sort((a,b)=>a-b);if(role==='KIND')next.kindColumn=index;if(role==='PRIORITY')next.priorityColumn=index;return next})
  const confirmTaskImport=async()=>{
    const column=columns[0]
    if(!project||!column||!importFile||!importMapping)return
    setImportBusy(true)
    try{const result=await api.importTasks(workspaceId,importFile,project.id,column.id,importMapping);await reload();closeTaskImport();toast.success(lang==='zh'?`已导入 ${result.imported} 个任务，跳过 ${result.duplicateRows} 个重复项`:`Imported ${result.imported} tasks; skipped ${result.duplicateRows} duplicates`)}
    catch(reason){setError(reason instanceof Error?reason.message:'Excel 导入失败')}
    finally{setImportBusy(false)}
  }
  const dropImport=(event:DragEvent)=>{event.preventDefault();setImportDragging(false);const file=event.dataTransfer.files[0];if(file)void previewTaskImport(file)}
  const move = async (id: string, column: ColumnId) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    setTasks((current) => moveTask(current, id, column));
    try {
      const result = await api.updateTask(workspaceId, { ...task, column });
      setTasks((current) =>
        current.map((item) =>
          item.id === id ? { ...item, column, version: result.version } : item,
        ),
      );
    } catch (reason) {
      setTasks((current) => moveTask(current, id, task.column));
      setError(reason instanceof Error ? reason.message : "移动失败");
    }
  };
  const createProject = async (name: string, code?: string) => {
    await api.createProject(workspaceId, { name, code: code! });
    const next = await api.projects(workspaceId);
    setProjects(next);
    const created = next[next.length - 1];
    if (created) {
      setActiveProjectId(created.id);
      navigate(appPaths.project(created.id));
    }
    toast.success(lang === "zh" ? "项目已创建" : "Project created");
  };
  const createWorkspace = async (name: string) => {
    const workspace = await api.createWorkspace(name);
    await api.createProject(workspace.id, {
      name: lang === "zh" ? "第一个项目" : "First project",
      code: "TEAM",
    });
    const next = await api.workspaces();
    setWorkspaces(next);
    await loadWorkspace(workspace.id);
    toast.success(lang === "zh" ? "工作区已创建" : "Workspace created");
  };
  const renameProject = async (target: Project, name: string) => {
    if (name === target.name) return;
    await api.updateProject(workspaceId, target.id, { name });
    const next = await api.projects(workspaceId);
    setProjects(next);
    toast.success(lang === "zh" ? "项目已重命名" : "Project renamed");
  };
  const selectWorkspace = async (id: string) => {
    try {
      await loadWorkspace(id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "切换失败");
    }
  };
  const deleteProject = async () => {
    if (!deleting) return;
    try {
      await api.deleteProject(workspaceId, deleting.id);
      const next = await api.projects(workspaceId);
      setDeleting(null);
      setProjects(next);
      if (deleting.id === project?.id) {
        const fallback = next[0];
        setActiveProjectId(fallback?.id ?? "");
        navigate(
          fallback ? appPaths.project(fallback.id) : appPaths.inbox,
          { replace: true },
        );
      } else if (!next.some((item) => item.id === activeProjectId)) {
        setActiveProjectId(next[0]?.id ?? "");
      }
      toast.success(lang === "zh" ? "项目已删除" : "Project deleted");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败");
    }
  };
  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setAuth("out");
      setUserId("");
      setTasks([]);
      setProjects([]);
      setWorkspaces([]);
    }
  };
  if (auth === "loading") return <main className="boot">正在连接工作区…</main>;
  const inviteToken = matchPath(appPaths.invitePattern, location.pathname)?.params.token;
  const setupToken = matchPath(appPaths.setupPattern, location.pathname)?.params.token;
  if (auth === "out") {
    if (inviteToken) return <InviteScreen token={decodeURIComponent(inviteToken)} onReady={() => void boot()} />;
    if (setupToken) return <SetupScreen token={decodeURIComponent(setupToken)} onReady={() => void boot()} />;
    return location.pathname === appPaths.login ? (
      <AuthScreen onReady={() => void boot()} />
    ) : (
      <Navigate to={appPaths.login} replace />
    );
  }
  if (location.pathname === appPaths.login)
    return <Navigate to={appPaths.home} replace />;
  const sidebar = (
    <AppSidebar
      workspaces={workspaces}
      workspaceId={workspaceId}
      onWorkspace={(id) => void selectWorkspace(id)}
      onNewWorkspace={() => setCreating("workspace")}
      projects={projects}
      activeProjectId={project?.id ?? ""}
      onNewProject={() => setCreating("project")}
      onRenameProject={setRenaming}
      onDeleteProject={setDeleting}
      taskCount={tasks.length}
      user={user}
      lang={lang}
      setLang={setLang}
      theme={theme}
      setTheme={setTheme}
      onLogout={() => void logout()}
      t={t}
    />
  );
  return (
    <SidebarProvider className="app-shell" style={{ "--sidebar-width": "228px" } as CSSProperties}>
      {sidebar}
      <SidebarInset className="workspace">
        <header className="topbar">
          <SidebarTrigger className="sidebar-toggle" aria-label={lang === "zh" ? "切换侧边栏" : "Toggle sidebar"} />
          <InputGroup className="search">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              ref={searchRef}
              type="search"
              aria-label={t.search}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (event.target.value && !routeProjectId && project)
                  navigate(appPaths.project(project.id));
              }}
              placeholder={t.search}
            />
            <InputGroupAddon align="inline-end">
              {query ? (
                <InputGroupButton
                  size="icon-xs"
                  aria-label={t.clearSearch}
                  onClick={() => setQuery("")}
                >
                  <X />
                </InputGroupButton>
              ) : (
                <Kbd>⌘ K</Kbd>
              )}
            </InputGroupAddon>
          </InputGroup>
          {members.length ? (
            <Button
              variant="ghost"
              className="member-stack"
              aria-label={t.viewMembers}
              onClick={() => navigate(appPaths.members)}
            >
              <AvatarGroup>
                {members.slice(0, 3).map((member) => (
                  <UserAvatar name={member.name} small key={member.id} />
                ))}
                {members.length > 3 ? (
                  <AvatarGroupCount>+{members.length - 3}</AvatarGroupCount>
                ) : null}
              </AvatarGroup>
            </Button>
          ) : null}
        </header>
        <Routes>
          {project ? (
          <>
          <Route
            index
            element={<Navigate to={appPaths.project(project.id)} replace />}
          />
          <Route
            path={appPaths.legacyTasks.slice(1)}
            element={<Navigate to={appPaths.project(project.id)} replace />}
          />
          <Route path={appPaths.projectPattern.slice(1)} element={
          <>
            <section className="page-head">
              <Breadcrumb className="breadcrumbs">
                <BreadcrumbList>
                  <BreadcrumbItem>{t.project}</BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{project.name}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <div className="title-row">
                <div>
                  <span className="eyebrow">
                    {project.code} · {t.inProgress}
                  </span>
                  <h1>{project.name}</h1>
                  <p>{t.tagline}</p>
                </div>
                <span className="title-actions">
                  <input ref={importRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={event=>event.target.files?.[0]&&void previewTaskImport(event.target.files[0])}/>
                  <Button variant="outline" className={`excel-drop ${importDragging?'is-dragging':''}`} onClick={()=>importRef.current?.click()} onDragEnter={event=>{event.preventDefault();setImportDragging(true)}} onDragOver={event=>event.preventDefault()} onDragLeave={()=>setImportDragging(false)} onDrop={dropImport}>
                    <FileUp data-icon="inline-start" />
                    {importDragging?(lang==='zh'?'松开导入':'Drop to import'):(lang==='zh'?'拖拽或选择 Excel':'Drop or choose Excel')}
                  </Button>
                  <Button onClick={()=>createTask()}>
                    <Plus data-icon="inline-start" />
                    {t.newTask}
                  </Button>
                </span>
              </div>
              {error ? (
                <p className="page-error" role="alert">
                  {error}
                </p>
              ) : null}
            </section>
            <form className="quick-entry" onSubmit={quickCreate}>
              <Plus aria-hidden="true"/>
              <Input aria-label={t.quickEntry} placeholder={t.quickEntry} value={quickTitle} maxLength={300} disabled={quickBusy} onChange={event=>setQuickTitle(event.target.value)}/>
              <Button type="submit" size="sm" disabled={quickBusy||!quickTitle.trim()}>{quickBusy?(lang==='zh'?'创建中…':'Creating…'):(lang==='zh'?'创建':'Create')}</Button>
            </form>
            <section className="toolbar">
              <ToggleGroup
                value={[view]}
                onValueChange={(values) =>
                  values[0] && setView(values[0] as "board" | "list")
                }
              >
                <ToggleGroupItem value="board">
                  <LayoutDashboard data-icon="inline-start" />
                  {t.board}
                </ToggleGroupItem>
                <ToggleGroupItem value="list">
                  <List data-icon="inline-start" />
                  {t.list}
                </ToggleGroupItem>
              </ToggleGroup>
              <div className="filters">
                <Filter />
                <ChoiceSelect
                  label={t.type}
                  value={kind}
                  options={[
                    { value: "ALL", label: t.allTypes },
                    { value: "TASK", label: t.task },
                    { value: "STORY", label: t.story },
                    { value: "BUG", label: t.bug },
                  ]}
                  onChange={setKind}
                  className="filter-select"
                />
                <span aria-live="polite">
                  {shownTasks.length} {t.tasksCount}
                </span>
              </div>
            </section>
            {view==="list"&&selectedTaskCount>0?<section className="bulk-toolbar" aria-label={lang==='zh'?'批量操作':'Bulk actions'}>
              <strong>{selectedTaskCount} {t.selectedTasks}</strong>
              <Button size="sm" disabled={bulkBusy||!userId} onClick={()=>void applyBulk({type:'ASSIGN',assigneeIds:[userId]},'assigned')}><UserRoundCheck data-icon="inline-start"/>{t.assignToMe}</Button>
              <DropdownMenu><DropdownMenuTrigger render={<Button type="button" size="sm" variant="outline" disabled={bulkBusy}/>}>{t.changeAssignee}<ChevronDown data-icon="inline-end"/></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuGroup><DropdownMenuLabel>{t.assignee}</DropdownMenuLabel><DropdownMenuItem onClick={()=>void applyBulk({type:'ASSIGN',assigneeIds:[]},'unassigned')}>{t.unassigned}</DropdownMenuItem><DropdownMenuSeparator/>{members.filter(member=>!member.disabledAt).map(member=><DropdownMenuItem key={member.id} onClick={()=>void applyBulk({type:'ASSIGN',assigneeIds:[member.id]},'assigned')}>{member.name}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
              <DropdownMenu><DropdownMenuTrigger render={<Button type="button" size="sm" variant="outline" disabled={bulkBusy}/>}>{t.changeStatus}<ChevronDown data-icon="inline-end"/></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuGroup><DropdownMenuLabel>{t.status}</DropdownMenuLabel>{columns.map(column=><DropdownMenuItem key={column.id} onClick={()=>void applyBulk({type:'MOVE',columnId:column.id},'moved')}><ArrowRight/>{column.label}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
              <DropdownMenu><DropdownMenuTrigger render={<Button type="button" size="sm" variant="outline" disabled={bulkBusy}/>}>{t.changeType}<ChevronDown data-icon="inline-end"/></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuGroup><DropdownMenuLabel>{t.type}</DropdownMenuLabel>{([['TASK',t.task],['STORY',t.story],['BUG',t.bug]] as const).map(([nextKind,label])=><DropdownMenuItem key={nextKind} onClick={()=>void applyBulk({type:'KIND',kind:nextKind},'updated')}><List/>{label}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
              <DropdownMenu><DropdownMenuTrigger render={<Button type="button" size="sm" variant="outline" disabled={bulkBusy}/>}>{t.changePriority}<ChevronDown data-icon="inline-end"/></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuGroup><DropdownMenuLabel>{t.priority}</DropdownMenuLabel>{([['HIGH',t.high],['MEDIUM',t.medium],['LOW',t.low]] as const).map(([priority,label])=><DropdownMenuItem key={priority} onClick={()=>void applyBulk({type:'PRIORITY',priority},'updated')}><Flag/>{label}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
              <Button type="button" size="sm" variant="destructive" disabled={bulkBusy} onClick={()=>setConfirmingBulkDelete(true)}><Trash2 data-icon="inline-start"/>{t.bulkDelete}</Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={t.clearSelection} disabled={bulkBusy} onClick={()=>setSelectedTaskIds([])}><X/></Button>
            </section>:null}
            {query && shownTasks.length === 0 ? (
              <Empty className="search-empty">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search />
                  </EmptyMedia>
                  <EmptyTitle>{t.noResults}</EmptyTitle>
                  <Button variant="link" onClick={() => setQuery("")}>
                    {t.clearSearch}
                  </Button>
                </EmptyHeader>
              </Empty>
            ) : view === "board" ? (
              <section className="board">
                {columns.map((column) => {
                  const columnTasks = shownTasks.filter(
                    (task) => task.column === column.id,
                  );
                  return (
                    <div
                      className="column"
                      key={column.id}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) =>
                        void move(
                          event.dataTransfer.getData("text/plain"),
                          column.id,
                        )
                      }
                    >
                      <div className="column-head">
                        <span
                          className="status-dot"
                          style={{ background: column.accent }}
                        />
                        <h2>{column.label}</h2>
                        <Badge variant="secondary">{columnTasks.length}</Badge>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`${t.addTask} ${column.label}`}
                          onClick={()=>createTask()}
                        >
                          <Plus />
                        </Button>
                      </div>
                      <div className="task-list">
                        {columnTasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            onEdit={setEditing}
                            t={t}
                            code={project.code}
                          />
                        ))}
                        {columnTasks.length === 0 ? (
                          <Empty className="empty">
                            <EmptyHeader>
                              <EmptyMedia>
                                <Sparkles />
                              </EmptyMedia>
                              <EmptyTitle>{t.emptyColumn}</EmptyTitle>
                            </EmptyHeader>
                          </Empty>
                        ) : null}
                      </div>
                      <Button
                        variant="ghost"
                        className="add-inline"
                        onClick={()=>createTask()}
                      >
                        <Plus data-icon="inline-start" />
                        {t.addTask}
                      </Button>
                    </div>
                  );
                })}
              </section>
            ) : (
              <section className="list-view">
                <div className="list-head">
                  <Checkbox aria-label={t.selectAllTasks} checked={allShownSelected} onCheckedChange={checked=>toggleAllShown(Boolean(checked))}/>
                  <span>{t.task}</span>
                  <span>{t.status}</span>
                  <span>{t.assignee}</span>
                  <span>{t.due}</span>
                </div>
                {shownTasks.map((task) => (
                  <div className="list-row" data-selected={selectedTaskIds.includes(task.id)||undefined} key={task.id}>
                    <Checkbox aria-label={`${lang==='zh'?'选择':'Select'} ${project.code}-${task.number}`} checked={selectedTaskIds.includes(task.id)} onCheckedChange={checked=>toggleTaskSelection(task.id,Boolean(checked))}/>
                    <Button variant="ghost" onClick={() => setEditing(task)}>
                      <span><b>{project.code}-{task.number}</b>{task.title}{task.subtaskTotal?<small className="list-task-progress"><List/>{task.subtaskDone}/{task.subtaskTotal}</small>:null}</span>
                      <span>{columns.find((column) => column.id === task.column)?.label}</span>
                      <span><UserAvatar name={task.assignee} small />{task.assignee}</span>
                      <span>{task.due}</span>
                    </Button>
                  </div>
                ))}
              </section>
            )}
          </>
          } />
          </>
          ) : (
          <>
            <Route index element={
              <section className="boot">
                <Button onClick={() => setCreating("project")}>
                  {t.createFirst}
                </Button>
              </section>
            } />
            <Route path={appPaths.legacyTasks.slice(1)} element={<Navigate to={appPaths.home} replace />} />
            <Route path={appPaths.projectPattern.slice(1)} element={<Navigate to={appPaths.home} replace />} />
          </>
          )}
          {workspacePageRoutes.map((nextPage) => (
            <Route key={nextPage} path={nextPage} element={
          <Suspense fallback={<section className="boot">{lang === "zh" ? "正在加载工作区…" : "Loading workspace…"}</section>}><WorkspacePage
            page={nextPage}
            tasks={tasks}
            workspaceId={workspaceId}
            projectId={project?.id ?? ""}
            projectCount={projects.length}
            user={user}
            lang={lang}
            projects={projects}
            onTasksChanged={reload}
            onTaskOpen={setEditing}
            onTaskCreate={createTask}
            onTaskDueChange={async (task,due)=>{try{await api.updateTask(workspaceId,{...task,due});await reload();toast.success(lang==='zh'?'截止日期已更新':'Due date updated')}catch(reason){setError(reason instanceof Error?reason.message:'更新截止日期失败')}}}
            workspaceRole={workspaces.find((item) => item.id === workspaceId)?.role ?? "VIEWER"}
            onWorkspaceRestored={async (id) => { const next=await api.workspaces();setWorkspaces(next);await loadWorkspace(id) }}
          /></Suspense>
          } />
          ))}
          <Route path="*" element={<Navigate to={appPaths.home} replace />} />
        </Routes>
      </SidebarInset>
      {project ? (
        <TaskDialog
          task={editing}
          workspaceId={workspaceId}
          columns={columns}
          members={members}
          code={project.code}
          onClose={() => setEditing(null)}
          onSave={updateTask}
          onDelete={async task=>{await api.deleteTask(workspaceId,task.id);setEditing(null);await reload();toast.success(lang==='zh'?'任务已删除':'Task deleted')}}
          onSubtasksChanged={reload}
          t={t}
        />
      ) : null}
      <TaskImportDialog file={importFile} preview={importPreview} mapping={importMapping} busy={importBusy} en={lang==='en'} onClose={closeTaskImport} onMappingChange={changeImportMapping} onRefresh={()=>importFile&&importMapping&&void previewTaskImport(importFile,importMapping)} onImport={()=>void confirmTaskImport()}/>
      <CreateDialog
        kind={creating}
        lang={lang}
        onClose={() => setCreating(null)}
        onCreate={(name, code) =>
          code ? createProject(name, code) : createWorkspace(name)
        }
      />
      <RenameProjectDialog
        project={renaming}
        lang={lang}
        onClose={() => setRenaming(null)}
        onRename={renameProject}
      />
      <AlertDialog open={confirmingBulkDelete} onOpenChange={open=>!bulkBusy&&setConfirmingBulkDelete(open)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t.bulkDeleteTitle}</AlertDialogTitle><AlertDialogDescription><strong>{selectedTaskCount} {t.selectedTasks}</strong><br/>{t.bulkDeleteDescription}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={bulkBusy}>{t.cancel}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={bulkBusy} onClick={()=>void applyBulk({type:'DELETE'},'deleted')}>{bulkBusy?(lang==='zh'?'删除中…':'Deleting…'):t.bulkDelete}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.name}</strong>
              <br />
              {t.deleteDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void deleteProject()}
            >
              {t.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster theme={theme} />
    </SidebarProvider>
  );
}
