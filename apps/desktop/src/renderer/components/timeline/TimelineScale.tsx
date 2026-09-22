import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import type { Task, TaskWindow as PlannedWindow } from '../../../shared/contract.js'
import { D1, dnum, isoOf } from '../../../shared/dates.js'
import { createFormat, useFormat, type Format } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import { zh } from '../../messages/zh/index.js'
import type { Catalog } from '../../messages/catalog.js'

export type TimelineScale = 'day' | 'week' | 'month'

export const DEFAULT_TIMELINE_SCALE: TimelineScale = 'week'

const DAY_WIDTH: Record<TimelineScale, number> = { day: 840, week: 112, month: 34 }
export const DAY_SLOT_HOURS = 2

export type TimelineWindow = {
  w0: number
  w1: number
  days: number
  dayWidth: number
  label: string
}

/**
 * The day/week is a complete viewport cycle, and the grid width is divided equally with the available width; the month view retains a fixed day width and horizontal scrolling.
 */
export function fitTimelineWindow(
  window: TimelineWindow, scale: TimelineScale, viewportWidth: number,
): TimelineWindow {
  if (scale === 'month' || viewportWidth <= 0) return window
  return { ...window, dayWidth: viewportWidth / window.days }
}

/** The day/week grid is recalculated in real time when the viewport is widened, and the two project timelines are shared. */
export function useFittedTimelineWindow(
  viewport: RefObject<HTMLDivElement | null>, window: TimelineWindow, scale: TimelineScale,
): TimelineWindow {
  const [viewportWidth, setViewportWidth] = useState(0)
  useLayoutEffect(() => {
    const element = viewport.current
    if (element === null) return
    const sync = () => setViewportWidth(element.clientWidth)
    sync()
    const resize = new ResizeObserver(sync)
    resize.observe(element)
    return () => resize.disconnect()
  }, [viewport])
  return fitTimelineWindow(window, scale, viewportWidth)
}

/**
 * The exact calendar period containing `anchor`: one day, Monday–Sunday, or
 * the first through last day of a month. Week is the product default.
 * `fmt`/`m` default to Chinese so existing callers that predate the language switch keep working.
 */
export function timelineWindow(
  anchor: string, scale: TimelineScale = DEFAULT_TIMELINE_SCALE,
  fmt: Format = createFormat('zh'), m: Catalog = zh,
): TimelineWindow {
  const day = dnum(anchor)
  const date = new Date(day * D1)
  let w0 = day
  let w1 = day
  if (scale === 'week') {
    w0 = day - (date.getUTCDay() + 6) % 7
    w1 = w0 + 6
  } else if (scale === 'month') {
    w0 = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / D1
    w1 = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / D1 - 1
  }
  const label = scale === 'month'
    ? fmt.monthYear(isoOf(w0))
    : scale === 'day'
      ? m.timeline.dayHeading(fmt.fullDate(anchor), fmt.weekdayShort(date.getUTCDay()))
      : fmt.fullDateRange(isoOf(w0), isoOf(w1))
  return { w0, w1, days: w1 - w0 + 1, dayWidth: DAY_WIDTH[scale], label }
}

/** Moves to the previous or next complete period at the selected granularity. */
export function shiftTimelineAnchor(anchor: string, scale: TimelineScale, direction: -1 | 1): string {
  const day = dnum(anchor)
  if (scale === 'day') return isoOf(day + direction)
  if (scale === 'week') return isoOf(day + direction * 7)
  const date = new Date(day * D1)
  return isoOf(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + direction, 1) / D1)
}

/** Shared navigation state: every timeline opens by week and Today always returns to today's day view. */
export function useTimelinePeriod(today: string) {
  const fmt = useFormat()
  const m = useMessages()
  const [scale, setScale] = useState<TimelineScale>(DEFAULT_TIMELINE_SCALE)
  const [anchor, setAnchor] = useState(today)
  const step = useCallback((direction: -1 | 1) => {
    setAnchor((held) => shiftTimelineAnchor(held, scale, direction))
  }, [scale])
  const goToday = useCallback(() => {
    setScale('day')
    setAnchor(today)
  }, [today])
  return { anchor, scale, setScale, step, goToday, window: timelineWindow(anchor, scale, fmt, m) }
}

