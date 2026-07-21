import type { Asset } from '@/api'

export const ASSET_PAGE_SIZE = 10
export const assetAccept =
  '.png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.xlsx,.pptx,.md,.txt,.csv,.json,.yaml,.yml,.drawio,.zip,.sketch,.fig,.psd,.ai'
export const isPreviewableAsset = (contentType: string) =>
  ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(contentType)
export const assetExtension = (name: string) =>
  name.includes('.') ? name.split('.').pop()!.toUpperCase().slice(0, 5) : 'FILE'
export const formatAssetSize = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`
export const getDeletableAssetIds = (assets: Asset[]) =>
  assets.filter((asset) => asset.referenceCount === 0).map((asset) => asset.id)
export const updateAssetSelection = (selected: string[], ids: string[], checked: boolean) =>
  checked
    ? [...new Set([...selected, ...ids])]
    : selected.filter((selectedId) => !ids.includes(selectedId))
export const getAssetPage = (assets: Asset[], page: number) =>
  assets.slice((page - 1) * ASSET_PAGE_SIZE, page * ASSET_PAGE_SIZE)
