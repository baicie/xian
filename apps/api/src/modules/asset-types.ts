import { basename, extname } from 'node:path'
import { unzipSync } from 'fflate'

export const ASSET_MAX_FILE_BYTES = Number(process.env.ASSET_MAX_FILE_BYTES ?? 10 * 1024 * 1024)
export const ASSET_WORKSPACE_QUOTA_BYTES = Number(
  process.env.ASSET_WORKSPACE_QUOTA_BYTES ?? 256 * 1024 * 1024,
)

export const SUPPORTED_ASSET_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/markdown; charset=utf-8',
  'text/plain; charset=utf-8',
  'text/csv; charset=utf-8',
  'application/json',
  'application/yaml',
  'application/vnd.jgraph.mxfile',
  'application/zip',
  'application/vnd.sketch',
  'application/octet-stream',
  'image/vnd.adobe.photoshop',
  'application/postscript',
] as const

export type AssetContentType = (typeof SUPPORTED_ASSET_CONTENT_TYPES)[number]

const zipTypes: Record<string, AssetContentType> = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.sketch': 'application/vnd.sketch',
  '.fig': 'application/octet-stream',
}
const textTypes: Record<string, AssetContentType> = {
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.drawio': 'application/vnd.jgraph.mxfile',
}

const starts = (data: Buffer, signature: number[]) =>
  data.length >= signature.length && signature.every((value, index) => data[index] === value)
const isZip = (data: Buffer) =>
  starts(data, [0x50, 0x4b, 0x03, 0x04]) ||
  starts(data, [0x50, 0x4b, 0x05, 0x06]) ||
  starts(data, [0x50, 0x4b, 0x07, 0x08])
const isText = (data: Buffer) => {
  if (data.includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(data)
    return true
  } catch {
    return false
  }
}
const zipEntries = (data: Buffer) => {
  const names: string[] = []
  try {
    unzipSync(data, {
      filter: (file) => {
        if (names.length >= 5000) throw new Error('Too many archive entries')
        names.push(file.name.replaceAll('\\', '/'))
        return false
      },
    })
    return names
  } catch {
    return null
  }
}

export function safeAssetName(value: string) {
  return (
    basename(value)
      .normalize('NFKC')
      // Intentionally strip ASCII control characters from user-provided file names.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 255) || 'attachment'
  )
}

export function detectAssetType(originalName: string, data: Buffer): AssetContentType | null {
  const extension = extname(originalName).toLowerCase()
  if (extension === '.png' && starts(data, [137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png'
  if (['.jpg', '.jpeg'].includes(extension) && starts(data, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (
    extension === '.gif' &&
    data.length >= 6 &&
    (data.subarray(0, 6).toString() === 'GIF87a' || data.subarray(0, 6).toString() === 'GIF89a')
  )
    return 'image/gif'
  if (
    extension === '.webp' &&
    data.length >= 12 &&
    data.subarray(0, 4).toString() === 'RIFF' &&
    data.subarray(8, 12).toString() === 'WEBP'
  )
    return 'image/webp'
  if (data.subarray(0, 5).toString() === '%PDF-' && (extension === '.pdf' || extension === '.ai'))
    return extension === '.ai' ? 'application/postscript' : 'application/pdf'
  if (data.subarray(0, 10).toString().startsWith('%!PS-Adobe') && extension === '.ai')
    return 'application/postscript'
  if (data.subarray(0, 4).toString() === '8BPS' && extension === '.psd')
    return 'image/vnd.adobe.photoshop'
  if (isZip(data)) {
    const entries = zipEntries(data)
    if (!entries) return null
    if (extension === '.docx' && !entries.includes('word/document.xml')) return null
    if (extension === '.xlsx' && !entries.includes('xl/workbook.xml')) return null
    if (extension === '.pptx' && !entries.includes('ppt/presentation.xml')) return null
    if (
      extension === '.sketch' &&
      !(entries.includes('document.json') && entries.includes('meta.json'))
    )
      return null
    return zipTypes[extension] ?? null
  }
  if (extension === '.fig' && data.subarray(0, 8).toString() === 'fig-kiwi')
    return 'application/octet-stream'
  if (textTypes[extension] && isText(data)) return textTypes[extension]
  return null
}

export function isInlineAssetType(contentType: string) {
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(contentType)
}
