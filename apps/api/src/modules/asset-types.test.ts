import { describe, expect, it } from 'vitest'
import { zipSync } from 'fflate'
import { detectAssetType, isInlineAssetType, safeAssetName } from './asset-types.js'

const zip = (files: Record<string, string>) =>
  Buffer.from(
    zipSync(
      Object.fromEntries(Object.entries(files).map(([name, value]) => [name, Buffer.from(value)])),
    ),
  )

describe('asset type detection', () => {
  it('accepts common documents and design deliverables', () => {
    expect(detectAssetType('architecture.pdf', Buffer.from('%PDF-1.7\n%%EOF'))).toBe(
      'application/pdf',
    )
    expect(detectAssetType('spec.md', Buffer.from('# Interface\n'))).toBe(
      'text/markdown; charset=utf-8',
    )
    expect(detectAssetType('flow.drawio', Buffer.from('<mxfile/>'))).toBe(
      'application/vnd.jgraph.mxfile',
    )
    expect(
      detectAssetType(
        'design.docx',
        zip({ 'word/document.xml': '<w:document/>', '[Content_Types].xml': 'types' }),
      ),
    ).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(
      detectAssetType('prototype.sketch', zip({ 'document.json': '{}', 'meta.json': '{}' })),
    ).toBe('application/vnd.sketch')
    expect(detectAssetType('mockup.psd', Buffer.from('8BPSmockup'))).toBe(
      'image/vnd.adobe.photoshop',
    )
  })
  it('rejects spoofed or active-content files', () => {
    expect(detectAssetType('fake.docx', zip({ 'payload.txt': 'not office' }))).toBeNull()
    expect(detectAssetType('image.exe', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBeNull()
    expect(detectAssetType('page.html', Buffer.from('<script>alert(1)</script>'))).toBeNull()
    expect(detectAssetType('vector.svg', Buffer.from('<svg/>'))).toBeNull()
  })
  it('sanitizes names and only inlines browser-safe raster images', () => {
    expect(safeAssetName('../design\u0000.pdf')).toBe('design.pdf')
    expect(isInlineAssetType('image/png')).toBe(true)
    expect(isInlineAssetType('application/pdf')).toBe(false)
  })
})
