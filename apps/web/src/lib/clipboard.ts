export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.cssText = 'position:fixed;opacity:0'
    document.body.append(textarea)
    textarea.select()
    try {
      if (!document.execCommand('copy')) throw new Error('Copy failed')
    } finally {
      textarea.remove()
    }
  }
}
