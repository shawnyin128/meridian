import { useCallback, useRef } from 'react'

/** What takes the keyboard focus inside a row. */
const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]'

/**
 * Keeps the keyboard focus in a list whose focused row goes away: once the row that held the focus is
 * removed and the focus has fallen out of the page, the nearest row that can take it does, the one now
 * in its place first, then the one before it, and so on outward. A row takes it on itself when it is a
 * control, otherwise on its first control. Focus that moved elsewhere first stays where it went.
 * @param rowsOf The list's own rows, in order.
 * @returns The ref callback for the list's element.
 */
export function useNeighbourFocus(rowsOf: (list: HTMLElement) => HTMLElement[]): (node: HTMLElement | null) => void {
  const stop = useRef<(() => void) | null>(null)
  return useCallback((list: HTMLElement | null) => {
    stop.current?.()
    stop.current = null
    if (list === null) return
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
        target?.focus()
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
