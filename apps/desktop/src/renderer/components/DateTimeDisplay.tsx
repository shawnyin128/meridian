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
