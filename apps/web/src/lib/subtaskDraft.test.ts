import { describe, expect, it } from 'vitest'
import { parseSubtaskDraft, SUBTASK_TITLE_LIMIT } from './subtaskDraft'

describe('subtask decomposition draft', () => {
  it('turns pasted lines and common list markers into ordered titles', () => {
    expect(
      parseSubtaskDraft('  - Define scope\n\n1. Build API\r\n• Cover edge cases  ').titles,
    ).toEqual(['Define scope', 'Build API', 'Cover edge cases'])
  })

  it('finds duplicates without changing the submitted titles', () => {
    const draft = parseSubtaskDraft('Review API\nreview   api')

    expect(draft.titles).toEqual(['Review API', 'review   api'])
    expect(draft.duplicateTitles).toEqual(['review   api'])
    expect(draft.valid).toBe(false)
  })

  it('finds titles that already exist on the task', () => {
    const draft = parseSubtaskDraft('Define scope\nBUILD   API', 50, ['Build API'])

    expect(draft.duplicateTitles).toEqual(['BUILD   API'])
    expect(draft.valid).toBe(false)
  })

  it('rejects drafts over the current capacity', () => {
    const draft = parseSubtaskDraft('First\nSecond\nThird', 2)

    expect(draft.overLimit).toBe(true)
    expect(draft.valid).toBe(false)
  })

  it('rejects oversized titles', () => {
    const title = 'x'.repeat(SUBTASK_TITLE_LIMIT + 1),
      draft = parseSubtaskDraft(title)

    expect(draft.oversizedTitles).toEqual([title])
    expect(draft.valid).toBe(false)
  })
})
