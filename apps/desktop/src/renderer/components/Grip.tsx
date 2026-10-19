import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import './Grip.css'

/** How far, in px, the pointer must move after a press before the press becomes a drag. */
const DEAD_ZONE = 3
/** One arrow-key step in px, and the step with Shift held. */
const STEP = 10
const SHIFT_STEP = 50

/** The sizes, in px, one drag or key step may give the pane. */
export type GripLimits = { min: number; max: number }

export type GripProps = GripLimits & {
  /** The separator's accessible name: what it resizes. */
  label: string
  /** The size of the pane now, in px, as the separator reports it with `min` and `max`. */
  value: number
  /**
   * Called with the pane's size when a drag or a key step begins, before its first `onResize`. It may
   * return the limits for this one resize, measured from the layout at its start, in place of `min`
   * and `max`.
   */
  onResizeStart?: (size: number) => GripLimits | void
  /** Called with each new size, clamped to the limits. */
  onResize: (size: number) => void
  /** Called with the final size once a drag is released or a key step lands; after Escape, with the size at the press. */
  onResizeEnd?: (size: number) => void
  /** Called on a double-click, to put the pane back to its default size. */
  onReset: () => void
  id?: string
  className?: string
  onMouseEnter?: (e: ReactMouseEvent<HTMLDivElement>) => void
  onMouseLeave?: () => void
}

/**
 * The one resize grip: a focusable vertical separator on the end edge of the pane it sizes, which
 * must be the grip's parent element. Dragging past a 3px dead zone resizes the pane from its laid-out
 * width at the press; a press that never leaves the dead zone does nothing. Escape during a drag puts
 * the size at the press back and ends the drag. The arrow keys step the size by 10px (50px with
 * Shift), Home and End go to the limits, and a double-click calls `onReset`.
 */
export function Grip({
  label, value, min, max, onResizeStart, onResize, onResizeEnd, onReset, id, className, onMouseEnter, onMouseLeave,
}: GripProps) {
  const [dragging, setDragging] = useState(false)
  // Ends the press in progress: removes its document listeners.
  const release = useRef<(() => void) | null>(null)
  const latest = useRef({ min, max, onResizeStart, onResize, onResizeEnd })
  latest.current = { min, max, onResizeStart, onResize, onResizeEnd }

  useEffect(() => () => release.current?.(), [])

  /** Calls `onResizeStart` and returns the limits the resize it begins keeps to. */
  const begin = (size: number): GripLimits => {
    const { min: low, max: high, onResizeStart: start } = latest.current
    return start?.(size) ?? { min: low, max: high }
  }
  const clamp = (size: number, limits: GripLimits) => Math.max(limits.min, Math.min(limits.max, size))
  const paneWidth = (grip: HTMLElement) => grip.parentElement!.getBoundingClientRect().width

  const press = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const x0 = e.clientX
    const start = paneWidth(e.currentTarget)
    let size = start
    // Null until the pointer leaves the dead zone and the press becomes a drag.
    let limits: GripLimits | null = null
    const finish = (to: number) => {
      release.current?.()
      latest.current.onResizeEnd?.(to)
    }
    const move = (event: MouseEvent) => {
      const dx = event.clientX - x0
      if (limits === null) {
        if (Math.abs(dx) <= DEAD_ZONE) return
        limits = begin(start)
        setDragging(true)
      }
      size = clamp(start + dx, limits)
      latest.current.onResize(size)
    }
    const up = () => {
      if (limits === null) { release.current?.(); return }
      // The click that follows the release would land on whatever is under the pointer, such as a sortable header.
      const swallow = (event: MouseEvent) => event.stopPropagation()
      window.addEventListener('click', swallow, { capture: true, once: true })
      window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
      finish(size)
    }
    // Capture, so this Escape is handled before the shell peels a dismissible layer with it.
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (limits === null) { release.current?.(); return }
      latest.current.onResize(start)
      finish(start)
    }
    release.current?.()
    release.current = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.removeEventListener('keydown', key, true)
      release.current = null
      setDragging(false)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
    document.addEventListener('keydown', key, true)
  }

  const step = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const by = e.shiftKey ? SHIFT_STEP : STEP
    const steps: Record<string, (start: number, limits: GripLimits) => number> = {
      ArrowLeft: (start) => start - by,
      ArrowRight: (start) => start + by,
      Home: (_, limits) => limits.min,
      End: (_, limits) => limits.max,
    }
    const to = steps[e.key]
    if (to === undefined) return
    e.preventDefault()
    const start = paneWidth(e.currentTarget)
    const limits = begin(start)
    const size = clamp(to(start, limits), limits)
    onResize(size)
    onResizeEnd?.(size)
  }

  return (
    <div
      role="separator" aria-orientation="vertical" aria-label={label} tabIndex={0}
      aria-valuenow={Math.round(value)} aria-valuemin={Math.round(min)} aria-valuemax={Math.round(max)}
      id={id} className={`grip${dragging ? ' is-dragging' : ''}${className ? ` ${className}` : ''}`}
      onMouseDown={press} onKeyDown={step} onDoubleClick={onReset}
      onClick={(e) => e.stopPropagation()} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
    />
  )
}

/**
 * What a collapsed pane leaves at its edge: a slim button showing the grip's glyph, which expands
 * the pane again.
 */
export function GripEdge({ label, onExpand }: { label: string; onExpand: () => void }) {
  return <button type="button" className="grip-edge" aria-label={label} aria-expanded={false} onClick={onExpand} />
}
