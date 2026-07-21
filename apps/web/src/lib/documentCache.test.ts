import { describe, expect, it, vi } from 'vitest'
import { loadDocumentOnce } from './documentCache'

describe('document cache', () => {
  it('deduplicates concurrent document loads', async () => {
    const document = {
      id: 'doc-1',
      projectId: null,
      folderId: null,
      title: 'Design',
      kind: 'DESIGN' as const,
      status: 'DRAFT' as const,
      content: '# content',
      version: 1,
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
    }
    const loader = vi.fn(async () => document)
    const [first, second] = await Promise.all([
      loadDocumentOnce('workspace-1', 'doc-1', loader),
      loadDocumentOnce('workspace-1', 'doc-1', loader),
    ])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
  })
})
