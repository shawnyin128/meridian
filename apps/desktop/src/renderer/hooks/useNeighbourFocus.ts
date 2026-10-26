import { useCallback, useRef } from 'react'

/** What takes the keyboard focus inside a row. */
const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]'

/** Marks a control that took the focus after a pointer action; tokens.css draws no focus ring on it. */
const QUIET = 'data-quiet-focus'

/** Whether the pointer, not the keyboard, was used last, as `:focus-visible` decides it; heard once for the whole page. */
let pointerLast = false
let listening = false
const listen = (): void => {
  if (listening) return
  listening = true
  document.addEventListener('pointerdown', () => { pointerLast = true }, true)
  document.addEventListener('keydown', () => { pointerLast = false }, true)
}

/** Gives `target` the focus without a ring while the pointer was used last; the ring returns at its next key or once it loses the focus. */
function focusQuietly(target: HTMLElement): void {
  if (!pointerLast) {
    target.focus()
    return
  }
  target.setAttribute(QUIET, '')
  const release = () => {
    target.removeAttribute(QUIET)
    target.removeEventListener('keydown', release)
    target.removeEventListener('blur', release)
  }
  target.addEventListener('keydown', release)
  target.addEventListener('blur', release)
  target.focus()
  if (document.activeElement !== target) release()
}

/**
 * Keeps the keyboard focus in a list whose focused row goes away: once the row that held the focus is
 * removed and the focus has fallen out of the page, the nearest row that can take it does, the one now
 * in its place first, then the one before it, and so on outward. A row takes it on itself when it is a
 * control, otherwise on its first control. Focus that moved elsewhere first stays where it went. When
 * the pointer, not the keyboard, was used last, the row takes the focus without a focus ring, as
 * `:focus-visible` would have it, until its next key press or until it loses the focus.
 * @param rowsOf The list's own rows, in order.
 * @returns The ref callback for the list's element.
 */
export function useNeighbourFocus(rowsOf: (list: HTMLElement) => HTMLElement[]): (node: HTMLElement | null) => void {
  const stop = useRef<(() => void) | null>(null)
  return useCallback((list: HTMLElement | null) => {
    stop.current?.()
    stop.current = null
    if (list === null) return
    listen()
    let held: { row: HTMLElement; at: number } | null = null
    const hold = (event: FocusEvent) => {
      const rows = rowsOf(list)
      const at = rows.findIndex((row) => row.contains(event.target as Node))
      held = at < 0 ? null : { row: rows[at]!, at }
    }
    const observer = new MutationObserver(() => {
      if (held === null || held.row.isConnected) return
      const lost = document.activeElement === null || document.activeElement === document.body
      const { at } = held
      held = null
      if (!lost) return
      const rows = rowsOf(list)
      // The row in the removed one's place, then the one before it, then outward from there.
      const rank = (index: number) => (index >= at ? (index - at) * 2 : (at - index) * 2 - 1)
      const order = rows.map((_, index) => index).sort((x, y) => rank(x) - rank(y))
      for (const index of order) {
        const row = rows[index]!
        const target = row.matches(FOCUSABLE) ? row : row.querySelector<HTMLElement>(FOCUSABLE)
        if (target !== null) focusQuietly(target)
        // A row that draws no box, such as one in a folded group, cannot take the focus.
        if (target !== null && document.activeElement === target) return
      }
    })
    list.addEventListener('focusin', hold)
    observer.observe(list, { childList: true, subtree: true })
    stop.current = () => {
      list.removeEventListener('focusin', hold)
      observer.disconnect()
    }
  }, [rowsOf])
}
