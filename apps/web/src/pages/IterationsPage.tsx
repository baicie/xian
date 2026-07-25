import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleSlash2,
  ListChecks,
  PencilLine,
  Play,
  Plus,
  RotateCcw,
  Search,
  UserRoundX,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type {
  Iteration,
  IterationTask,
  IterationTaskCandidate,
  ProjectHealth,
} from '@/models/iteration'
import ChoiceSelect from '@/components/ChoiceSelect'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Progress, ProgressLabel } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

type Project = { id: string; name: string }
type IterationDraft = Pick<Iteration, 'title' | 'goal' | 'startDate' | 'endDate'>

const today = () => new Date().toISOString().slice(0, 10)
const plusDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
const emptyDraft = (): IterationDraft => {
  const startDate = today()
  return { title: '', goal: '', startDate, endDate: plusDays(startDate, 13) }
}
const emptyCandidatePagination = {
  page: 1,
  pageSize: 25,
  totalItems: 0,
  totalPages: 0,
}

const statusCopy = {
  PLANNED: { zh: '未开始', en: 'Planned' },
  ACTIVE: { zh: '进行中', en: 'Active' },
  CLOSED: { zh: '已关闭', en: 'Closed' },
} as const

export default function IterationsPage({
  workspaceId,
  projectId,
  projects,
  en,
  canManage,
  onTasksChanged,
}: {
  workspaceId: string
  projectId: string
  projects: Project[]
  en: boolean
  canManage: boolean
  onTasksChanged: () => Promise<void>
}) {
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || projects[0]?.id || ''),
    [iterations, setIterations] = useState<Iteration[]>([]),
    [selectedIterationId, setSelectedIterationId] = useState(''),
    [tasks, setTasks] = useState<IterationTask[]>([]),
    [health, setHealth] = useState<ProjectHealth | null>(null),
    [editing, setEditing] = useState<Iteration | 'new' | null>(null),
    [addingTasks, setAddingTasks] = useState(false),
    [backlog, setBacklog] = useState<IterationTaskCandidate[]>([]),
    [backlogSearch, setBacklogSearch] = useState(''),
    [appliedBacklogSearch, setAppliedBacklogSearch] = useState(''),
    [backlogPagination, setBacklogPagination] = useState(emptyCandidatePagination),
    [backlogLoading, setBacklogLoading] = useState(false),
    [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]),
    [closing, setClosing] = useState<Iteration | null>(null),
    [closeAction, setCloseAction] = useState<'BACKLOG' | 'CARRY_OVER'>('BACKLOG'),
    [carryTargetId, setCarryTargetId] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true)

  useEffect(() => {
    if (projectId && projects.some((project) => project.id === projectId))
      setSelectedProjectId(projectId)
  }, [projectId, projects])

  const refresh = useCallback(
    async (preferredIterationId?: string) => {
      if (!selectedProjectId) {
        setIterations([])
        setHealth(null)
        setSelectedIterationId('')
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const [nextIterations, nextHealth] = await Promise.all([
          api.iterations(workspaceId, selectedProjectId),
          api.projectHealth(workspaceId, selectedProjectId),
        ])
        setIterations(nextIterations)
        setHealth(nextHealth)
        setSelectedIterationId((current) => {
          const requested = preferredIterationId ?? current
          return nextIterations.some((iteration) => iteration.id === requested)
            ? requested
            : (nextIterations.find((iteration) => iteration.status === 'ACTIVE')?.id ??
                nextIterations[0]?.id ??
                '')
        })
      } catch (reason) {
        toast.error(reason instanceof Error ? reason.message : en ? 'Unable to load' : '加载失败')
      } finally {
        setLoading(false)
      }
    },
    [workspaceId, selectedProjectId, en],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!selectedProjectId || !selectedIterationId) {
      setTasks([])
      return
    }
    api
      .iterationTasks(workspaceId, selectedProjectId, selectedIterationId)
      .then(setTasks)
      .catch((reason) => toast.error(reason instanceof Error ? reason.message : '加载任务失败'))
  }, [workspaceId, selectedProjectId, selectedIterationId])

  const selectedIteration = iterations.find((iteration) => iteration.id === selectedIterationId),
    carryTargets = iterations.filter(
      (iteration) => iteration.id !== closing?.id && iteration.status !== 'CLOSED',
    )

  const run = async (action: () => Promise<unknown>, success: string, preferredId?: string) => {
    setBusy(true)
    try {
      await action()
      await Promise.all([refresh(preferredId), onTasksChanged()])
      toast.success(success)
      return true
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : en ? 'Operation failed' : '操作失败')
      return false
    } finally {
      setBusy(false)
    }
  }

  const loadTaskCandidates = async (iterationId: string, page: number, query: string) => {
    setBacklogLoading(true)
    try {
      const result = await api.iterationTaskCandidates(
        workspaceId,
        selectedProjectId,
        iterationId,
        { page, pageSize: 25, query },
      )
      setBacklog(result.data)
      setBacklogPagination(result.pagination)
      setAppliedBacklogSearch(query.trim())
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : '加载待规划任务失败')
    } finally {
      setBacklogLoading(false)
    }
  }

  const openTaskPicker = () => {
    if (!selectedIteration) return
    setBacklog([])
    setBacklogSearch('')
    setAppliedBacklogSearch('')
    setBacklogPagination(emptyCandidatePagination)
    setSelectedTaskIds([])
    setAddingTasks(true)
    void loadTaskCandidates(selectedIteration.id, 1, '')
  }

  if (!projects.length)
    return (
      <main className="iterations-page">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarRange />
            </EmptyMedia>
            <EmptyTitle>{en ? 'Create a project first' : '请先创建项目'}</EmptyTitle>
            <EmptyDescription>
              {en ? 'Iterations belong to a project.' : '迭代需要归属到具体项目。'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    )

  return (
    <main className="iterations-page">
      <header className="iterations-header">
        <div>
          <h1>{en ? 'Iterations' : '迭代管理'}</h1>
          <p>
            {en
              ? 'Plan a focused delivery window and monitor risk.'
              : '规划交付周期，持续识别进度与风险。'}
          </p>
        </div>
        <span className="iterations-header-actions">
          <ChoiceSelect
            label={en ? 'Project' : '项目'}
            value={selectedProjectId}
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
            onChange={(value) => {
              setSelectedProjectId(value)
              setSelectedIterationId('')
            }}
          />
          {canManage ? (
            <Button onClick={() => setEditing('new')}>
              <Plus data-icon="inline-start" />
              {en ? 'New iteration' : '新建迭代'}
            </Button>
          ) : null}
        </span>
      </header>

      <HealthBand health={health} en={en} loading={loading} />
      <Separator />

      <div className="iterations-layout">
        <aside className="iteration-list" aria-label={en ? 'Iteration list' : '迭代列表'}>
          {iterations.length ? (
            iterations.map((iteration) => {
              const progress = iteration.taskCount
                ? Math.round((iteration.completedCount / iteration.taskCount) * 100)
                : 0
              return (
                <button
                  type="button"
                  key={iteration.id}
                  className={iteration.id === selectedIterationId ? 'active' : ''}
                  onClick={() => setSelectedIterationId(iteration.id)}
                >
                  <span>
                    <strong>{iteration.title}</strong>
                    <Badge variant={iteration.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {statusCopy[iteration.status][en ? 'en' : 'zh']}
                    </Badge>
                  </span>
                  <small>
                    {iteration.startDate} - {iteration.endDate}
                  </small>
                  <Progress value={progress} aria-label={`${progress}%`} />
                  <small>
                    {iteration.completedCount}/{iteration.taskCount} {en ? 'completed' : '已完成'}
                  </small>
                </button>
              )
            })
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarRange />
                </EmptyMedia>
                <EmptyTitle>{en ? 'No iterations yet' : '还没有迭代'}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </aside>

        <section className="iteration-workspace">
          {selectedIteration ? (
            <>
              <header className="iteration-workspace-header">
                <div>
                  <span className="iteration-title-line">
                    <h2>{selectedIteration.title}</h2>
                    <Badge
                      variant={selectedIteration.status === 'ACTIVE' ? 'default' : 'secondary'}
                    >
                      {statusCopy[selectedIteration.status][en ? 'en' : 'zh']}
                    </Badge>
                  </span>
                  <p>{selectedIteration.goal || (en ? 'No goal set.' : '暂未设置迭代目标。')}</p>
                </div>
                {canManage ? (
                  <span className="iteration-actions">
                    {selectedIteration.status !== 'CLOSED' ? (
                      <Button
                        variant="outline"
                        size="icon"
                        title={en ? 'Edit iteration' : '编辑迭代'}
                        aria-label={en ? 'Edit iteration' : '编辑迭代'}
                        onClick={() => setEditing(selectedIteration)}
                      >
                        <PencilLine />
                      </Button>
                    ) : null}
                    {selectedIteration.status === 'PLANNED' ? (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              api.startIteration(
                                workspaceId,
                                selectedProjectId,
                                selectedIteration.id,
                              ),
                            en ? 'Iteration started' : '迭代已启动',
                            selectedIteration.id,
                          )
                        }
                      >
                        <Play data-icon="inline-start" />
                        {en ? 'Start' : '启动'}
                      </Button>
                    ) : null}
                    {selectedIteration.status === 'ACTIVE' ? (
                      <Button variant="outline" onClick={() => setClosing(selectedIteration)}>
                        <CheckCircle2 data-icon="inline-start" />
                        {en ? 'Close' : '关闭'}
                      </Button>
                    ) : null}
                    {selectedIteration.status !== 'CLOSED' ? (
                      <Button variant="outline" onClick={() => void openTaskPicker()}>
                        <Plus data-icon="inline-start" />
                        {en ? 'Add tasks' : '纳入任务'}
                      </Button>
                    ) : null}
                  </span>
                ) : null}
              </header>
              <IterationTaskTable
                tasks={tasks}
                en={en}
                canRemove={canManage && selectedIteration.status !== 'CLOSED'}
                onRemove={(taskId) =>
                  run(
                    () =>
                      api.moveIterationTasks(
                        workspaceId,
                        selectedProjectId,
                        selectedIteration.id,
                        [taskId],
                        'REMOVE',
                      ),
                    en ? 'Task returned to backlog' : '任务已移回待规划',
                    selectedIteration.id,
                  ).then((succeeded) => {
                    if (succeeded)
                      void api
                        .iterationTasks(workspaceId, selectedProjectId, selectedIteration.id)
                        .then(setTasks)
                  })
                }
              />
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListChecks />
                </EmptyMedia>
                <EmptyTitle>
                  {en ? 'Select or create an iteration' : '选择或新建一个迭代'}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </section>
      </div>

      <IterationDialog
        iteration={editing}
        open={editing !== null}
        en={en}
        busy={busy}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={async (draft) => {
          const current = editing
          const saved = await run(
            () =>
              current === 'new'
                ? api.createIteration(workspaceId, selectedProjectId, draft)
                : api.updateIteration(workspaceId, selectedProjectId, current!.id, {
                    ...draft,
                    version: current!.version,
                  }),
            en ? 'Iteration saved' : '迭代已保存',
            current === 'new' ? undefined : current!.id,
          )
          if (saved) setEditing(null)
        }}
      />

      <Dialog open={addingTasks} onOpenChange={setAddingTasks}>
        <DialogContent className="iteration-task-picker">
          <DialogHeader>
            <DialogTitle>{en ? 'Add backlog tasks' : '纳入待规划任务'}</DialogTitle>
            <DialogDescription>
              {en ? 'Choose unplanned tasks for this iteration.' : '选择尚未进入其他迭代的任务。'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="iteration-task-search"
            onSubmit={(event) => {
              event.preventDefault()
              if (selectedIteration) void loadTaskCandidates(selectedIteration.id, 1, backlogSearch)
            }}
          >
            <Input
              aria-label={en ? 'Search backlog tasks' : '搜索待规划任务'}
              placeholder={en ? 'Search by title' : '按标题搜索'}
              value={backlogSearch}
              onChange={(event) => setBacklogSearch(event.target.value)}
            />
            <Button
              type="submit"
              size="icon"
              variant="outline"
              aria-label={en ? 'Search' : '搜索'}
              title={en ? 'Search' : '搜索'}
              disabled={backlogLoading}
            >
              <Search />
            </Button>
          </form>
          <div className="iteration-task-options">
            {backlogLoading ? (
              <div
                className="iteration-task-loading"
                aria-label={en ? 'Loading tasks' : '加载任务'}
              >
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="iteration-task-skeleton" />
                ))}
              </div>
            ) : backlog.length ? (
              backlog.map((task) => {
                const id = `iteration-task-${task.id}`,
                  checked = selectedTaskIds.includes(task.id)
                return (
                  <label key={task.id} htmlFor={id}>
                    <Checkbox
                      id={id}
                      checked={checked}
                      disabled={!checked && selectedTaskIds.length >= 100}
                      onCheckedChange={(value) =>
                        setSelectedTaskIds((current) => {
                          if (!value) return current.filter((taskId) => taskId !== task.id)
                          if (current.includes(task.id) || current.length >= 100) return current
                          return [...current, task.id]
                        })
                      }
                    />
                    <span>
                      <strong>{task.title}</strong>
                      <small>
                        #{task.number} · {task.assignees[0]?.name ?? (en ? 'Unassigned' : '未分配')}
                      </small>
                    </span>
                  </label>
                )
              })
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>
                    {appliedBacklogSearch
                      ? en
                        ? 'No matching tasks'
                        : '没有匹配任务'
                      : en
                        ? 'No unplanned tasks'
                        : '没有待规划任务'}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
          </div>
          <div className="iteration-task-pagination" aria-live="polite">
            <span>
              {en
                ? `${backlogPagination.totalItems} tasks · page ${backlogPagination.page} of ${Math.max(backlogPagination.totalPages, 1)}`
                : `${backlogPagination.totalItems} 项 · 第 ${backlogPagination.page} / ${Math.max(backlogPagination.totalPages, 1)} 页`}
            </span>
            <span>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label={en ? 'Previous page' : '上一页'}
                title={en ? 'Previous page' : '上一页'}
                disabled={backlogLoading || backlogPagination.page <= 1 || !selectedIteration}
                onClick={() => {
                  if (selectedIteration)
                    void loadTaskCandidates(
                      selectedIteration.id,
                      backlogPagination.page - 1,
                      appliedBacklogSearch,
                    )
                }}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label={en ? 'Next page' : '下一页'}
                title={en ? 'Next page' : '下一页'}
                disabled={
                  backlogLoading ||
                  backlogPagination.page >= backlogPagination.totalPages ||
                  !selectedIteration
                }
                onClick={() => {
                  if (selectedIteration)
                    void loadTaskCandidates(
                      selectedIteration.id,
                      backlogPagination.page + 1,
                      appliedBacklogSearch,
                    )
                }}
              >
                <ChevronRight />
              </Button>
            </span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddingTasks(false)}>
              {en ? 'Cancel' : '取消'}
            </Button>
            <Button
              disabled={!selectedTaskIds.length || busy || !selectedIteration}
              onClick={() => {
                if (!selectedIteration) return
                void run(
                  () =>
                    api.moveIterationTasks(
                      workspaceId,
                      selectedProjectId,
                      selectedIteration.id,
                      selectedTaskIds,
                      'ADD',
                    ),
                  en ? 'Tasks added' : '任务已纳入迭代',
                  selectedIteration.id,
                ).then(async (succeeded) => {
                  if (!succeeded) return
                  setAddingTasks(false)
                  setTasks(
                    await api.iterationTasks(workspaceId, selectedProjectId, selectedIteration.id),
                  )
                })
              }}
            >
              {en ? 'Add selected' : `纳入 ${selectedTaskIds.length} 项`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(closing)}
        onOpenChange={(open) => !busy && !open && setClosing(null)}
      >
        <AlertDialogContent className="iteration-close-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{en ? 'Close this iteration?' : '关闭当前迭代？'}</AlertDialogTitle>
            <AlertDialogDescription>
              {en
                ? 'Completed tasks stay here. Choose where every unfinished task should go.'
                : '已完成任务会保留在本迭代，请明确未完成任务的去向。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>{en ? 'Unfinished tasks' : '未完成任务'}</FieldLabel>
              <ChoiceSelect
                label={en ? 'Unfinished task destination' : '未完成任务去向'}
                value={closeAction}
                options={[
                  { value: 'BACKLOG', label: en ? 'Return to backlog' : '返回待规划' },
                  { value: 'CARRY_OVER', label: en ? 'Carry over' : '结转到其他迭代' },
                ]}
                onChange={(value) => {
                  setCloseAction(value)
                  if (value === 'CARRY_OVER' && !carryTargetId)
                    setCarryTargetId(carryTargets[0]?.id ?? '')
                }}
              />
            </Field>
            {closeAction === 'CARRY_OVER' ? (
              <Field>
                <FieldLabel>{en ? 'Target iteration' : '目标迭代'}</FieldLabel>
                <ChoiceSelect
                  label={en ? 'Target iteration' : '目标迭代'}
                  value={carryTargetId || 'NONE'}
                  options={
                    carryTargets.length
                      ? carryTargets.map((iteration) => ({
                          value: iteration.id,
                          label: iteration.title,
                        }))
                      : [{ value: 'NONE', label: en ? 'No available iteration' : '没有可用迭代' }]
                  }
                  onChange={setCarryTargetId}
                  disabled={!carryTargets.length}
                />
              </Field>
            ) : null}
          </FieldGroup>
          <AlertDialogFooter>
            <AlertDialogCancel>{en ? 'Cancel' : '取消'}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || (closeAction === 'CARRY_OVER' && !carryTargetId)}
              onClick={(event) => {
                event.preventDefault()
                if (!closing) return
                void run(
                  () =>
                    api.closeIteration(
                      workspaceId,
                      selectedProjectId,
                      closing.id,
                      closeAction === 'BACKLOG'
                        ? { unfinishedAction: 'BACKLOG' }
                        : { unfinishedAction: 'CARRY_OVER', targetIterationId: carryTargetId },
                    ),
                  en ? 'Iteration closed' : '迭代已关闭',
                  closing.id,
                ).then((succeeded) => {
                  if (!succeeded) return
                  setClosing(null)
                  setCloseAction('BACKLOG')
                  setCarryTargetId('')
                  void api.iterationTasks(workspaceId, selectedProjectId, closing.id).then(setTasks)
                })
              }}
            >
              {en ? 'Close iteration' : '确认关闭'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

function HealthBand({
  health,
  en,
  loading,
}: {
  health: ProjectHealth | null
  en: boolean
  loading: boolean
}) {
  const metrics = [
    {
      icon: <CheckCircle2 />,
      value: `${health?.completionRate ?? 0}%`,
      label: en ? 'Completion' : '整体完成率',
    },
    {
      icon: <CircleAlert />,
      value: health?.overdueTasks ?? 0,
      label: en ? 'Overdue' : '逾期未完成',
    },
    { icon: <RotateCcw />, value: health?.openBugs ?? 0, label: en ? 'Open bugs' : '未关闭 Bug' },
    {
      icon: <UserRoundX />,
      value: health?.unassignedTasks ?? 0,
      label: en ? 'Unassigned' : '未分配任务',
    },
    {
      icon: <CircleSlash2 />,
      value: health?.blockedTasks ?? 0,
      label: en ? 'Blocked' : '阻塞任务',
    },
  ]
  return (
    <section className="iteration-health" aria-label={en ? 'Project health' : '项目健康'}>
      <div className="iteration-health-metrics">
        {metrics.map((metric) => (
          <div key={metric.label}>
            {metric.icon}
            <span>
              <strong>{loading ? '-' : metric.value}</strong>
              <small>{metric.label}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="active-iteration-progress">
        <Progress value={health?.activeIteration?.completionRate ?? 0}>
          <ProgressLabel>
            {health?.activeIteration?.title ?? (en ? 'No active iteration' : '暂无进行中迭代')}
          </ProgressLabel>
          <span className="active-iteration-progress-value">
            {health?.activeIteration
              ? `${health.activeIteration.completedTasks}/${health.activeIteration.totalTasks} · ${health.activeIteration.blockedTasks} ${en ? 'blocked' : '阻塞'}`
              : '0/0'}
          </span>
        </Progress>
      </div>
    </section>
  )
}

function IterationTaskTable({
  tasks,
  en,
  canRemove,
  onRemove,
}: {
  tasks: IterationTask[]
  en: boolean
  canRemove: boolean
  onRemove: (taskId: string) => Promise<unknown>
}) {
  if (!tasks.length)
    return (
      <Empty className="iteration-tasks-empty">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListChecks />
          </EmptyMedia>
          <EmptyTitle>{en ? 'No tasks in this iteration' : '本迭代还没有任务'}</EmptyTitle>
          <EmptyDescription>
            {en
              ? 'Add tasks from the backlog to define the scope.'
              : '从待规划列表纳入任务以明确范围。'}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  return (
    <Table className="iteration-task-table">
      <TableHeader>
        <TableRow>
          <TableHead>{en ? 'Task' : '任务'}</TableHead>
          <TableHead>{en ? 'Status' : '状态'}</TableHead>
          <TableHead>{en ? 'Assignee' : '负责人'}</TableHead>
          <TableHead>{en ? 'Due' : '截止日期'}</TableHead>
          {canRemove ? <TableHead aria-label={en ? 'Actions' : '操作'} /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id}>
            <TableCell data-label={en ? 'Task' : '任务'}>
              <span className="iteration-task-title">
                <small>#{task.number}</small>
                <strong>{task.title}</strong>
                <Badge variant="secondary">{task.kind}</Badge>
                {task.blockerCount ? (
                  <Badge variant="destructive">
                    <CircleSlash2 />
                    {en ? `${task.blockerCount} blocked` : `${task.blockerCount} 项阻塞`}
                  </Badge>
                ) : null}
              </span>
            </TableCell>
            <TableCell data-label={en ? 'Status' : '状态'}>{task.columnName}</TableCell>
            <TableCell data-label={en ? 'Assignee' : '负责人'}>
              {task.assignees.map((assignee) => assignee.name).join('、') ||
                (en ? 'Unassigned' : '未分配')}
            </TableCell>
            <TableCell data-label={en ? 'Due' : '截止日期'}>{task.dueDate ?? '-'}</TableCell>
            {canRemove ? (
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={en ? 'Return to backlog' : '移回待规划'}
                  aria-label={en ? `Remove ${task.title}` : `移出 ${task.title}`}
                  onClick={() => void onRemove(task.id)}
                >
                  <X />
                </Button>
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function IterationDialog({
  iteration,
  open,
  en,
  busy,
  onOpenChange,
  onSubmit,
}: {
  iteration: Iteration | 'new' | null
  open: boolean
  en: boolean
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: IterationDraft) => Promise<void>
}) {
  const initial = useMemo<IterationDraft>(
      () =>
        iteration && iteration !== 'new'
          ? {
              title: iteration.title,
              goal: iteration.goal,
              startDate: iteration.startDate,
              endDate: iteration.endDate,
            }
          : emptyDraft(),
      [iteration],
    ),
    [draft, setDraft] = useState(initial)
  useEffect(() => setDraft(initial), [initial])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.title.trim() || draft.startDate > draft.endDate) return
    void onSubmit(draft)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="iteration-form">
          <DialogHeader>
            <DialogTitle>
              {iteration === 'new'
                ? en
                  ? 'New iteration'
                  : '新建迭代'
                : en
                  ? 'Edit iteration'
                  : '编辑迭代'}
            </DialogTitle>
            <DialogDescription>
              {en ? 'Set a clear delivery goal and timebox.' : '定义清晰的交付目标和时间范围。'}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="iteration-title">{en ? 'Title' : '迭代名称'}</FieldLabel>
              <Input
                id="iteration-title"
                required
                autoFocus
                maxLength={160}
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="iteration-goal">{en ? 'Goal' : '迭代目标'}</FieldLabel>
              <Textarea
                id="iteration-goal"
                rows={4}
                maxLength={4000}
                value={draft.goal}
                onChange={(event) => setDraft({ ...draft, goal: event.target.value })}
              />
            </Field>
            <FieldGroup className="iteration-date-fields">
              <Field>
                <FieldLabel htmlFor="iteration-start">{en ? 'Start date' : '开始日期'}</FieldLabel>
                <Input
                  id="iteration-start"
                  type="date"
                  required
                  value={draft.startDate}
                  onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="iteration-end">{en ? 'End date' : '结束日期'}</FieldLabel>
                <Input
                  id="iteration-end"
                  type="date"
                  required
                  min={draft.startDate}
                  value={draft.endDate}
                  onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
                />
              </Field>
            </FieldGroup>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {en ? 'Cancel' : '取消'}
            </Button>
            <Button
              type="submit"
              disabled={busy || !draft.title.trim() || draft.startDate > draft.endDate}
            >
              <ArrowRight data-icon="inline-end" />
              {en ? 'Save' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
