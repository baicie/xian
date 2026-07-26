import { FormEvent, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Copy, RefreshCw, Save } from 'lucide-react'
import { toast } from 'sonner'
import type {
  Iteration,
  IterationRetrospective,
  IterationRetrospectiveUpdate,
} from '@/models/iteration'
import { copyText } from '@/lib/clipboard'
import { formatIterationDeliveryReport } from '@/lib/iteration-report'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

type RetrospectiveDraft = Omit<IterationRetrospectiveUpdate, 'version'>

const emptyDraft: RetrospectiveDraft = {
  summary: '',
  wentWell: '',
  improvements: '',
  actionItems: '',
}

const copyFor = (en: boolean) =>
  en
    ? {
        title: 'Retrospective',
        captured: 'Captured snapshot',
        partial: 'Partial historical snapshot',
        partialDescription:
          'Historical scope was not captured at close. These counts reflect only remaining records.',
        copyReport: 'Copy report',
        refresh: 'Refresh retrospective',
        snapshot: 'Delivery snapshot',
        scope: 'Scope',
        completed: 'Completed',
        carryOver: 'Carried over',
        completion: 'Completion',
        overdue: 'Overdue at close',
        bugs: 'Open bugs at close',
        blocked: 'Blocked at close',
        summary: 'Summary',
        wentWell: 'What went well',
        improvements: 'Improve next time',
        actions: 'Action items',
        save: 'Save retrospective',
        saved: 'Retrospective saved',
        copied: 'Delivery report copied',
        copyFailed: 'Unable to copy report',
        saveFailed: 'Unable to save retrospective',
        notRecorded: 'Not recorded',
      }
    : {
        title: '复盘',
        captured: '关闭时快照',
        partial: '历史快照不完整',
        partialDescription: '该迭代关闭时未采集完整范围，统计仅反映仍可获取的记录。',
        copyReport: '复制交付报告',
        refresh: '刷新复盘',
        snapshot: '交付快照',
        scope: '范围',
        completed: '已完成',
        carryOver: '结转',
        completion: '完成率',
        overdue: '关闭时逾期',
        bugs: '关闭时未关闭 Bug',
        blocked: '关闭时被阻塞',
        summary: '总结',
        wentWell: '本次做得好',
        improvements: '下次改进',
        actions: '行动项',
        save: '保存复盘',
        saved: '复盘已保存',
        copied: '交付报告已复制',
        copyFailed: '复制交付报告失败',
        saveFailed: '保存复盘失败',
        notRecorded: '未记录',
      }

