export function copyText(text: string, onCopied?: () => void, onFail?: () => void) {
  const done = () => onCopied?.()
  const fail = () => onFail?.()
  const fallback = () => {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      document.body.removeChild(textarea)
      if (copied) done()
      else fail()
    } catch { fail() }
  }
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback)
  else fallback()
}
