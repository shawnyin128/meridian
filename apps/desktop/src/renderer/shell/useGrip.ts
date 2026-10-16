import { useCallback, useEffect, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

/** The width range, in px, that each of the shell's grips keeps its panel within. */
export const GRIP_WIDTHS = {
  sidebar: { min: 180, max: 320 },
  paperChat: { min: 240, max: 480 },
}

/**
 * The demo's resize grip, which must be a direct child of the panel it resizes. Returns the grip's
 * mousedown handler. Moving more than 3px after the press is a drag: the panel's width at the press
 * plus the distance moved, clamped to `limits`, goes to `onResize`. Releasing without moving is a
 * click, which calls `onClick`. `limits`, `onResize` and `onClick` should keep their reference across
 * renders.
 */
export function useGrip(
  limits: { min: number; max: number },
  onResize: (width: number) => void,
  onClick: () => void,
): (e: ReactMouseEvent) => void {
  const drag = useRef<{ x0: number; w0: number; moved: boolean } | null>(null)

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current
      if (!d) return
      const dx = e.clientX - d.x0
      if (!d.moved && Math.abs(dx) > 3) d.moved = true
      if (d.moved) onResize(Math.max(limits.min, Math.min(limits.max, d.w0 + dx)))
    }
    const up = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      if (!d.moved) onClick()
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
    return () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
  }, [limits, onResize, onClick])

  return useCallback((e: ReactMouseEvent) => {
    drag.current = { x0: e.clientX, w0: e.currentTarget.parentElement!.getBoundingClientRect().width, moved: false }
    e.preventDefault()
  }, [])
}