/** Converts a pointer coordinate on a timeline canvas back to its exact day. */
export function timelineDayAt(
  canvas: HTMLElement, clientX: number, window: Pick<TimelineWindow, 'w0' | 'w1' | 'dayWidth'>,
): string {
  const offset = Math.max(0, clientX - canvas.getBoundingClientRect().left)
  return isoOf(Math.min(window.w1, window.w0 + Math.floor(offset / window.dayWidth)))
}

const minutesOf = (time: string): number => Number(time.slice(0, 2)) * 60

/** A task's visible horizontal interval. A timed task uses its precise first/last-day window in day view. */
export function timelineTaskSpan(
  task: Pick<Task, 'start' | 'end' | 'window'>,
  window: TimelineWindow,
  scale: TimelineScale,
): { left: number; right: number } | null {
  const startDay = dnum(task.start)
  const endDay = dnum(task.end)
  if (endDay < window.w0 || startDay > window.w1) return null
  if (scale !== 'day') {
    return {
      left: (Math.max(startDay, window.w0) - window.w0) * window.dayWidth,
      right: (Math.min(endDay, window.w1) - window.w0 + 1) * window.dayWidth,
    }
  }
  const day = window.w0
  const from = task.window && startDay === day ? minutesOf(task.window.start) : 0
  const to = task.window && endDay === day ? minutesOf(task.window.end) : 24 * 60
  return {
    left: from / (24 * 60) * window.dayWidth,
    right: to / (24 * 60) * window.dayWidth,
  }
}

/** Move a timed task by whole two-hour slots while preserving its duration, including across midnight. */
export function shiftTaskWindow(
  task: Pick<Task, 'start' | 'end'> & { window: PlannedWindow }, slots: number,
): Pick<Task, 'start' | 'end' | 'window'> {
  const slotsPerDay = 24 / DAY_SLOT_HOURS
  const startSlot = dnum(task.start) * slotsPerDay + minutesOf(task.window.start) / 60 / DAY_SLOT_HOURS
  const endSlot = dnum(task.end) * slotsPerDay + minutesOf(task.window.end) / 60 / DAY_SLOT_HOURS
  const movedStart = startSlot + slots
  const movedEnd = endSlot + slots
  const startDay = Math.floor(movedStart / slotsPerDay)
  // An end exactly at midnight belongs to the preceding task day as 24:00.
  const endDay = Math.floor((movedEnd - 1) / slotsPerDay)
  const startHour = ((movedStart % slotsPerDay) + slotsPerDay) % slotsPerDay * DAY_SLOT_HOURS
  const endIndex = ((movedEnd - 1) % slotsPerDay + slotsPerDay) % slotsPerDay + 1
  return {
    start: isoOf(startDay),
    end: isoOf(endDay),
    window: {
      start: `${String(startHour).padStart(2, '0')}:00` as PlannedWindow['start'],
      end: `${String(endIndex * DAY_SLOT_HOURS).padStart(2, '0')}:00` as PlannedWindow['end'],
    },
  }
}

const SCALES: TimelineScale[] = ['day', 'week', 'month']

export function TimelineScalePicker({ value, onChange }: {
  value: TimelineScale
  onChange: (scale: TimelineScale) => void
}) {
  const m = useMessages()
  return (
    <div className="gscale" role="group" aria-label={m.timeline.scaleGroup}>
      {SCALES.map((scale) => (
        <button
          type="button" className={value === scale ? 'on' : ''} aria-pressed={value === scale}
          key={scale} onClick={() => onChange(scale)}
        >{m.timeline.scale[scale]}</button>
      ))}
    </div>
  )
}

