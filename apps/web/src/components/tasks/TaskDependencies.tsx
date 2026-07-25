import { useCallback, useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CircleSlash2,
  Link2,
  ListTodo,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type {
  TaskDependencies as TaskDependenciesValue,
  TaskDependencyCandidate,
  TaskDependencyCandidatePage,
  TaskDependencySummary,
} from '@/models/taskDependency'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const statusLabel = (task: TaskDependencySummary | TaskDependencyCandidate, en: boolean) => {
  if ('archived' in task && task.archived) return en ? 'Archived' : '已归档'
  return {
    BACKLOG: en ? 'Backlog' : '待处理',
    ACTIVE: en ? 'Active' : '进行中',
    REVIEW: en ? 'Review' : '待验收',
    DONE: en ? 'Done' : '已完成',
  }[task.stateType]
}

export default function TaskDependencies({
  workspaceId,
  taskId,
  en,
  onChanged,
}: {
  workspaceId: string
  taskId: string
  en: boolean
  onChanged: () => Promise<void> | void
}) {
  const [value, setValue] = useState<TaskDependenciesValue | null>(null),
    [loading, setLoading] = useState(true),
    [pickerOpen, setPickerOpen] = useState(false),
    [query, setQuery] = useState(''),
    [candidatePage, setCandidatePage] = useState(1),
    [candidates, setCandidates] = useState<TaskDependencyCandidatePage | null>(null),
    [candidateLoading, setCandidateLoading] = useState(false),
    [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setValue(await api.taskDependencies(workspaceId, taskId))
    } finally {
      setLoading(false)
    }
  }, [taskId, workspaceId])

  useEffect(() => {
    void load().catch((reason) =>
      toast.error(reason instanceof Error ? reason.message : en ? 'Loading failed' : '加载失败'),
    )
  }, [en, load])

  useEffect(() => {
    if (!pickerOpen) return
    let active = true
    const timer = window.setTimeout(() => {
      setCandidateLoading(true)
      api
        .taskDependencyCandidates(workspaceId, taskId, {
          query,
          page: candidatePage,
          pageSize: 20,
        })
        .then((result) => active && setCandidates(result))
        .catch(
          (reason) =>
            active &&
            toast.error(
              reason instanceof Error ? reason.message : en ? 'Loading failed' : '加载失败',
            ),
        )
        .finally(() => active && setCandidateLoading(false))
    }, 200)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [candidatePage, en, pickerOpen, query, taskId, workspaceId])

  const refresh = async () => {
    await Promise.all([load(), onChanged()])
  }
  const remove = async (blockedTaskId: string, blockerTaskId: string) => {
    setBusyId(`${blockedTaskId}:${blockerTaskId}`)
    try {
      await api.removeTaskBlocker(workspaceId, blockedTaskId, blockerTaskId)
      await refresh()
      toast.success(en ? 'Dependency removed' : '已解除依赖')
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : en ? 'Removal failed' : '解除失败')
    } finally {
      setBusyId(null)
    }
  }
  const add = async (candidate: TaskDependencyCandidate) => {
    setBusyId(candidate.id)
    try {
      await api.addTaskBlocker(workspaceId, taskId, candidate.id)
      await refresh()
      setPickerOpen(false)
      toast.success(en ? 'Blocker added' : '已添加前置任务')
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : en ? 'Addition failed' : '添加失败')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <Field className="task-dependencies">
        <div className="task-dependencies-heading">
          <FieldLabel>{en ? 'Dependencies' : '任务依赖'}</FieldLabel>
          <span>
            {value?.blocked ? (
              <Badge variant="destructive">
                <CircleSlash2 />
                {en
                  ? `${value.blockerCount} blocker${value.blockerCount === 1 ? '' : 's'}`
                  : `${value.blockerCount} 项阻塞`}
              </Badge>
            ) : (
              <Badge variant="secondary">{en ? 'Clear' : '无阻塞'}</Badge>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery('')
                setCandidatePage(1)
                setPickerOpen(true)
              }}
            >
              <Plus data-icon="inline-start" />
              {en ? 'Add blocker' : '添加前置任务'}
            </Button>
          </span>
        </div>
        {loading ? (
          <div className="task-dependency-loading">
            <Skeleton />
            <Skeleton />
          </div>
        ) : value && (value.blockers.length || value.dependents.length) ? (
          <div className="task-dependency-groups">
            {value.blockers.length ? (
              <DependencyGroup
                title={en ? 'Blocked by' : '前置任务'}
                tasks={value.blockers}
                en={en}
                showBlockedState={false}
                removeLabel={en ? 'Remove blocker' : '移除前置任务'}
                busyId={busyId}
                relationId={(task) => `${taskId}:${task.id}`}
                onRemove={(task) => remove(taskId, task.id)}
              />
            ) : null}
            {value.dependents.length ? (
              <DependencyGroup
                title={en ? 'Blocking' : '阻塞的任务'}
                tasks={value.dependents}
                en={en}
                showBlockedState
                removeLabel={en ? 'Stop blocking task' : '解除阻塞关系'}
                busyId={busyId}
                relationId={(task) => `${task.id}:${taskId}`}
                onRemove={(task) => remove(task.id, taskId)}
              />
            ) : null}
          </div>
        ) : (
          <Empty className="task-dependency-empty">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Link2 />
              </EmptyMedia>
              <EmptyTitle>{en ? 'No dependencies' : '暂无任务依赖'}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </Field>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="task-dependency-picker">
          <DialogHeader>
            <DialogTitle>{en ? 'Add blocker' : '添加前置任务'}</DialogTitle>
            <DialogDescription>
              {en
                ? 'Select a task that must finish before this task can proceed.'
                : '选择当前任务继续推进前必须完成的任务。'}
            </DialogDescription>
          </DialogHeader>
          <div className="task-dependency-search">
            <Search />
            <Input
              aria-label={en ? 'Search tasks' : '搜索任务'}
              value={query}
              placeholder={en ? 'Key or title' : '输入编号或标题'}
              onChange={(event) => {
                setQuery(event.target.value)
                setCandidatePage(1)
              }}
            />
          </div>
          <div className="task-dependency-candidates">
            {candidateLoading ? (
              Array.from({ length: 4 }, (_, index) => <Skeleton key={index} />)
            ) : candidates?.data.length ? (
              candidates.data.map((candidate) => (
                <Button
                  key={candidate.id}
                  type="button"
                  variant="ghost"
                  disabled={busyId === candidate.id}
                  onClick={() => void add(candidate)}
                >
                  <span>
                    <small>
                      {candidate.code}-{candidate.number}
                    </small>
                    <strong>{candidate.title}</strong>
                  </span>
                  <Badge variant={candidate.stateType === 'DONE' ? 'secondary' : 'outline'}>
                    {statusLabel(candidate, en)}
                  </Badge>
                </Button>
              ))
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ListTodo />
                  </EmptyMedia>
                  <EmptyTitle>{en ? 'No eligible tasks' : '没有可选任务'}</EmptyTitle>
                  <EmptyDescription>
                    {en ? 'Try another search.' : '可以尝试其他关键词。'}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
          <div className="task-dependency-pagination">
            <span>
              {candidates
                ? en
                  ? `${candidates.pagination.totalItems} tasks`
                  : `共 ${candidates.pagination.totalItems} 项`
                : ''}
            </span>
            <span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={en ? 'Previous page' : '上一页'}
                disabled={candidatePage <= 1 || candidateLoading}
                onClick={() => setCandidatePage((page) => page - 1)}
              >
                <ChevronLeft />
              </Button>
              <small>
                {candidatePage}/{Math.max(candidates?.pagination.totalPages ?? 1, 1)}
              </small>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={en ? 'Next page' : '下一页'}
                disabled={
                  candidateLoading || candidatePage >= (candidates?.pagination.totalPages ?? 1)
                }
                onClick={() => setCandidatePage((page) => page + 1)}
              >
                <ChevronRight />
              </Button>
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DependencyGroup({
  title,
  tasks,
  en,
  showBlockedState,
  removeLabel,
  busyId,
  relationId,
  onRemove,
}: {
  title: string
  tasks: TaskDependencySummary[]
  en: boolean
  showBlockedState: boolean
  removeLabel: string
  busyId: string | null
  relationId: (task: TaskDependencySummary) => string
  onRemove: (task: TaskDependencySummary) => Promise<void>
}) {
  return (
    <section>
      <h3>{title}</h3>
      <div>
        {tasks.map((task) => (
          <div className="task-dependency-row" key={task.id}>
            <span>
              <small>
                {task.code}-{task.number}
              </small>
              <strong>{task.title}</strong>
            </span>
            <Badge
              variant={showBlockedState && task.blockerCount > 0 ? 'destructive' : 'secondary'}
            >
              {showBlockedState && task.blockerCount > 0
                ? en
                  ? 'Blocked'
                  : '阻塞'
                : statusLabel(task, en)}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`${removeLabel} ${task.code}-${task.number}`}
              disabled={busyId === relationId(task)}
              onClick={() => void onRemove(task)}
            >
              <X />
            </Button>
          </div>
        ))}
      </div>
    </section>
  )
}
