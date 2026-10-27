import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * The return of a view to its top level when the switch that shows it is chosen again while chosen:
 * a segment, a tab or a navigation row picked again. Returns a handler of stable identity. The handler
 * does nothing while `drilled` is false; otherwise it calls `toTop` and puts `view`, and every area
 * scrolled inside it, back at its top, without animation. The latest `drilled` and `toTop` are used.
 */
export function useTopLevel(
  drilled: boolean,
  toTop: () => void,
  view?: RefObject<HTMLElement | null>,
): () => void {
  const latest = useRef({ drilled, toTop })
  useLayoutEffect(() => { latest.current = { drilled, toTop } })
  return useCallback(() => {
    if (!latest.current.drilled) return
    latest.current.toTop()
    const root = view?.current
    if (root === null || root === undefined) return
    for (const area of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
      if (area.scrollTop !== 0) area.scrollTop = 0
    }
  }, [view])
}
