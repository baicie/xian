export const SUBTASK_BATCH_LIMIT = 50
export const SUBTASK_TOTAL_LIMIT = 200
export const SUBTASK_TITLE_LIMIT = 300

const listPrefix = /^(?:[-*•]|\d+[.)])\s+/

export type SubtaskDraft = {
  titles: string[]
  duplicateTitles: string[]
  oversizedTitles: string[]
  overLimit: boolean
  valid: boolean
}

export function parseSubtaskDraft(
  value: string,
  maxItems = SUBTASK_BATCH_LIMIT,
  existingTitles: string[] = [],
): SubtaskDraft {
  const titles = value
      .split(/\r\n?|\n/)
      .map((line) => line.trim().replace(listPrefix, '').trim())
      .filter(Boolean),
    seen = new Set(existingTitles.map((title) => title.replace(/\s+/g, ' ').toLowerCase())),
    duplicates = new Set<string>()

  for (const title of titles) {
    const normalized = title.replace(/\s+/g, ' ').toLowerCase()
    if (seen.has(normalized)) duplicates.add(title)
    else seen.add(normalized)
  }

  const oversizedTitles = titles.filter((title) => title.length > SUBTASK_TITLE_LIMIT),
    overLimit = titles.length > maxItems

  return {
    titles,
    duplicateTitles: [...duplicates],
    oversizedTitles,
    overLimit,
    valid: titles.length > 0 && !overLimit && duplicates.size === 0 && oversizedTitles.length === 0,
  }
}
