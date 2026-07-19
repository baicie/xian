import { DragEvent, FormEvent, lazy, Suspense, useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleAlert,
  FolderKanban,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { Task } from "./board";
import { api } from "./api";
import ChoiceSelect from "./components/ChoiceSelect";
import { Avatar, AvatarFallback } from "./components/ui/avatar";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "./components/ui/field";
import { Input } from "./components/ui/input";
import McpTokensPanel from "./features/settings/McpTokensPanel";
import TransferPanel from "./features/settings/TransferPanel";
import GitHubPanel from "./features/settings/GitHubPanel";

const DocumentsPage = lazy(() => import("./features/documents/DocumentsPage"));
const PlansPage = lazy(() => import("./features/plans/PlansPage"));

export type Page =
  "overview" | "tasks" | "calendar" | "plans" | "documents" | "archived" | "members" | "settings";
type Props = {
  page: Exclude<Page, "tasks">;
  tasks: Task[];
  workspaceId: string;
  projectId: string;
  projectCount: number;
  user: string;
  lang: "zh" | "en";
  projects: { id: string; name: string }[];
  onTasksChanged: () => Promise<void>;
  onTaskOpen: (task: Task) => void;
  onTaskCreate: (due: string) => void;
  onTaskDueChange: (task: Task, due: string) => Promise<void>;
  workspaceRole: string;
  onWorkspaceRestored: (workspaceId: string) => Promise<void>;
};
type Role = "ADMIN" | "MEMBER" | "VIEWER";

export default function WorkspacePage({
  page,
  tasks,
  workspaceId,
  projectId,
  projectCount,
  user,
  lang,
  projects,
  onTasksChanged,
  onTaskOpen,
  onTaskCreate,
  onTaskDueChange,
  workspaceRole,
  onWorkspaceRestored,
}: Props) {
  const [members, setMembers] = useState<
      Awaited<ReturnType<typeof api.members>>
    >([]),
    [archived, setArchived] = useState<Task[]>([]),
    [error, setError] = useState(""),
    [adding, setAdding] = useState(false);
  const en = lang === "en",
    loadMembers = () =>
      api
        .members(workspaceId)
        .then(setMembers)
        .catch((reason) => setError(reason.message));
  useEffect(() => {
    if (page === "members") void loadMembers();
    if (page === "archived")
      api
        .tasks(workspaceId, projectId, true)
        .then(setArchived)
        .catch((reason) => setError(reason.message));
  }, [page, workspaceId, projectId]);
  if (page === "documents") return <Suspense fallback={<main className="boot">{en ? "Loading documents…" : "正在加载文档…"}</main>}><DocumentsPage workspaceId={workspaceId} projects={projects} en={en} /></Suspense>;
  if (page === "plans") return <Suspense fallback={<main className="boot">{en ? "Loading plans…" : "正在加载计划…"}</main>}><PlansPage workspaceId={workspaceId} projects={projects} en={en} onApplied={onTasksChanged} /></Suspense>;
  if (page === "overview")
    return (
      <PageShell
        title={en ? "Overview" : "工作概览"}
        subtitle={
          en
            ? "Progress and risks in the current project"
            : "当前项目的进度与风险"
        }
      >
        <div className="metric-grid">
          <Metric
            icon={<FolderKanban />}
            value={projectCount}
            label={en ? "Projects" : "项目"}
          />
          <Metric
            icon={<CircleAlert />}
            value={tasks.filter((task) => task.kind === "BUG").length}
            label={en ? "Open bugs" : "未归档 Bug"}
          />
          <Metric
            icon={<CheckCircle2 />}
            value={tasks.length}
            label={en ? "Tasks" : "任务总数"}
          />
        </div>
        <TaskRows
          tasks={tasks.slice(0, 6)}
          empty={en ? "No tasks yet" : "还没有任务"}
          en={en}
        />
      </PageShell>
    );
  if (page === "calendar")
    return (
      <PageShell
        title={en ? "Calendar" : "日历"}
        subtitle={en ? "Project deadlines in a monthly view" : "按月查看项目任务截止日期"}
      >
        <TaskCalendar tasks={tasks} en={en} onTaskOpen={onTaskOpen} onTaskCreate={onTaskCreate} onTaskDueChange={onTaskDueChange}/>
      </PageShell>
    );
  if (page === "archived")
    return (
      <PageShell
        title={en ? "Archived" : "已归档"}
        subtitle={
          en ? "History kept out of active work" : "保留历史，不干扰当前工作"
        }
      >
        <TaskRows
          tasks={archived}
          empty={en ? "No archived tasks" : "暂无归档任务"}
          en={en}
        />
      </PageShell>
    );
  if (page === "members")
    return (
      <>
        <PageShell
          title={en ? "Members" : "成员"}
          subtitle={
            en ? "Workspace members and permissions" : "工作区成员与权限"
          }
          action={
            <Button onClick={() => setAdding(true)}>
              <UserPlus data-icon="inline-start" />
              {en ? "Add member" : "添加成员"}
            </Button>
          }
        >
          {members.length ? (
            <div className="member-list">
              {members.map((member) => (
                <Card size="sm" key={member.id}>
                  <CardContent>
                    <Avatar>
                      <AvatarFallback>{member.name.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <span>
                      <strong>{member.name}</strong>
                      <small>{member.email}</small>
                    </span>
                    <Badge variant="secondary">{member.role}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <PageEmpty
              icon={<Users />}
              text={error || (en ? "No members" : "暂无成员")}
            />
          )}
        </PageShell>
        <AddMemberDialog
          open={adding}
          onOpenChange={setAdding}
          workspaceId={workspaceId}
          en={en}
          onAdded={async () => {
            await loadMembers();
            toast.success(en ? "Member added" : "成员已添加");
          }}
        />
      </>
    );
  return (
    <PageShell
      title={en ? "Settings" : "设置"}
      subtitle={en ? "Workspace preferences and account" : "工作区偏好与账户"}
    >
      <div className="settings-list">
        <Card size="sm">
          <CardContent>
            <Settings />
            <span>
              <strong>{en ? "Current account" : "当前账户"}</strong>
              <small>{user}</small>
            </span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <FolderKanban />
            <span>
              <strong>{en ? "Projects" : "项目数量"}</strong>
              <small>
                {projectCount} {en ? "projects" : "个项目"}
              </small>
            </span>
          </CardContent>
        </Card>
      </div>
      {workspaceRole === "OWNER" || workspaceRole === "ADMIN" ? <McpTokensPanel workspaceId={workspaceId} en={en} /> : null}
      {workspaceRole === "OWNER" || workspaceRole === "ADMIN" ? <GitHubPanel workspaceId={workspaceId} projects={projects} en={en} onTasksChanged={onTasksChanged} /> : null}
      <TransferPanel workspaceId={workspaceId} en={en} onRestored={onWorkspaceRestored} />
    </PageShell>
  );
}

function AddMemberDialog({
  open,
  onOpenChange,
  workspaceId,
  en,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  en: boolean;
  onAdded: () => Promise<void>;
}) {
  const [role, setRole] = useState<Role>("MEMBER"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const email = String(new FormData(event.currentTarget).get("email"));
    try {
      await api.addMember(workspaceId, { email, role });
      await onAdded();
      onOpenChange(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : en
            ? "Failed to add member"
            : "添加失败",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {en ? "Add workspace member" : "添加工作区成员"}
            </DialogTitle>
            <DialogDescription>
              {en
                ? "The user must register first. Add them by account email and assign a role."
                : "成员需先自行注册账号，再通过注册邮箱加入并分配角色。"}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="member-form">
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="member-email">
                {en ? "Email" : "邮箱"}
              </FieldLabel>
              <Input
                id="member-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                aria-invalid={Boolean(error)}
              />
              <FieldDescription>
                {en
                  ? "Use the email linked to their account."
                  : "请输入成员注册账号时使用的邮箱。"}
              </FieldDescription>
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel>{en ? "Role" : "角色"}</FieldLabel>
              <ChoiceSelect
                label={en ? "Role" : "角色"}
                value={role}
                options={[
                  { value: "ADMIN", label: en ? "Admin" : "管理员" },
                  { value: "MEMBER", label: en ? "Member" : "成员" },
                  { value: "VIEWER", label: en ? "Viewer" : "只读" },
                ]}
                onChange={setRole}
                className="choice-select"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {en ? "Cancel" : "取消"}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? en
                  ? "Adding…"
                  : "添加中…"
                : en
                  ? "Add member"
                  : "添加成员"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PageShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="secondary-page">
      <header>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
function Metric({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <Card className="metric">
      <CardHeader>
        <CardTitle>{value}</CardTitle>
        <CardDescription>{label}</CardDescription>
        <CardAction>{icon}</CardAction>
      </CardHeader>
    </Card>
  );
}
function TaskRows({
  tasks,
  empty,
  en,
}: {
  tasks: Task[];
  empty: string;
  en: boolean;
}) {
  return tasks.length ? (
    <div className="page-task-list">
      {tasks.map((task) => (
        <Card size="sm" key={task.id}>
          <CardContent>
            <Badge variant={task.kind === "BUG" ? "destructive" : "secondary"}>
              {task.kind === "BUG"
                ? "Bug"
                : task.kind === "STORY"
                  ? en
                    ? "Story"
                    : "需求"
                  : en
                    ? "Task"
                    : "任务"}
            </Badge>
            <strong>{task.title}</strong>
            <small>{task.due}</small>
          </CardContent>
        </Card>
      ))}
    </div>
  ) : (
    <PageEmpty icon={<CalendarDays />} text={empty} />
  );
}
function TaskCalendar({tasks,en,onTaskOpen,onTaskCreate,onTaskDueChange}:{tasks:Task[];en:boolean;onTaskOpen:(task:Task)=>void;onTaskCreate:(due:string)=>void;onTaskDueChange:(task:Task,due:string)=>Promise<void>}) {
  const today=new Date(),[cursor,setCursor]=useState(()=>new Date(today.getFullYear(),today.getMonth(),1)),[kind,setKind]=useState<'ALL'|Task['kind']>('ALL'),[assignee,setAssignee]=useState('ALL'),[dragging,setDragging]=useState<string|null>(null),year=cursor.getFullYear(),month=cursor.getMonth()
  const assignees=Array.from(new Set(tasks.map(task=>task.assignee).filter(Boolean))).sort((a,b)=>a.localeCompare(b)),filtered=tasks.filter(task=>(kind==='ALL'||task.kind===kind)&&(assignee==='ALL'||task.assignee===assignee)),datedTasks=filtered.filter(task=>/^\d{4}-\d{2}-\d{2}$/.test(task.due)),byDate=new Map<string,Task[]>()
  datedTasks.forEach(task=>byDate.set(task.due,[...(byDate.get(task.due)??[]),task]))
  const first=new Date(year,month,1),offset=(first.getDay()+6)%7,cells=Array.from({length:42},(_,index)=>new Date(year,month,1-offset+index)),format=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,todayKey=format(today),weekdays=en?['Mon','Tue','Wed','Thu','Fri','Sat','Sun']:['周一','周二','周三','周四','周五','周六','周日'],monthLabel=new Intl.DateTimeFormat(en?'en-US':'zh-CN',{year:'numeric',month:'long'}).format(cursor)
  const drop=async(event:DragEvent<HTMLDivElement>,due:string)=>{event.preventDefault();const id=event.dataTransfer.getData('text/task-id'),task=tasks.find(item=>item.id===id);setDragging(null);if(task&&task.due!==due)await onTaskDueChange(task,due)}
  return <div className="task-calendar"><div className="calendar-toolbar"><strong>{monthLabel}</strong><div className="calendar-filters"><ChoiceSelect label={en?'Task type':'任务类型'} value={kind} options={[{value:'ALL',label:en?'All types':'全部类型'},{value:'TASK',label:en?'Task':'任务'},{value:'STORY',label:en?'Story':'需求'},{value:'BUG',label:'Bug'}]} onChange={value=>setKind(value as 'ALL'|Task['kind'])}/><ChoiceSelect label={en?'Assignee':'负责人'} value={assignee} options={[{value:'ALL',label:en?'All assignees':'全部负责人'},...assignees.map(name=>({value:name,label:name}))]} onChange={setAssignee}/></div><span><Button variant="outline" size="sm" onClick={()=>setCursor(new Date(today.getFullYear(),today.getMonth(),1))}>{en?'Today':'今天'}</Button><Button variant="outline" size="icon-sm" aria-label={en?'Previous month':'上个月'} onClick={()=>setCursor(new Date(year,month-1,1))}><ChevronLeft/></Button><Button variant="outline" size="icon-sm" aria-label={en?'Next month':'下个月'} onClick={()=>setCursor(new Date(year,month+1,1))}><ChevronRight/></Button></span></div><div className="calendar-scroll"><div className="calendar-grid"><div className="calendar-weekdays">{weekdays.map(day=><span key={day}>{day}</span>)}</div><div className="calendar-days">{cells.map(date=>{const key=format(date),dayTasks=byDate.get(key)??[],outside=date.getMonth()!==month;return <div className={`calendar-day ${outside?'is-outside':''} ${key===todayKey?'is-today':''} ${dragging?'is-drop-target':''}`} key={key} role="button" tabIndex={0} aria-label={en?`Create task due ${key}`:`创建截止于 ${key} 的任务`} onClick={()=>onTaskCreate(key)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onTaskCreate(key)}}} onDragOver={event=>event.preventDefault()} onDrop={event=>void drop(event,key)}><time dateTime={key}>{date.getDate()}</time><div className="calendar-events">{dayTasks.slice(0,2).map(task=><Button type="button" variant="ghost" draggable className={`calendar-event calendar-event--${task.kind.toLowerCase()}`} key={task.id} onDragStart={event=>{event.dataTransfer.setData('text/task-id',task.id);event.dataTransfer.effectAllowed='move';setDragging(task.id)}} onDragEnd={()=>setDragging(null)} onClick={event=>{event.stopPropagation();onTaskOpen(task)}}><span>{task.title}</span></Button>)}{dayTasks.length>2?<small>+{dayTasks.length-2} {en?'more':'项'}</small>:null}</div></div>})}</div></div></div>{datedTasks.length===0?<p className="calendar-empty">{en?'No tasks match the filters. Click a date to create one.':'没有符合筛选条件的任务。点击日期即可创建。'}</p>:null}</div>
}
function PageEmpty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Empty className="page-empty">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{text}</EmptyTitle>
        <EmptyDescription> </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