export default function IterationRetrospectivePanel({
  iteration,
  retrospective,
  loading,
  en,
  canManage,
  onSave,
  onReload,
  onChange,
}: {
  iteration: Iteration
  retrospective: IterationRetrospective | null
  loading: boolean
  en: boolean
  canManage: boolean
  onSave: (input: IterationRetrospectiveUpdate) => Promise<IterationRetrospective>
  onReload: () => void
  onChange: (retrospective: IterationRetrospective) => void
}) {
  const copy = copyFor(en),
    [draft, setDraft] = useState<RetrospectiveDraft>(emptyDraft),
    [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!retrospective) {
      setDraft(emptyDraft)
      return
    }
    setDraft({
      summary: retrospective.summary,
      wentWell: retrospective.wentWell,
      improvements: retrospective.improvements,
      actionItems: retrospective.actionItems,
    })
  }, [retrospective])

  const changed =
      retrospective !== null &&
      (draft.summary !== retrospective.summary ||
        draft.wentWell !== retrospective.wentWell ||
        draft.improvements !== retrospective.improvements ||
        draft.actionItems !== retrospective.actionItems),
    report = useMemo(
      () => (retrospective ? formatIterationDeliveryReport({ iteration, retrospective, en }) : ''),
      [en, iteration, retrospective],
    )

  if (loading)
    return (
      <div
        className="iteration-retrospective-loading"
        aria-label={en ? 'Loading retrospective' : '加载复盘'}
      >
        <Skeleton className="iteration-retrospective-skeleton-title" />
        <Skeleton className="iteration-retrospective-skeleton-metrics" />
        <Skeleton className="iteration-retrospective-skeleton-notes" />
      </div>
    )
  if (!retrospective) return null

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const saved = await onSave({ ...draft, version: retrospective.version })
      onChange(saved)
      toast.success(copy.saved)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : copy.saveFailed)
    } finally {
      setSaving(false)
    }
  }
  const fields: { key: keyof RetrospectiveDraft; label: string; rows: number }[] = [
    { key: 'summary', label: copy.summary, rows: 4 },
    { key: 'wentWell', label: copy.wentWell, rows: 5 },
    { key: 'improvements', label: copy.improvements, rows: 5 },
    { key: 'actionItems', label: copy.actions, rows: 5 },
  ]
  const metrics = [
    { label: copy.scope, value: retrospective.scopeTaskCount },
    { label: copy.completed, value: retrospective.completedTaskCount },
    { label: copy.carryOver, value: retrospective.carryOverTaskCount },
    { label: copy.completion, value: `${retrospective.completionRate}%` },
    { label: copy.overdue, value: retrospective.overdueTaskCount },
    { label: copy.bugs, value: retrospective.openBugCount },
    { label: copy.blocked, value: retrospective.blockedTaskCount },
  ]

  return (
    <section className="iteration-retrospective" aria-label={copy.title}>
      <header className="iteration-retrospective-header">
        <div className="iteration-retrospective-heading">
          <h3>{copy.title}</h3>
          <Badge variant={retrospective.snapshotState === 'CAPTURED' ? 'secondary' : 'outline'}>
            {retrospective.snapshotState === 'CAPTURED' ? copy.captured : copy.partial}
          </Badge>
        </div>
        <span className="iteration-retrospective-actions">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={copy.refresh}
            aria-label={copy.refresh}
            disabled={loading || saving}
            onClick={onReload}
          >
            <RefreshCw />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void copyText(report)
                .then(() => toast.success(copy.copied))
                .catch(() => toast.error(copy.copyFailed))
            }}
          >
            <Copy data-icon="inline-start" />
            {copy.copyReport}
          </Button>
        </span>
      </header>

      {retrospective.snapshotState === 'PARTIAL' ? (
        <div className="iteration-retrospective-partial" role="status">
          <AlertTriangle />
          <p>{copy.partialDescription}</p>
        </div>
      ) : null}

      <section className="iteration-retrospective-snapshot" aria-label={copy.snapshot}>
        <h4>{copy.snapshot}</h4>
        <div className="iteration-retrospective-metrics">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <strong>{metric.value}</strong>
              <small>{metric.label}</small>
            </div>
          ))}
        </div>
      </section>

      {canManage ? (
        <form className="iteration-retrospective-form" onSubmit={(event) => void save(event)}>
          <FieldGroup>
            {fields.map((field) => {
              const id = `retrospective-${field.key}`
              return (
                <Field key={field.key}>
                  <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
                  <Textarea
                    id={id}
                    rows={field.rows}
                    maxLength={field.key === 'summary' ? 4000 : 8000}
                    value={draft[field.key]}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                  />
                </Field>
              )
            })}
          </FieldGroup>
          <span className="iteration-retrospective-save">
            {retrospective.updatedByName && retrospective.updatedAt ? (
              <small>
                {retrospective.updatedByName} · {retrospective.updatedAt.slice(0, 10)}
              </small>
            ) : null}
            <Button type="submit" disabled={saving || !changed}>
              <Save data-icon="inline-start" />
              {copy.save}
            </Button>
          </span>
        </form>
      ) : (
        <div className="iteration-retrospective-readonly">
          {fields.map((field) => (
            <section key={field.key}>
              <h4>{field.label}</h4>
              <p>{retrospective[field.key] || copy.notRecorded}</p>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
