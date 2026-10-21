import { useCallback, useMemo, useRef } from 'react'
import { watchSize } from '../lib/watch-size.js'

/** Within this many px of its end, a scroll area counts as showing its latest content. */
const NEAR = 24

/**
 * Returns `ref`, for a scroll area that keeps its end in view while the reader is there, and `follow`.
 * Whenever the area or its content changes size, an area scrolled to within NEAR px of its end scrolls
 * to the end again; one the reader has scrolled away from stays where it is. `follow` scrolls to the
 * end and follows again, for the reader's own message or a conversation just opened.
 */
export function useFollowEnd<T extends HTMLElement>(): { ref: (area: T | null) => void; follow: () => void } {
  const node = useRef<T | null>(null)
  const following = useRef(true)
  const unwatch = useRef<(() => void) | null>(null)
  const toEnd = useCallback(() => {
    const area = node.current
    if (area !== null && following.current) area.scrollTop = area.scrollHeight
  }, [])
  const read = useCallback(() => {
    const area = node.current
    if (area !== null) following.current = area.scrollTop + area.clientHeight >= area.scrollHeight - NEAR
  }, [])
  const ref = useCallback((area: T | null) => {
    node.current?.removeEventListener('scroll', read)
    unwatch.current?.()
    unwatch.current = null
    node.current = area
    if (area === null) return
    area.addEventListener('scroll', read, { passive: true })
    unwatch.current = watchSize(area, toEnd)
    toEnd()
  }, [read, toEnd])
  const follow = useCallback(() => {
    following.current = true
    toEnd()
  }, [toEnd])
  return useMemo(() => ({ ref, follow }), [ref, follow])
}
