import type { ReactElement, ReactNode } from 'react'
import { DAY_SECTIONS, type DaySection } from '../../shared/vocabulary.js'
import { HeadingCount } from './HeadingCount.js'
import './DayHeading.css'

/**
 * The name `names` gives the relative-day section `day` names (a DAY_SECTIONS value Core files an
 * entry under), or `day` itself when it names none, as an entry stored under another heading does.
 */
export function daySectionName(day: string, names: Record<DaySection, string>): string {
  const section = (Object.keys(DAY_SECTIONS) as DaySection[]).find((key) => DAY_SECTIONS[key] === day)
  return section === undefined ? day : names[section]
}

/**
 * The line that opens one day's worth of a chronological list, a third-level heading. Callers pass the
 * already-formatted day.
 */
export function DayHeading({ children, count }: {
  children: ReactNode
  count?: number
}): ReactElement {
  return (
    <div className="day-heading" role="heading" aria-level={3}>
      {children}<HeadingCount count={count} />
    </div>
  )
}
