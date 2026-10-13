export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // Support browsers that restrict the asynchronous clipboard API.
    const focused = document.activeElement as HTMLElement | null
    const field = document.createElement('textarea')
    field.value = text
    field.readOnly = true
    field.style.cssText = 'position:fixed;opacity:0;pointer-events:none;left:0;top:0'
    document.body.append(field)
    try {
      field.select()
      if (!document.execCommand('copy')) throw new Error('Could not copy text')
    } finally {
      field.remove()
      focused?.focus()
    }
  }
}
