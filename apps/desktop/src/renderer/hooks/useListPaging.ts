import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/**
 * How a long list shows its items: `pages`, pages that hold as many items as the list's box fits,
 * or `scroll`, one run that scrolls and loads more items as its end comes near. Demo switch, read
 * from the `meridian.demo.list-fill` local-storage key.
 */
export const listFill = (): 'pages' | 'scroll' => (window.localStorage.getItem('meridian.demo.list-fill') === 'scroll' ? 'scroll' : 'pages')

/** Items a scrolling list loads at a time. */
export const LOAD_STEP = 100

/** The paging state of a long list; see `useListPaging`. */
export type ListPaging = {
  /** The page shown, from 1; for a scrolling list, how many steps of `LOAD_STEP` items it holds. */
  page: number
  /** Items per page; for a scrolling list, `LOAD_STEP`. */
  size: number
  setPage: (page: number) => void
  /**
   * Sets how many items a page holds, moving to the page that holds the first item of the page last
   * picked, so that a run of resizes keeps that item on the page shown.
   */
  fit: (size: number) => void
  /** Loads the next step of a scrolling list. */
  more: () => void
}

/**
 * The paging state of a long list under `listFill()`. Its pages hold `initial` items until the list
 * first reports how many fit through `fit`.
 */
export function useListPaging(initial: number): ListPaging {
  const [state, setState] = useState({ page: 1, size: listFill() === 'scroll' ? LOAD_STEP : initial, anchor: 0 })
  const setPage = useCallback((page: number) => setState((held) => (held.page === page && held.anchor === (page - 1) * held.size
    ? held : { ...held, page, anchor: (page - 1) * held.size })), [])
  const fit = useCallback((size: number) => setState((held) => (held.size === size ? held
    : { ...held, page: Math.floor(held.anchor / size) + 1, size })), [])
  const more = useCallback(() => setState((held) => ({ ...held, page: held.page + 1 })), [])
  return { page: state.page, size: state.size, setPage, fit, more }
}

/** The nearest element from `node` up that scrolls vertically, or null. */
export function scrollParent(node: HTMLElement | null): HTMLElement | null {
  for (let at = node; at !== null; at = at.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(at).overflowY)) return at
  }
  return null
}

/**
 * Calls `onEnd` when the last of `box`'s items, as `itemsOf` finds them, comes within one screen of
 * the visible end of the area that scrolls it, once for each item that is last. Does nothing while
 * `onEnd` is undefined.
 */
export function useNearEnd(
  box: RefObject<HTMLElement | null>, itemsOf: (box: HTMLElement) => HTMLElement[], onEnd: (() => void) | undefined,
): void {
  const latest = useRef(onEnd)
  latest.current = onEnd
  const reached = useRef<Element | null>(null)
  const active = onEnd !== undefined
  // Runs after every render: the last item changes whenever more items arrive.
  useLayoutEffect(() => {
    const node = box.current
    if (!active || node === null) return undefined
    const last = itemsOf(node).at(-1)
    if (last === undefined) return undefined
    const observer = new IntersectionObserver((entries) => {
      if (reached.current === last || !entries.some((entry) => entry.isIntersecting)) return
      reached.current = last
      latest.current?.()
    }, { root: scrollParent(node), rootMargin: '0px 0px 100% 0px' })
    observer.observe(last)
    return () => observer.disconnect()
  })
}
