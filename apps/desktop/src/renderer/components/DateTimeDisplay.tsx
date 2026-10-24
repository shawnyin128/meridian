import type { ReactNode } from 'react'
import { localDayOf } from '../../shared/dates.js'
import { useFormat } from '../lib/format.js'
import { Tag } from './Tag.js'
import './DateTimeDisplay.css'

/** A date, or `children` such as a range or a time, as a neutral chip tag; `className` places it. */
export function DateChip({ date, children, className = '' }: {
  date?: string
  children?: ReactNode
  className?: string
}) {
  const fmt = useFormat()
  return (
    <Tag shape="chip" className={`date-chip${className ? ` ${className}` : ''}`}>
      {children ?? (date ? fmt.date(date) : '')}
    </Tag>
  )
}

/** The 28th of every month: with two-digit days, one of them gives the widest date label of a locale. */
const WIDEST_DAYS = Array.from({ length: 12 }, (_, month) => `2000-${String(month + 1).padStart(2, '0')}-28`)

/**
 * An item's date at the end of its card or row, before its row actions, worded by `label` (for example
 * "Updated Oct 24"). It is as wide as the widest date `label` words in the locale, its text starting at its
 * left, so the trailing dates of cards and rows start and end at one x; it never shrinks or clips.
 */
export function TrailingDate({ date, label }: { date: string; label: (date: string) => string }) {
  const fmt = useFormat()
  return (
    <span className="trailing-date" data-widest={WIDEST_DAYS.map((day) => label(fmt.date(day))).join('\n')}>
      {label(fmt.date(date))}
    </span>
  )
}

/**
 * The app-wide date and time pair. The date always comes first and the time after it; the caller
 * only decides whether to show the time. A timestamp `at` (ISO or epoch ms) shows its local day and
 * its local clock time.
 */
export function DateTimeDisplay(props: ({ start: string; end?: string; time?: ReactNode } | { at: string | number }) & {
  className?: string
  dateClassName?: string
  timeClassName?: string
}) {
  const { className = '', dateClassName = '', timeClassName = '' } = props
  const fmt = useFormat()
  const [start, end, time] = 'at' in props
    ? [localDayOf(new Date(props.at).toISOString()), undefined, fmt.clock(props.at)]
    : [props.start, props.end, props.time]
  return (
    <span className={`date-time-display${className ? ` ${className}` : ''}`}>
      <DateChip className={dateClassName}>{fmt.dateRange(start, end ?? start)}</DateChip>
      {time === undefined ? null : <DateChip className={timeClassName}>{time}</DateChip>}
    </span>
  )
}
