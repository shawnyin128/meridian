import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/** Within this many px of an edge, the content counts as reaching it. */
const SLACK = 1

/**
 * Returns the ref for a scroll area that fades toward an edge of `axis` while content is hidden past
 * it. The area's `data-fade` lists those edges, `top` and `bottom` or `left` and `right`, and is
 * absent while all of the content shows; the stylesheets fade by it. It is measured again on every
 * render of the caller, on scroll and on window resize, and dropped when the ref lets go of the area.
 */
export function useScrollFade(axis: 'x' | 'y'): (area: HTMLElement | null) => void {
  const node = useRef<HTMLElement | null>(null)
  const update = useCallback(() => {
    const area = node.current
    if (area === null) return
    const y = axis === 'y'
    const offset = y ? area.scrollTop : area.scrollLeft
    const shown = y ? area.clientHeight : area.clientWidth
    const total = y ? area.scrollHeight : area.scrollWidth
    const edges = [
      offset > SLACK ? (y ? 'top' : 'left') : null,
      offset + shown < total - SLACK ? (y ? 'bottom' : 'right') : null,
    ].filter((edge) => edge !== null)
    if (edges.length > 0) area.dataset.fade = edges.join(' ')
    else delete area.dataset.fade
  }, [axis])

  useLayoutEffect(update)
  useEffect(() => {
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [update])

  return useCallback((area: HTMLElement | null) => {
    if (node.current !== null) {
      node.current.removeEventListener('scroll', update)
      delete node.current.dataset.fade
    }
    node.current = area
    area?.addEventListener('scroll', update, { passive: true })
    update()
  }, [update])
}
