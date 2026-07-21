import { describe, expect, it } from 'vitest'
import type { Asset } from '@/api'
import { getAssetPage, getDeletableAssetIds, updateAssetSelection } from './assets'

const asset = (id: string, referenceCount = 0): Asset => ({
  id,
  referenceCount,
  originalName: `${id}.png`,
  contentType: 'image/png',
  sizeBytes: 1,
  sha256: id,
  createdAt: '2026-07-21T00:00:00.000Z',
})

describe('static resource selection and pagination', () => {
  it('only selects unreferenced files', () => {
    expect(getDeletableAssetIds([asset('unused'), asset('in-use', 2)])).toEqual(['unused'])
  })

  it('keeps selections from other pages when toggling the current page', () => {
    expect(updateAssetSelection(['previous'], ['current'], true)).toEqual(['previous', 'current'])
    expect(updateAssetSelection(['previous', 'current'], ['current'], false)).toEqual(['previous'])
  })

  it('returns ten files per page', () => {
    const assets = Array.from({ length: 12 }, (_, index) => asset(String(index + 1)))
    expect(getAssetPage(assets, 2).map(({ id }) => id)).toEqual(['11', '12'])
  })
})
