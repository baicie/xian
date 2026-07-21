import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, type Asset } from '@/api'
import { attachFilesToTask } from './taskAssets'

const uploaded = (id: string): Asset & { deduplicated: boolean } => ({
  id,
  originalName: `${id}.png`,
  contentType: 'image/png',
  sizeBytes: 8,
  sha256: id,
  createdAt: '2026-07-21T00:00:00.000Z',
  referenceCount: 0,
  deduplicated: false,
})

describe('task attachments', () => {
  afterEach(() => vi.restoreAllMocks())

  it('persists uploaded files as a task comment immediately', async () => {
    vi.spyOn(api, 'uploadAsset')
      .mockResolvedValueOnce(uploaded('first'))
      .mockResolvedValueOnce(uploaded('second'))
    const createComment = vi.spyOn(api, 'createTaskComment').mockResolvedValue({
      id: 'comment-1',
      body: '上传了 2 个附件',
      status: 'OPEN',
      author: '测试用户',
      createdAt: '2026-07-21T00:00:00.000Z',
      assets: [],
    })

    await attachFilesToTask('workspace-1', 'task-1', [{} as File, {} as File], 'OPEN', false)

    expect(createComment).toHaveBeenCalledWith('workspace-1', 'task-1', {
      body: '上传了 2 个附件',
      status: 'OPEN',
      assetIds: ['first', 'second'],
    })
  })
})
