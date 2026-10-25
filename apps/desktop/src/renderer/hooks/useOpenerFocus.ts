import { useCallback, useEffect, useRef } from 'react'

/** The child of the body that holds `element`: the page's root for the page, a portal for a layer. */
function regionOf(element: Element): Element {
  let at = element
  while (at.parentElement !== null && at.parentElement !== document.body) at = at.parentElement
  return at
}

/**
 * Focus for a layer, portaled as Radix portals it, that opens without a Radix trigger. When it
 * closes, focus goes back to the element that held it as `open` turned true or, when focus was on
 * nothing then, to the element that held it last: only while that element is still on the page, and
 * not when focus has meanwhile been moved to another element of the page that element is on, as a
 * press outside a popover moves it. Focus goes back as soon as `open` turns false, and again in the
 * returned handler, the layer's `onCloseAutoFocus`, since Radix does not call that on every way a
 * layer closes; the handler leaves focus to Radix when no element was noted. With `restore` false,
 * closing gives no focus back.
 */
export function useOpenerFocus(open: boolean, restore = true): (event: Event) => void {
  const opener = useRef<HTMLElement | null>(null)
  const lastFocused = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  const committedOpen = useRef(open)
  const openRef = useRef(open)
  openRef.current = open
  const restoreRef = useRef(restore)
  restoreRef.current = restore

  useEffect(() => {
    const remember = (event: FocusEvent) => {
      if (!openRef.current && event.target instanceof HTMLElement && event.target !== document.body) {
        lastFocused.current = event.target
      }
    }
    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [])

  // By the time a layer focuses itself, Radix may have moved focus to the body for a moment, so the
  // element is noted in the closed → open render, while focus is still where it was.
  if (open && !wasOpen.current) {
    const active = document.activeElement
    opener.current = active instanceof HTMLElement && active !== document.body ? active : lastFocused.current
  }
  wasOpen.current = open

  const giveBack = useCallback(() => {
    const held = opener.current
    if (held === null || !held.isConnected) return
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body && regionOf(active) === regionOf(held)) return
    held.focus()
  }, [])

  useEffect(() => {
    const previous = committedOpen.current
    committedOpen.current = open
    if (previous && !open && restore) giveBack()
  }, [open, restore, giveBack])

  return useCallback((event: Event) => {
    if (!restoreRef.current || opener.current === null) return
    event.preventDefault()
    giveBack()
  }, [giveBack])
}
