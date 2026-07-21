import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

afterEach(() => vi.unstubAllGlobals())

describe('copyText', () => {
  it('falls back when the Clipboard API is unavailable', async () => {
    const textarea = {
        value: '',
        style: { cssText: '' },
        select: vi.fn(),
        remove: vi.fn(),
      },
      append = vi.fn(),
      execCommand = vi.fn(() => true)
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('document', {
      createElement: () => textarea,
      body: { append },
      execCommand,
    })

    await copyText('secret')

    expect(textarea.value).toBe('secret')
    expect(append).toHaveBeenCalledWith(textarea)
    expect(textarea.select).toHaveBeenCalled()
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(textarea.remove).toHaveBeenCalled()
  })
})
