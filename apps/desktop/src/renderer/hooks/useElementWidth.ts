import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * The width, its `clientWidth` in px, of the element `box` holds when the caller mounts: measured
 * before the element is first painted and again whenever it changes size, so a hidden screen's
 * element measures 0 until it shows. 0 when `box` holds nothing then.
 */
export function useElementWidth(box: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = box.current
    if (element === null) return
    const measure = () => setWidth(element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [box])
  return width
}
