import { useId, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { DAY_SECTIONS, type DaySection } from '../../shared/vocabulary.js'
import { SectionHeading } from './PageShell.js'
import './GroupedList.css'

/**
 * The name `names` gives the relative-day section `day` names (a DAY_SECTIONS value Core files an
 * entry under), or `day` itself when it names none, as an entry stored under another heading does.
 */
export function daySectionName(day: string, names: Record<DaySection, string>): string {
  const section = (Object.keys(DAY_SECTIONS) as DaySection[]).find((key) => DAY_SECTIONS[key] === day)
  return section === undefined ? day : names[section]
}

/**
 * A list of items in groups, by status, kind, day, source, project or archive: its children are the
 * `Group`s, and the first group's heading sits flush with the list's top. The list draws no box of
 * its own, so the headings and items of its groups lay out in the grid, column or stream around it.
 */
export function GroupedList({ children }: { children: ReactNode }): ReactElement {
  return <div className="grouped-list">{children}</div>
}

/**
 * One group of a `GroupedList`: its heading at the group level, with `count` after the title and
 * `actions` at its end, then `children`, the group's items, with no wrapper of their own. `className`
 * places the heading. With `fold`, the heading's title folds the items away and back, a closing
 * group folds at once and one opened from its heading grows to its height, while one that renders
 * open or that its owner opens shows in full at once; `sticky` then pins the heading while the
 * items scroll under it. The `data-*` attributes go on the group's heading, or on its section when
 * it folds.
 */
export function Group({ title, count, meta, actions, fold, sticky = false, className, children, ...data }: {
  title: ReactNode
  count?: number | undefined
  meta?: ReactNode
  actions?: ReactNode
  fold?: { open: boolean; onToggle: () => void } | undefined
  sticky?: boolean
  className?: string
  children: ReactNode
} & { [key: `data-${string}`]: string }): ReactElement {
  const [opening, setOpening] = useState(false)
  const bodyId = useId()
  if (fold === undefined) {
    return (
      <>
        <SectionHeading level="group" count={count} meta={meta} actions={actions} className={className} {...data}>
          {title}
        </SectionHeading>
        {children}
      </>
    )
  }
  const classes = ['collapsible-group', sticky ? 'collapsible-group--sticky' : '', fold.open ? '' : 'is-closed'].filter(Boolean).join(' ')
  return (
    <section className={classes} {...data}>
      <SectionHeading
        level="group" count={count} meta={meta} actions={actions}
        className={className === undefined ? 'collapsible-group-head' : `collapsible-group-head ${className}`}
        fold={{ open: fold.open, controls: bodyId, onToggle: () => { setOpening(!fold.open); fold.onToggle() } }}
      ><span className="collapsible-group-title">{title}</span>
      </SectionHeading>
      {fold.open ? (
        <div className={opening ? 'collapsible-group-body is-opening' : 'collapsible-group-body'} id={bodyId}>
          <div className="collapsible-group-content">{children}</div>
        </div>
      ) : null}
    </section>
  )
}
