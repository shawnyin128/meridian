import type { ReactNode } from 'react'
import { useFormat } from '../lib/format.js'
import './DateTimeDisplay.css'

export function DateChip({ date, children, className = '' }: {
  date?: string
  children?: ReactNode
  className?: string
}) {
  const fmt = useFormat()
  return (
    <span className={`date-chip${className ? ` ${className}` : ''}`}>
      {children ?? (date ? fmt.date(date) : '')}
    </span>
  )
}

/**
 * Unified date/hour combination across applications. The date always comes first and the hour comes last; the caller only decides whether to display the hour.
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
