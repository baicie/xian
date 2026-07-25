import { FormEvent, KeyboardEvent, useCallback, useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ListChecks,
  ListTree,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, type Subtask } from '@/api'
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
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  parseSubtaskDraft,
  SUBTASK_BATCH_LIMIT,
  SUBTASK_TITLE_LIMIT,
  SUBTASK_TOTAL_LIMIT,
} from '@/lib/subtaskDraft'

export default function TaskSubtasks({
  workspaceId,
  taskId,
  en,
  onChanged,
}: {
  workspaceId: string
  taskId: string
  en: boolean
  onChanged: () => Promise<void>
}) {
  const [items, setItems] = useState<Subtask[]>([]),
    [title, setTitle] = useState(''),
    [busy, setBusy] = useState(false),
    [batchOpen, setBatchOpen] = useState(false),
    [batchValue, setBatchValue] = useState(''),
    [editingId, setEditingId] = useState<string | null>(null),
    [editingTitle, setEditingTitle] = useState('')
  const load = useCallback(
    () =>
      api
        .subtasks(workspaceId, taskId)
        .then(setItems)
        .catch((reason) =>
          toast.error(
            reason instanceof Error
              ? reason.message
              : en
                ? 'Failed to load subtasks'
                : '子任务加载失败',
          ),
        ),
    [workspaceId, taskId, en],
  )
  useEffect(() => {
    void load()
  }, [load])

  const remaining = Math.max(SUBTASK_TOTAL_LIMIT - items.length, 0),
    batchLimit = Math.min(SUBTASK_BATCH_LIMIT, remaining),
    batchDraft = parseSubtaskDraft(
      batchValue,
      batchLimit,
      items.map((item) => item.title),
    ),
    batchError = !batchValue.trim()
      ? ''
      : batchDraft.overLimit
        ? en
          ? `You can add up to ${batchLimit} more subtasks.`
          : `当前最多还可添加 ${batchLimit} 个子任务。`
        : batchDraft.duplicateTitles.length
          ? en
            ? `Duplicate title: ${batchDraft.duplicateTitles[0]}`
            : `子任务标题重复：${batchDraft.duplicateTitles[0]}`
          : batchDraft.oversizedTitles.length
            ? en
              ? `Each title must be ${SUBTASK_TITLE_LIMIT} characters or fewer.`
              : `每个子任务标题不能超过 ${SUBTASK_TITLE_LIMIT} 个字符。`
            : ''

  const add = async (event: FormEvent) => {
    event.preventDefault()
    const next = title.trim()
    if (!next || !remaining) return
    setBusy(true)
    try {
      const created = await api.createSubtask(workspaceId, taskId, next)
      setItems((current) => [...current, created])
      setTitle('')
      await onChanged()
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : en ? 'Failed to add subtask' : '添加子任务失败',
      )
    } finally {
      setBusy(false)
    }
  }
  const addBatch = async (event: FormEvent) => {
    event.preventDefault()
    if (!batchDraft.valid) return
    setBusy(true)
    try {
      const created = await api.createSubtasks(workspaceId, taskId, batchDraft.titles)
      setItems((current) => [...current, ...created])
      setBatchValue('')
      setBatchOpen(false)
      await onChanged()
      toast.success(
        en
          ? `Added ${created.length} ${created.length === 1 ? 'subtask' : 'subtasks'}`
          : `已添加 ${created.length} 个子任务`,
      )
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : en
            ? 'Failed to add subtasks'
            : '批量添加子任务失败',
      )
    } finally {
      setBusy(false)
    }
  }
  const toggle = async (item: Subtask) => {
    const isDone = !item.isDone
    setItems((current) =>
      current.map((value) => (value.id === item.id ? { ...value, isDone } : value)),
    )
    try {
      await api.updateSubtask(workspaceId, taskId, item.id, { isDone })
      await onChanged()
    } catch (reason) {
      setItems((current) => current.map((value) => (value.id === item.id ? item : value)))
      toast.error(reason instanceof Error ? reason.message : en ? 'Update failed' : '更新失败')
    }
  }
  const startEditing = (item: Subtask) => {
    setEditingId(item.id)
    setEditingTitle(item.title)
  }
  const cancelEditing = () => {
    setEditingId(null)
    setEditingTitle('')
  }
  const saveEditing = async (event: FormEvent, item: Subtask) => {
    event.preventDefault()
    const next = editingTitle.trim()
    if (!next) return
    if (next === item.title) {
      cancelEditing()
      return
    }
    setBusy(true)
    try {
      const updated = await api.updateSubtask(workspaceId, taskId, item.id, { title: next })
      setItems((current) => current.map((value) => (value.id === item.id ? updated : value)))
      cancelEditing()
      await onChanged()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : en ? 'Rename failed' : '重命名失败')
    } finally {
      setBusy(false)
    }
  }
  const handleEditingKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    cancelEditing()
  }
  const remove = async (item: Subtask) => {
    setBusy(true)
    try {
      await api.deleteSubtask(workspaceId, taskId, item.id)
      setItems((current) => current.filter((value) => value.id !== item.id))
      if (editingId === item.id) cancelEditing()
      await onChanged()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : en ? 'Delete failed' : '删除失败')
    } finally {
      setBusy(false)
    }
  }
  const move = async (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= items.length) return
    const previous = items,
      next = [...items]
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    setItems(next)
    setBusy(true)
    try {
      await api.reorderSubtasks(
        workspaceId,
        taskId,
        next.map((item) => item.id),
      )
      await onChanged()
    } catch (reason) {
      setItems(previous)
      toast.error(reason instanceof Error ? reason.message : en ? 'Reorder failed' : '排序失败')
    } finally {
      setBusy(false)
    }
  }
  const done = items.filter((item) => item.isDone).length,
    percent = items.length ? (done / items.length) * 100 : 0
  return (
    <section className="task-subtasks">
      <div className="task-subtasks-heading">
        <span>
          <ListChecks />
          <strong>{en ? 'Subtasks' : '子任务'}</strong>
        </span>
        <div className="task-subtasks-heading-actions">
          <small>
            {done}/{items.length}
          </small>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !remaining}
            onClick={() => setBatchOpen(true)}
          >
            <ListTree data-icon="inline-start" />
            {en ? 'Break down task' : '拆分任务'}
          </Button>
        </div>
      </div>
      {items.length ? (
        <>
          <div
            className="subtask-progress"
            aria-label={
              en
                ? `${done} of ${items.length} subtasks complete`
                : `已完成 ${done}/${items.length} 个子任务`
            }
          >
            <i style={{ width: `${percent}%` }} />
          </div>
          <div className="subtask-list">
            {items.map((item, index) => (
              <div key={item.id}>
                <Checkbox
                  aria-label={item.title}
                  checked={item.isDone}
                  disabled={busy}
                  onCheckedChange={() => void toggle(item)}
                />
                {editingId === item.id ? (
                  <form
                    className="subtask-inline-edit"
                    onSubmit={(event) => void saveEditing(event, item)}
                  >
                    <Input
                      autoFocus
                      value={editingTitle}
                      maxLength={SUBTASK_TITLE_LIMIT}
                      disabled={busy}
                      aria-label={en ? `Rename ${item.title}` : `重命名 ${item.title}`}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onKeyDown={handleEditingKeyDown}
                    />
                    <Button
                      type="submit"
                      size="icon-sm"
                      disabled={busy || !editingTitle.trim()}
                      aria-label={en ? 'Save subtask name' : '保存子任务名称'}
                    >
                      <Check />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={en ? 'Cancel rename' : '取消重命名'}
                      onClick={cancelEditing}
                    >
                      <X />
                    </Button>
                  </form>
                ) : (
                  <span className="subtask-title" data-done={item.isDone || undefined}>
                    {item.title}
                  </span>
                )}
                <span className="subtask-actions">
                  {editingId !== item.id ? (
                    <>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={en ? `Rename ${item.title}` : `重命名 ${item.title}`}
                        onClick={() => startEditing(item)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={busy || index === 0}
                        aria-label={en ? 'Move subtask up' : '上移子任务'}
                        onClick={() => void move(index, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={busy || index === items.length - 1}
                        aria-label={en ? 'Move subtask down' : '下移子任务'}
                        onClick={() => void move(index, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={en ? 'Delete subtask' : '删除子任务'}
                        onClick={() => void remove(item)}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <form className="subtask-composer" onSubmit={add}>
        <Input
          value={title}
          maxLength={SUBTASK_TITLE_LIMIT}
          disabled={busy || !remaining}
          placeholder={
            remaining
              ? en
                ? 'Add a subtask'
                : '添加一个子任务'
              : en
                ? 'Subtask limit reached'
                : '已达到子任务上限'
          }
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button
          type="submit"
          size="icon"
          disabled={busy || !remaining || !title.trim()}
          aria-label={en ? 'Add subtask' : '添加子任务'}
        >
          <Plus />
        </Button>
      </form>
      <Dialog
        open={batchOpen}
        onOpenChange={(open) => {
          if (busy) return
          setBatchOpen(open)
          if (!open) setBatchValue('')
        }}
      >
        <DialogContent className="subtask-decompose-dialog">
          <form className="subtask-decompose-form" onSubmit={addBatch}>
            <DialogHeader>
              <DialogTitle>{en ? 'Break down task' : '拆分任务'}</DialogTitle>
              <DialogDescription>
                {en
                  ? `Add up to ${SUBTASK_BATCH_LIMIT} at a time. ${remaining} spaces remain.`
                  : `每次最多添加 ${SUBTASK_BATCH_LIMIT} 个，当前还可添加 ${remaining} 个。`}
              </DialogDescription>
            </DialogHeader>
            <Field data-invalid={Boolean(batchError)}>
              <FieldLabel htmlFor={`subtask-draft-${taskId}`}>
                {en ? 'Subtask titles' : '子任务标题'}
              </FieldLabel>
              <Textarea
                id={`subtask-draft-${taskId}`}
                autoFocus
                rows={9}
                value={batchValue}
                disabled={busy}
                aria-invalid={Boolean(batchError)}
                placeholder={
                  en
                    ? 'Define scope\nBuild API\nCover edge cases'
                    : '确认范围\n实现接口\n覆盖边界场景'
                }
                onChange={(event) => setBatchValue(event.target.value)}
              />
              <FieldDescription className="subtask-draft-meta">
                <span>
                  {batchDraft.titles.length}/{batchLimit}
                </span>
              </FieldDescription>
              {batchError ? <FieldError>{batchError}</FieldError> : null}
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setBatchOpen(false)}
              >
                {en ? 'Cancel' : '取消'}
              </Button>
              <Button type="submit" disabled={busy || !batchDraft.valid}>
                {busy
                  ? en
                    ? 'Adding…'
                    : '添加中…'
                  : en
                    ? batchDraft.titles.length
                      ? `Add ${batchDraft.titles.length} ${batchDraft.titles.length === 1 ? 'subtask' : 'subtasks'}`
                      : 'Add subtasks'
                    : batchDraft.titles.length
                      ? `添加 ${batchDraft.titles.length} 个子任务`
                      : '添加子任务'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
