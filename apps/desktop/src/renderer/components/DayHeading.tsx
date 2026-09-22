import type { ReactElement, ReactNode } from 'react'
import './DayHeading.css'

/** The line that opens one day's worth of a chronological list. Callers pass the already-formatted day. */
export function DayHeading({ children, count }: {
  children: ReactNode
  count?: number
}): ReactElement {
  return (
    <div className="day-heading">
      {children}{count === undefined ? null : <span className="day-heading-count"> · {count}</span>}
    </div>
  )
}
