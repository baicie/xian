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
