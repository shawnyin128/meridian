import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'

/**
 * Drag-to-reschedule and viewport tracking for a Gantt chart, shared by both Gantt timelines.
 * A draggable element calls `grab` on mousedown with the `G` it stands for. On mouseup, if the
 * pointer moved more than 4px sideways and the snapped displacement is not zero units, `onMove`
 * receives that `G` and the units moved; otherwise it is a click and goes to `onClick`. A unit is
 * one day (`dayWidth` pixels) unless `unitWidthOf` gives an element a finer one (timed tasks in
 * the project day view snap to two hours). `idOf` names a `G`: while it is dragged, `dragged`
 * returns its snapped pixel offset, and 0 for every other id.
 * `wrap` is the Gantt's `.gwrap`. Put the returned `onClickCapture` on the Gantt's root element: it
 * swallows the click the browser fires after mouseup. `stubAt` takes a bar's left and right ends on
 * the canvas and, when less than 4px of the bar shows in the `wrap` viewport, returns the side its
 * stub sits on and the stub's `left`; otherwise null. The viewport is re-measured on scroll and
 * resize, but the measuring effect runs only once on mount (it depends on the `wrap` ref, whose
 * identity never changes), so `wrap.current` must already point at the real node when this hook
 * mounts, or the viewport stays `{ left: 0, width: 0 }`. The right-side stub's `left` assumes the
 * 20px stub width of `.gstub` in `TimelineBoard.css`; change both together.
 */
export function useGanttDrag<G>({ wrap, dayWidth, unitWidthOf, idOf, onMove, onClick }: {
  wrap: RefObject<HTMLDivElement | null>
  dayWidth: number
  unitWidthOf?: (grab: G) => number
  idOf: (grab: G) => string
  onMove: (grab: G, units: number) => void
  onClick: (grab: G) => void
}): {
  grab: (e: ReactMouseEvent, grab: G) => void
  dragged: (id: string) => number
  onClickCapture: (e: ReactMouseEvent) => void
  stubAt: (barLeft: number, barRight: number) => { side: 'l' | 'r'; left: number } | null
} {
  const drag = useRef<{
    grab: G; id: string; x0: number; dx: number; unitWidth: number; moved: boolean
  } | null>(null)
  // After mouseup the browser fires one more click, which may land on blank lane space where a click
  // creates a milestone; that click must not create one. When the mouse is released outside the
  // Gantt, no Gantt handler consumes the click, so the next mousedown clears the flag; otherwise it
  // would stay set until it swallowed some unrelated Gantt click.
  const suppress = useRef(false)
  const [shift, setShift] = useState<{ id: string; dx: number } | null>(null)
  const [view, setView] = useState({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const w = wrap.current
    if (!w) return
    const sync = () => setView({ left: w.scrollLeft, width: w.clientWidth })
    sync()
    w.addEventListener('scroll', sync)
    // Both screens stay mounted, so the viewport may change while the other screen is shown;
    // measuring only once on mount would keep a stale width.
    const resize = new ResizeObserver(sync)
    resize.observe(w)
    return () => {
      w.removeEventListener('scroll', sync)
      resize.disconnect()
    }
  }, [wrap])

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current
      if (!d) return
      d.dx = Math.round((e.clientX - d.x0) / d.unitWidth)
      if (Math.abs(e.clientX - d.x0) > 4) d.moved = true
      setShift({ id: d.id, dx: d.dx })
    }
    const up = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      setShift(null)
      suppress.current = true
      if (d.moved && d.dx !== 0) onMove(d.grab, d.dx)
      else onClick(d.grab)
    }
    const down = () => { suppress.current = false }
    document.addEventListener('mousedown', down)
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
  }, [onMove, onClick])

  return {
    grab: (e, g) => {
      drag.current = {
        grab: g, id: idOf(g), x0: e.clientX, dx: 0,
        unitWidth: unitWidthOf?.(g) ?? dayWidth, moved: false,
      }
      e.preventDefault()
    },
    dragged: (id) => {
      const held = drag.current
      return shift?.id === id ? shift.dx * (held?.unitWidth ?? dayWidth) : 0
    },
    onClickCapture: (e) => { if (suppress.current) { suppress.current = false; e.stopPropagation() } },
    stubAt: (barLeft, barRight) => {
      if (barRight < view.left + 4) return { side: 'l', left: view.left + 6 }
      if (barLeft > view.left + view.width - 4) return { side: 'r', left: view.left + view.width - 26 }
      return null
    },
  }
}
