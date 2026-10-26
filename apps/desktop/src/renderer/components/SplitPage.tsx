import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { ScrollArea } from './ScrollArea.js'
import './SplitPage.css'

/**
 * `rail`: a main column, then a rail or a side panel as wide as it is. `index`: a narrow index, then the
 * detail of what it picks. `dialog`: a dialog's navigation, then the main column of what it picks.
 */
export type SplitColumns = 'rail' | 'index' | 'dialog'

/**
 * The one page of two columns side by side, a master and its detail. It takes the height its page body
 * or dialog has left, and each column scrolls inside itself from the same top: a SplitColumn, a
 * SplitRail, a SplitNav, a SplitMain or a ListColumn fills its column, and a SidePanel or a card is as
 * tall as its content up to the column's height. `columns` sets their widths and the gap between them.
 * `className` only names or places it.
 */
export function SplitPage({ columns, className, children }: {
  columns: SplitColumns
  className?: string
  children: ReactNode
}) {
  return <div className={`split-page split-page--${columns}${className ? ` ${className}` : ''}`}>{children}</div>
}

const named = (base: string, className: string | undefined) => `${base}${className ? ` ${className}` : ''}`

/** A column of a SplitPage that scrolls inside itself. `className` only names it. */
export const SplitColumn = forwardRef<HTMLDivElement, { className?: string; children: ReactNode }>(
  function SplitColumn({ className, children }, ref) {
    return <ScrollArea axis="y" ref={ref} className={named('split-column', className)}>{children}</ScrollArea>
  },
)

/**
 * The rail of a SplitPage: properties, links and contents beside its main column, in small text after a
 * rule, scrolling inside itself. `className` only names it.
 */
export const SplitRail = forwardRef<HTMLDivElement, { className?: string; children: ReactNode }>(
  function SplitRail({ className, children }, ref) {
    return <ScrollArea axis="y" paint ref={ref} className={named('split-rail', className)}>{children}</ScrollArea>
  },
)

/**
 * The navigation of a dialog's SplitPage, on the sidebar's ground before a rule: `head`, such as the
 * dialog's title and a back button, then the rows, scrolling inside it.
 */
export function SplitNav({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <ScrollArea axis="y" paint className="split-nav">
      <div className="split-nav-head">{head}</div>
      {children}
    </ScrollArea>
  )
}

/**
 * The main column of a dialog's SplitPage: `head`, which stays at its top, and the content under it, which
 * scrolls. A head is a heading, which spaces itself from the content, or, with `fields`, the fields of what
 * the column edits, which stand the item gap above it. With `fill` the content instead fills the column's
 * height without scrolling, a column whose own parts, such as a List that fills, scroll inside it.
 */
export function SplitMain({ head, fields = false, fill = false, children }: {
  head: ReactNode
  fields?: boolean
  fill?: boolean
  children: ReactNode
}) {
  return (
    <div className="split-main">
      <div className={fields ? 'split-main-head split-main-head--fields' : 'split-main-head'}>{head}</div>
      {fill
        ? <div className="split-main-body split-main-body--fill">{children}</div>
        : <ScrollArea axis="y" fill className="split-main-body">{children}</ScrollArea>}
    </div>
  )
}
