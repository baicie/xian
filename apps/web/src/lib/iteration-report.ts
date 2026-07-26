import type { Iteration, IterationRetrospective } from '@/models/iteration'

type ReportInput = {
  iteration: Pick<Iteration, 'title' | 'goal' | 'startDate' | 'endDate' | 'closedAt'>
  retrospective: IterationRetrospective
  en: boolean
}

const reportTitle = (title: string) => title.trim().replace(/[\r\n]+/g, ' ') || 'Untitled iteration'

export function formatIterationDeliveryReport({ iteration, retrospective, en }: ReportInput) {
  const copy = en
      ? {
          title: 'Delivery report',
          period: 'Period',
          range: 'to',
          closed: 'Closed',
          goal: 'Goal',
          snapshot: 'Snapshot',
          captured: 'Captured at close',
          partial: 'Historical snapshot: partial',
          partialNote:
            'Historical scope was not captured when this iteration closed. Counts reflect only remaining records.',
          delivery: 'Delivery snapshot',
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
          empty: '_Not recorded._',
        }
      : {
          title: '迭代交付报告',
          period: '周期',
          range: '至',
          closed: '关闭日期',
          goal: '目标',
          snapshot: '快照',
          captured: '关闭时已采集',
          partial: '历史快照不完整',
          partialNote: '该迭代关闭时未采集完整范围，统计仅反映仍可获取的记录。',
          delivery: '交付快照',
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
          empty: '_未记录。_',
        },
    value = (content: string) => content.trim() || copy.empty,
    closedAt = iteration.closedAt?.slice(0, 10)

  return [
    `# ${copy.title}: ${reportTitle(iteration.title)}`,
    '',
    `- ${copy.period}: ${iteration.startDate} ${copy.range} ${iteration.endDate}`,
    ...(closedAt ? [`- ${copy.closed}: ${closedAt}`] : []),
    `- ${copy.goal}: ${value(iteration.goal)}`,
    `- ${copy.snapshot}: ${
      retrospective.snapshotState === 'CAPTURED' ? copy.captured : copy.partial
    }`,
    ...(retrospective.snapshotState === 'PARTIAL' ? [`> ${copy.partialNote}`] : []),
    '',
    `## ${copy.delivery}`,
    '',
    `| ${copy.scope} | ${copy.completed} | ${copy.carryOver} | ${copy.completion} | ${copy.overdue} | ${copy.bugs} | ${copy.blocked} |`,
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| ${retrospective.scopeTaskCount} | ${retrospective.completedTaskCount} | ${retrospective.carryOverTaskCount} | ${retrospective.completionRate}% | ${retrospective.overdueTaskCount} | ${retrospective.openBugCount} | ${retrospective.blockedTaskCount} |`,
    '',
    `## ${copy.summary}`,
    '',
    value(retrospective.summary),
    '',
    `## ${copy.wentWell}`,
    '',
    value(retrospective.wentWell),
    '',
    `## ${copy.improvements}`,
    '',
    value(retrospective.improvements),
    '',
    `## ${copy.actions}`,
    '',
    value(retrospective.actionItems),
    '',
  ].join('\n')
}