export function TimelineControls({ scale, onScaleChange, onStep, onToday }: {
  scale: TimelineScale
  onScaleChange: (scale: TimelineScale) => void
  onStep: (direction: -1 | 1) => void
  onToday: () => void
}) {
  const m = useMessages()
  return (
    <>
      <div className="gperiodnav">
        <button
          type="button" title={m.timeline.prevPeriod} aria-label={m.timeline.prevPeriod}
          onClick={() => onStep(-1)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3-5 5 5 5" /></svg>
        </button>
        <button
          type="button" title={m.timeline.nextPeriod} aria-label={m.timeline.nextPeriod}
          onClick={() => onStep(1)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        </button>
      </div>
      <TimelineScalePicker value={scale} onChange={onScaleChange} />
      <button type="button" className="btn plain" onClick={onToday}>{m.timeline.today}</button>
    </>
  )
}

const DAY_PARTS = [...Array(24 / DAY_SLOT_HOURS)].map((_, index) =>
  `${String(index * DAY_SLOT_HOURS).padStart(2, '0')}:00`)

/** Exact marker position: by minute in day view, by the center of today's cell otherwise. */
export function timelineNowLeft(
  window: TimelineWindow, scale: TimelineScale, today: number, minuteOfDay: number,
): number | null {
  if (today < window.w0 || today > window.w1) return null
  if (scale === 'day') return Math.max(0, Math.min(24 * 60, minuteOfDay)) / (24 * 60) * window.dayWidth
  return (today - window.w0) * window.dayWidth + window.dayWidth / 2
}

/** The live line stays minute-accurate, while its label names only the containing two-hour slot. */
export function timelineNowLabel(minuteOfDay: number): string {
  const hour = Math.floor(Math.max(0, Math.min(24 * 60 - 1, minuteOfDay)) / 60 / DAY_SLOT_HOURS)
    * DAY_SLOT_HOURS
  return `${String(hour).padStart(2, '0')}:00`
}

/** The single two-hour planning slot containing the supplied minute. */
export function timelineSlotWindow(minuteOfDay: number): PlannedWindow {
  const start = timelineNowLabel(minuteOfDay)
  const endHour = Number(start.slice(0, 2)) + DAY_SLOT_HOURS
  return { start: start as PlannedWindow['start'], end: `${String(endHour).padStart(2, '0')}:00` as PlannedWindow['end'] }
}

/** The live clock mark shared by both timelines; it refreshes once per minute. */
export function TimelineNowMarker({ window, scale, today }: {
  window: TimelineWindow
  scale: TimelineScale
  today: number
}) {
  const m = useMessages()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(new Date()), 60_000)
    return () => globalThis.clearInterval(timer)
  }, [])
  const minutes = now.getHours() * 60 + now.getMinutes()
  const left = timelineNowLeft(window, scale, today, minutes)
  if (left === null) return null
  if (scale !== 'day') return <div className="gtoday" style={{ left }} />
  return <div className="gnow" style={{ left }} aria-label={m.timeline.currentTime} />
}

/** Time-of-day or calendar-day heading shared by every Gantt timeline. */
export function TimelineGrid({ window, scale, today }: {
  window: TimelineWindow
  scale: TimelineScale
  today: number
}) {
  const fmt = useFormat()
  const m = useMessages()
  const days = [...Array(window.days)].map((_, index) => window.w0 + index)
  return (
    <>
      {scale === 'day' ? null : days.map((day, index) => {
        const weekday = new Date(day * D1).getUTCDay()
        return weekday === 0 || weekday === 6
          ? (
            <div
              className="gstripe" key={day}
              style={{ left: index * window.dayWidth, width: window.dayWidth }}
            />
          )
          : null
      })}
      {scale === 'day' ? null : days.map((day, index) => (
        <div
          className={index === 0 ? 'gdatecell first' : 'gdatecell'} aria-hidden="true" key={`cell-${day}`}
          style={{ left: index * window.dayWidth, width: window.dayWidth }}
        />
      ))}
      {scale === 'day'
        ? DAY_PARTS.map((part, index) => (
          <div
            className={index % 2 === 0 ? 'gtimecell' : 'gtimecell alt'} aria-hidden="true"
            key={`cell-${part}`}
            style={{ left: index * window.dayWidth / DAY_PARTS.length, width: window.dayWidth / DAY_PARTS.length }}
          />
        ))
        : null}
      {scale === 'day'
        ? (
          <div className="gdays times">
            {DAY_PARTS.map((part) => (
              <div
                className="gtime" key={part}
                style={{ flexBasis: window.dayWidth / DAY_PARTS.length }}
              >{part}</div>
            ))}
          </div>
        )
        : (
          <div className="gdays">
            {days.map((day) => {
              const date = new Date(day * D1)
              return (
                <div
                  className={`${day === today ? 'gday today' : 'gday'} ${scale}`}
                  key={day} style={{ flexBasis: window.dayWidth }}
                  title={`${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`}
                >
                  <span>
                    {scale === 'week'
                      ? m.timeline.weekdayCell(fmt.weekdayShort(date.getUTCDay()), date.getUTCDate())
                      : date.getUTCDate()}
                  </span>
                </div>
              )
            })}
          </div>
        )}
    </>
  )
}
