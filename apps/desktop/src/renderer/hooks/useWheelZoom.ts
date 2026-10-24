import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

/** Zoom change per pixel of wheel or pinch delta. */
const WHEEL_RATE = 0.0015

/**
 * Zooms the element `target` holds from the wheel. A trackpad pinch, which Chromium delivers as a
 * wheel event with ctrlKey set, and a scroll with Ctrl or ⌘ held call `zoom` with the factor to
 * scale the zoom by and the pointer's client position, and do not scroll. The factor is exponential
 * in the vertical delta, so small steps add up to one large step and equal steps back and forth
 * cancel. Every other wheel event scrolls as usual. The latest `zoom` is called.
 */
export function useWheelZoom(
  target: RefObject<HTMLElement | null>,
  zoom: (factor: number, at: { x: number; y: number }) => void,
): void {
  const latest = useRef(zoom)
  useLayoutEffect(() => { latest.current = zoom })
  useEffect(() => {
    const element = target.current
    if (element === null) return
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      latest.current(Math.exp(-event.deltaY * WHEEL_RATE), { x: event.clientX, y: event.clientY })
    }
    // React registers wheel listeners as passive, where preventDefault is ignored and the page scrolls too.
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [target])
}
