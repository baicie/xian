import { describe, expect, it } from 'vitest'
import { formatIterationDeliveryReport } from './iteration-report'

describe('iteration delivery report', () => {
  const iteration = {
      title: 'July delivery',
      goal: 'Ship a reliable login flow',
      startDate: '2026-07-01',
      endDate: '2026-07-14',
      closedAt: '2026-07-14T08:30:00.000Z',
    },
    retrospective = {
      iterationId: 'iteration-1',
      snapshotState: 'CAPTURED' as const,
      scopeTaskCount: 5,
      completedTaskCount: 4,
      carryOverTaskCount: 1,
      overdueTaskCount: 1,
      openBugCount: 1,
      blockedTaskCount: 0,
      completionRate: 80,
      summary: 'The release shipped on time.',
      wentWell: 'Scope remained focused.',
      improvements: 'Validate edge cases earlier.',
      actionItems: 'Review the carry-over next week.',
      version: 2,
      createdAt: '2026-07-14T08:30:00.000Z',
      updatedAt: '2026-07-14T09:00:00.000Z',
      updatedByName: 'Mina',
    }

  it('formats a shareable captured delivery report', () => {
    const report = formatIterationDeliveryReport({ iteration, retrospective, en: true })

    expect(report).toContain('# Delivery report: July delivery')
    expect(report).toContain('- Snapshot: Captured at close')
    expect(report).toContain('| 5 | 4 | 1 | 80% | 1 | 1 | 0 |')
    expect(report).toContain('## What went well\n\nScope remained focused.')
  })

  it('discloses partial historical data and renders empty notes consistently', () => {
    const report = formatIterationDeliveryReport({
      iteration: { ...iteration, goal: '', closedAt: null },
      retrospective: {
        ...retrospective,
        snapshotState: 'PARTIAL',
        summary: '',
        wentWell: '',
        improvements: '',
        actionItems: '',
      },
      en: true,
    })

    expect(report).toContain('- Snapshot: Historical snapshot: partial')
    expect(report).toContain('> Historical scope was not captured when this iteration closed.')
    expect(report.match(/_Not recorded\._/g)).toHaveLength(5)
  })
})
