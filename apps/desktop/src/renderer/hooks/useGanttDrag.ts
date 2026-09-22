import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'

/**
 * Hold and drag the Gantry to reschedule the set with its viewport, shared by both Ganters.
 * The draggable element raises `grab` on mousedown, and transfers the `G` it held when it was pressed; when the hand is raised, the pointer moves laterally by more than 4px and is pressed
 * If the adsorbed displacement is not zero throughout the day, then this portion and the number of days of displacement are handed over to `onMove`, otherwise it is counted as a click and handed over to `onClick`.
 * `idOf` gives this identifier in the Gantry: during dragging `dragged` returns the pixel offset following the pointer for this identifier,
 * Returns 0 for other identifiers.
 * `wrap` is Gantt's `.gwrap`, `dayWidth` is the pixel width of a day grid. returned
 * `onClickCapture` is hung on the root element of the Gantt, swallowing the click that the browser resends after raising the hand; `stubAt` receives a paragraph
 * `unitWidthOf` allows specific elements to use finer adsorption units (time-sharing tasks in the project day view use two hours);
 * The horizontal bars are at the left and right ends of the canvas, which is in the viewport of `wrap`
 * If less than 4px is exposed, return the side where the stump is attached and the `left` of the stump, otherwise return null. The viewport scrolls with `wrap` and
 * Size changes are re-measured, but the side effects of the measurement are only run once when mounting (depending on the `wrap` ref, the identity will not change),
 * The caller must ensure that `wrap.current` has pointed to the real node at the moment this hook is mounted, otherwise the viewport will always stop at
 * `{ left: 0, width: 0 }`. `stubAt` sticks to the right border of `left` and is calculated based on the stub width of 20px (`ProjectDetail.css`
 * `.gstub`), if the width is changed, the calculation here must be changed accordingly.
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
  // After raising your hand, the browser will add another click, and the landing point may be the place where you click on the blank to create a new milestone: that time can no longer be regarded as a new one.
  // When the hand is raised outside Gant, this click will not be Gant consumption, so the next time you press it, the mark will be cleared.
  // Otherwise it will stay until some unrelated Gantt click swallows that click.
  const suppress = useRef(false)
  const [shift, setShift] = useState<{ id: string; dx: number } | null>(null)
  const [view, setView] = useState({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const w = wrap.current
    if (!w) return
    const sync = () => setView({ left: w.scrollLeft, width: w.clientWidth })
    sync()
    w.addEventListener('scroll', sync)
    // Both screens are hung. The viewport may have been changed when you switch away and then switch back. If you only measure it once when mounting, the expired width will always be used.
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
