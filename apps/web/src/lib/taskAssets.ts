import { api, type Asset } from '@/api'

export async function attachFilesToTask(
  workspaceId: string,
  taskId: string,
  files: File[],
  status: 'OPEN' | 'RESOLVED',
  en: boolean,
) {
  const assets: Asset[] = []
  for (const file of files) assets.push(await api.uploadAsset(workspaceId, file))
  await api.createTaskComment(workspaceId, taskId, {
    body: en
      ? `Uploaded ${assets.length} attachment${assets.length === 1 ? '' : 's'}`
      : `上传了 ${assets.length} 个附件`,
    status,
    assetIds: assets.map((asset) => asset.id),
  })
  return assets
}
