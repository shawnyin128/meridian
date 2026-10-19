import type { ReactNode } from 'react'
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
 * only decides whether to show the time.
 */
export function DateTimeDisplay({
  start, end = start, time, className = '', dateClassName = '', timeClassName = '',
}: {
  start: string
  end?: string
  time?: ReactNode
  className?: string
  dateClassName?: string
  timeClassName?: string
}) {
  const fmt = useFormat()
  return (
    <span className={`date-time-display${className ? ` ${className}` : ''}`}>
      <DateChip className={dateClassName}>{fmt.dateRange(start, end)}</DateChip>
      {time === undefined ? null : <DateChip className={timeClassName}>{time}</DateChip>}
    </span>
  )
}
