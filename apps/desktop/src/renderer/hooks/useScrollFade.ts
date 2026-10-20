import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { watchSize } from '../lib/watch-size.js'

/** Within this many px of an edge, the content counts as reaching it. */
const SLACK = 1

/**
 * Returns the ref for a scroll area that fades toward an edge of `axis` (`both` for the two) while
 * content is hidden past it. The area's `data-fade` lists those edges, `top`, `bottom`, `left` and
 * `right`, and is absent while all of the content shows; the stylesheets fade by it. It is measured
 * again on every render of the caller, on scroll, on window resize and whenever the area or one of
 * its children changes size, and dropped when the ref lets go of the area. `held`, when given, is
 * kept pointing at the area too, for a caller that also needs the element.
 */
export function useScrollFade<T extends HTMLElement>(
  axis: 'x' | 'y' | 'both', held?: { current: T | null },
): (area: T | null) => void {
  const node = useRef<HTMLElement | null>(null)
  const unwatch = useRef<(() => void) | null>(null)
  const update = useCallback(() => {
    const area = node.current
    if (area === null) return
    const edges: string[] = []
    if (axis !== 'x') {
      if (area.scrollTop > SLACK) edges.push('top')
      if (area.scrollTop + area.clientHeight < area.scrollHeight - SLACK) edges.push('bottom')
    }
    if (axis !== 'y') {
      if (area.scrollLeft > SLACK) edges.push('left')
      if (area.scrollLeft + area.clientWidth < area.scrollWidth - SLACK) edges.push('right')
    }
    if (edges.length > 0) area.dataset.fade = edges.join(' ')
    else delete area.dataset.fade
  }, [axis])

  useLayoutEffect(update)
  useEffect(() => {
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [update])

  return useCallback((area: T | null) => {
    if (held !== undefined) held.current = area
    if (node.current !== null) {
      node.current.removeEventListener('scroll', update)
      delete node.current.dataset.fade
    }
    unwatch.current?.()
    unwatch.current = null
    node.current = area
    if (area !== null) {
      area.addEventListener('scroll', update, { passive: true })
      // The content can grow or the area shrink without a render of the caller, such as a sibling appearing.
      unwatch.current = watchSize(area, update)
    }
    update()
  }, [update, held])
}
