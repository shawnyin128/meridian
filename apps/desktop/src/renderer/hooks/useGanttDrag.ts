import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'
import { useElementWidth } from './useElementWidth.js'

/**
 * Drag-to-reschedule and viewport tracking for a Gantt chart, shared by both Gantt timelines.
 * A draggable element calls `grab` on mousedown with the `G` it stands for. On mouseup, if the
 * pointer moved more than 4px sideways and the snapped displacement is not zero units, `onMove`
 * receives that `G` and the units moved; otherwise it is a click and goes to `onClick`. A unit is
 * one day (`dayWidth` pixels) unless `unitWidthOf` gives an element a finer one (timed tasks in
 * the project day view snap to two hours). `idOf` names a `G`: while it is dragged, `dragged`
 * returns its snapped pixel offset, and 0 for every other id, and once it has moved past the 4px,
 * `dragging` is true for it. Escape during a drag puts the element back where it was and ends the
 * drag: the release that follows moves nothing and is no click.
 * `wrap` is the Gantt's `.gwrap`. Put the returned `onClickCapture` on the Gantt's root element: it
 * swallows the click the browser fires after mouseup. `stubAt` takes a bar's left and right ends on
 * the canvas and, when less than 4px of the bar shows in the `wrap` viewport, returns the side its
 * stub sits on and the stub's `left`; otherwise null. The viewport is re-measured on scroll and
 * resize of the node `wrap` points at when this hook mounts (see useElementWidth); without one, the
 * viewport stays at its left edge and 0 wide. The right-side stub's `left` assumes the
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
  dragging: (id: string) => boolean
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
  const [shift, setShift] = useState<{ id: string; dx: number; moved: boolean } | null>(null)
  const width = useElementWidth(wrap)
  const [left, setLeft] = useState(0)

  useLayoutEffect(() => {
    const w = wrap.current
    if (!w) return
    const sync = () => setLeft(w.scrollLeft)
    sync()
    w.addEventListener('scroll', sync)
    return () => w.removeEventListener('scroll', sync)
  }, [wrap])

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current
      if (!d) return
      d.dx = Math.round((e.clientX - d.x0) / d.unitWidth)
      if (Math.abs(e.clientX - d.x0) > 4) d.moved = true
      setShift({ id: d.id, dx: d.dx, moved: d.moved })
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
    // Capture, so the Escape that cancels a drag is handled before the shell peels a layer with it.
    const cancel = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !drag.current) return
      e.preventDefault()
      e.stopPropagation()
      drag.current = null
      setShift(null)
      suppress.current = true
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
    document.addEventListener('keydown', cancel, true)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.removeEventListener('keydown', cancel, true)
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
    dragging: (id) => shift?.id === id && shift.moved,
    onClickCapture: (e) => { if (suppress.current) { suppress.current = false; e.stopPropagation() } },
    stubAt: (barLeft, barRight) => {
      if (barRight < left + 4) return { side: 'l', left: left + 6 }
      if (barLeft > left + width - 4) return { side: 'r', left: left + width - 26 }
      return null
    },
  }
}
