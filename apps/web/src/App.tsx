import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Command,
  FileText,
  Filter,
  LayoutDashboard,
  List,
  LogOut,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  ColumnId,
  Priority,
  Task,
  TaskKind,
  filterTasks,
  moveTask,
} from "./board";
import { api } from "./api";
import AuthScreen from "./AuthScreen";
import WorkspacePage, { Page } from "./WorkspacePage";
import ChoiceSelect from "./components/ChoiceSelect";
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
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "./components/ui/avatar";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
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
import { Toaster } from "./components/ui/sonner";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";

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

function Sidebar({
  workspaces,
  workspaceId,
  onWorkspace,
  onNewWorkspace,
  projects,
  page,
  onNavigate,
  activeProject,
  setActiveProject,
  onNewProject,
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
  page: Page;
  onNavigate: (page: Page) => void;
  activeProject: number;
  setActiveProject: (index: number) => void;
  onNewProject: () => void;
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
  return (
    <aside className="sidebar">
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
      <nav aria-label="主导航">
        <p className="nav-label">{t.switchWorkspace}</p>
        <Button
          variant="ghost"
          className={`nav-item ${page === "overview" ? "active" : ""}`}
          onClick={() => onNavigate("overview")}
        >
          <LayoutDashboard data-icon="inline-start" />
          {t.overview}
        </Button>
        <Button
          variant="ghost"
          className={`nav-item ${page === "tasks" ? "active" : ""}`}
          onClick={() => onNavigate("tasks")}
        >
          <Command data-icon="inline-start" />
          {t.myTasks}
          <Badge className="count" variant="secondary">
            {taskCount}
          </Badge>
        </Button>
        <Button
          variant="ghost"
          className={`nav-item ${page === "calendar" ? "active" : ""}`}
          onClick={() => onNavigate("calendar")}
        >
          <CalendarDays data-icon="inline-start" />
          {t.calendar}
        </Button>
        <Button
          variant="ghost"
          className={`nav-item ${page === "documents" ? "active" : ""}`}
          onClick={() => onNavigate("documents")}
        >
          <FileText data-icon="inline-start" />
          {t.documents}
        </Button>
        <Button
          variant="ghost"
          className={`nav-item ${page === "plans" ? "active" : ""}`}
          onClick={() => onNavigate("plans")}
        >
          <Sparkles data-icon="inline-start" />
          {t.plans}
        </Button>
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
        {projects.map((project, index) => (
          <div className="project-row" key={project.id}>
            <Button
              variant="ghost"
              className={`project-link ${index === activeProject ? "selected" : ""}`}
              onClick={() => setActiveProject(index)}
            >
              <span
                className="project-dot"
                style={{ background: project.color }}
              />
              {project.name}
            </Button>
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
        <Button
          variant="ghost"
          className={`nav-item ${page === "archived" ? "active" : ""}`}
          onClick={() => onNavigate("archived")}
        >
          <Archive data-icon="inline-start" />
          {t.archived}
        </Button>
      </nav>
      <div className="sidebar-bottom">
        <Button
          variant="ghost"
          className={`nav-item ${page === "members" ? "active" : ""}`}
          onClick={() => onNavigate("members")}
        >
          <Users data-icon="inline-start" />
          {t.members}
        </Button>
        <Button
          variant="ghost"
          className={`nav-item ${page === "settings" ? "active" : ""}`}
          onClick={() => onNavigate("settings")}
        >
          <Settings data-icon="inline-start" />
          {t.settings}
        </Button>
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
              <DropdownMenuItem onClick={() => onNavigate("settings")}>
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
    </aside>
  );
}

function TaskCard({
  task,
  columns,
  onMove,
  onEdit,
  t,
}: {
  task: Task;
  columns: BoardColumn[];
  onMove: (id: string, column: ColumnId) => void;
  onEdit: (task: Task) => void;
  t: Copy;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <Button
      render={<article className={`task-card ${dragging ? "dragging" : ""}`} />}
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
        <Badge
          variant="ghost"
          className={`priority priority--${task.priority}`}
        >
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
        <Badge variant={task.kind === "BUG" ? "destructive" : "secondary"}>
          {task.kind === "BUG"
            ? t.bug
            : task.kind === "STORY"
              ? t.story
              : t.task}
        </Badge>
      </span>
      <span className="task-title">{task.title}</span>
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
          {task.due}
        </span>
        <UserAvatar name={task.assignee} small />
      </span>
      <span
        className="card-status"
        onClick={(event) => event.stopPropagation()}
      >
        <ChoiceSelect
          label={`${t.status} ${task.title}`}
          value={task.column}
          options={columns.map((column) => ({
            value: column.id,
            label: column.label,
          }))}
          onChange={(column) => onMove(task.id, column)}
          className="card-status-select"
        />
      </span>
    </Button>
  );
}

function TaskDialog({
  task,
  columns,
  members,
  code,
  onClose,
  onSave,
  t,
}: {
  task: Task | null;
  columns: BoardColumn[];
  members: Member[];
  code: string;
  onClose: () => void;
  onSave: (task: Task) => void;
  t: Copy;
}) {
  const [draft, setDraft] = useState<Task | null>(task);
  useEffect(() => setDraft(task), [task]);
  if (!draft) return null;
  const people = members.length
    ? members.map((member) => member.name)
    : [draft.assignee];
  return (
    <Dialog open={Boolean(task)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="dialog">
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            onSave(draft);
          }}
        >
          <DialogHeader>
            <span className="dialog-key">
              {code}-{draft.number || "NEW"}
            </span>
            <DialogTitle>{t.taskDetails}</DialogTitle>
            <DialogDescription>{t.tagline}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="dialog-fields">
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
                  value={draft.assignee}
                  options={people.map((value) => ({ value, label: value }))}
                  onChange={(assignee) => setDraft({ ...draft, assignee })}
                  className="choice-select"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="task-due">{t.due}</FieldLabel>
                <Input
                  id="task-due"
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
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t.cancel}
            </Button>
          <Button type="submit">
              <Check data-icon="inline-start" />
              {t.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
export default function App() {
  const [auth, setAuth] = useState<"loading" | "out" | "in">("loading"),
    [user, setUser] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]),
    [workspaceId, setWorkspaceId] = useState(""),
    [projects, setProjects] = useState<Project[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [columns, setColumns] = useState<BoardColumn[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState<"ALL" | TaskKind>("ALL");
  const [page, setPage] = useState<Page>("tasks"),
    [activeProject, setActiveProject] = useState(0),
    [view, setView] = useState<"board" | "list">("board"),
    [editing, setEditing] = useState<Task | null>(null),
    [deleting, setDeleting] = useState<Project | null>(null),
    [creating, setCreating] = useState<"workspace" | "project" | null>(null);
  const [lang, setLang] = useState<Lang>(
      () => (localStorage.getItem("lang") as Lang) || "zh",
    ),
    [theme, setTheme] = useState<Theme>(
      () => (localStorage.getItem("theme") as Theme) || "light",
    );
  const searchRef = useRef<HTMLInputElement>(null),
    t: Copy = copy[lang];
  const loadWorkspace = async (id: string) => {
    const [nextProjects, nextMembers] = await Promise.all([
      api.projects(id),
      api.members(id),
    ]);
    setWorkspaceId(id);
    setProjects(nextProjects);
    setMembers(nextMembers);
    setActiveProject(0);
    setTasks([]);
    setQuery("");
    setPage("tasks");
  };
  const boot = async () => {
    try {
      const me = await api.me();
      setUser(me.user.name);
      const next = await api.workspaces();
      setWorkspaces(next);
      if (!next[0]) throw new Error("请先创建工作区");
      await loadWorkspace(next[0].id);
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
    const project = projects[activeProject];
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
  }, [workspaceId, projects, activeProject]);
  const shownTasks = useMemo(
      () =>
        filterTasks(tasks, query).filter(
          (task) => kind === "ALL" || task.kind === kind,
        ),
      [tasks, query, kind],
    ),
    project = projects[activeProject];
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
  const createTask = () => {
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
        due: "未设置",
        tags: [],
        version: 1,
      });
  };
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
    setActiveProject(next.length - 1);
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
      setDeleting(null);
      setActiveProject(0);
      setProjects(await api.projects(workspaceId));
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
      setTasks([]);
      setProjects([]);
      setWorkspaces([]);
    }
  };
  if (auth === "loading") return <main className="boot">正在连接工作区…</main>;
  if (auth === "out") return <AuthScreen onReady={() => void boot()} />;
  const sidebar = (
    <Sidebar
      workspaces={workspaces}
      workspaceId={workspaceId}
      onWorkspace={(id) => void selectWorkspace(id)}
      onNewWorkspace={() => setCreating("workspace")}
      projects={projects}
      page={page}
      onNavigate={setPage}
      activeProject={activeProject}
      setActiveProject={(index) => {
        setActiveProject(index);
        setPage("tasks");
      }}
      onNewProject={() => setCreating("project")}
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
    <div className="app-shell">
      {sidebar}
      <main className="workspace">
        <header className="topbar">
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
                if (event.target.value) setPage("tasks");
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
              onClick={() => setPage("members")}
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
        {!project ? (
          <section className="boot">
            <Button onClick={() => setCreating("project")}>
              {t.createFirst}
            </Button>
          </section>
        ) : page === "tasks" ? (
          <>
            <section className="page-head">
              <div className="breadcrumbs">
                <span>{t.project}</span>
                <b>/</b>
                <span>{project.name}</span>
              </div>
              <div className="title-row">
                <div>
                  <span className="eyebrow">
                    {project.code} · {t.inProgress}
                  </span>
                  <h1>{project.name}</h1>
                  <p>{t.tagline}</p>
                </div>
                <Button onClick={createTask}>
                  <Plus data-icon="inline-start" />
                  {t.newTask}
                </Button>
              </div>
              {error ? (
                <p className="page-error" role="alert">
                  {error}
                </p>
              ) : null}
            </section>
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
                          onClick={createTask}
                        >
                          <Plus />
                        </Button>
                      </div>
                      <div className="task-list">
                        {columnTasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            columns={columns}
                            onMove={(id, column) => void move(id, column)}
                            onEdit={setEditing}
                            t={t}
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
                        onClick={createTask}
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
                  <span>{t.task}</span>
                  <span>{t.status}</span>
                  <span>{t.assignee}</span>
                  <span>{t.due}</span>
                </div>
                {shownTasks.map((task) => (
                  <Button
                    variant="ghost"
                    key={task.id}
                    onClick={() => setEditing(task)}
                  >
                    <span>
                      <b>
                        {project.code}-{task.number}
                      </b>
                      {task.title}
                    </span>
                    <span>
                      {
                        columns.find((column) => column.id === task.column)
                          ?.label
                      }
                    </span>
                    <span>
                      <UserAvatar name={task.assignee} small />
                      {task.assignee}
                    </span>
                    <span>{task.due}</span>
                  </Button>
                ))}
              </section>
            )}
          </>
        ) : (
          <WorkspacePage
            page={page}
            tasks={tasks}
            workspaceId={workspaceId}
            projectId={project.id}
            projectCount={projects.length}
            user={user}
            lang={lang}
            projects={projects}
            onTasksChanged={reload}
          />
        )}
      </main>
      {project ? (
        <TaskDialog
          task={editing}
          columns={columns}
          members={members}
          code={project.code}
          onClose={() => setEditing(null)}
          onSave={(task) => void updateTask(task)}
          t={t}
        />
      ) : null}
      <CreateDialog
        kind={creating}
        lang={lang}
        onClose={() => setCreating(null)}
        onCreate={(name, code) =>
          code ? createProject(name, code) : createWorkspace(name)
        }
      />
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
    </div>
  );
}
