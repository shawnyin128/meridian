import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * Whether the text in `box` is cut off by it: wider or taller than the box. Measured when `content`
 * changes and whenever the box changes size.
 */
export function useClipped(box: RefObject<HTMLElement | null>, content: unknown): boolean {
  const [clipped, setClipped] = useState(false)
  useLayoutEffect(() => {
    const element = box.current
    if (element === null) return
    const measure = () => setClipped(element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [box, content])
  return clipped
}
