// H5 dialog focus follows the native sheet's visibility. Native pages use the host's focus handling.
export function createGuideSheetFocus(dismiss) {
  let opener = null
  let dialog = null
  let host = null
  const viewport = window.visualViewport
  const controls = 'textarea,input:not([type=hidden]),button,[tabindex="0"]'

  // Mobile browsers may resize only the visual viewport when the keyboard opens.
  // Measure the page edge so hosts that already resized receive no extra inset.
  function fitKeyboard() {
    if (!host || !viewport || !host.parentElement) return
    const pageBottom = host.parentElement.getBoundingClientRect().bottom
    const overlap = Math.max(0, pageBottom - viewport.offsetTop - viewport.height)
    host.style.bottom = overlap + 'px'
  }

  function handleKey(event) {
    if (!dialog || event.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      dismiss()
      return
    }
    if (event.key !== 'Tab') return
    const items = Array.from(dialog.querySelectorAll(controls)).filter(element =>
      !element.disabled && element.getAttribute('aria-disabled') !== 'true' && element.getClientRects().length)
    if (!items.length) return
    const index = items.indexOf(document.activeElement)
    if (index < 0 || (event.shiftKey ? index === 0 : index === items.length - 1)) {
      event.preventDefault()
      items[event.shiftKey ? items.length - 1 : 0].focus()
    }
  }
  return {
    capture() { if (!dialog) opener = document.activeElement },
    open() {
      dialog = document.getElementById('guide-sheet')
      if (!dialog) return
      const input = dialog.querySelector('textarea')
      if (input) {
        input.setAttribute('aria-label', dialog.getAttribute('aria-label') || '')
        host = dialog.closest('.sheet-host')
        fitKeyboard()
        viewport?.addEventListener('resize', fitKeyboard)
        viewport?.addEventListener('scroll', fitKeyboard)
      }
      const target = input || dialog.querySelector(controls)
      target?.focus()
      document.addEventListener('keydown', handleKey)
    },
    close() {
      document.removeEventListener('keydown', handleKey)
      viewport?.removeEventListener('resize', fitKeyboard)
      viewport?.removeEventListener('scroll', fitKeyboard)
      if (host) host.style.removeProperty('bottom')
      host = null
      if (dialog && opener?.isConnected && opener.getClientRects().length) opener.focus()
      dialog = null
      opener = null
    },
  }
}
