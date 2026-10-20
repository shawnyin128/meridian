import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, HTMLAttributes, MouseEvent as ReactMouseEvent, ReactNode, Ref } from 'react'
import { useScrollFade } from '../hooks/useScrollFade.js'
import { Toolbar } from './Toolbar.js'
import './StructuredList.css'

export const EMBEDDED_LIST_ROW_LIMIT = 5

/**
 * The rendered rows that belong to `list`, in document order: rows of a nested list and rows that
 * draw no box, such as those of a folded group, do not count.
 */
const ownRows = (list: HTMLElement) => [...list.querySelectorAll<HTMLElement>('.structured-row')]
  .filter((row) => row.closest('.structured-list') === list && row.getClientRects().length > 0)

/**
 * The height that shows exactly the first `limit` rendered rows of `list`, or null when the list
 * has no more rows than that.
 */
function measureCap(list: HTMLElement, limit: number): number | null {
  const rows = ownRows(list)
  if (rows.length <= limit) return null
  const top = list.getBoundingClientRect().top - list.scrollTop
  return Math.ceil(rows[limit - 1]!.getBoundingClientRect().bottom - top)
}

export function StructuredList({
  children, className = '', variant = 'card', maxVisibleRows, style, ...props
}: {
  children: ReactNode
  className?: string
  /** `embedded` draws no outline around the list, only dividers between adjacent rows. */
  variant?: 'card' | 'embedded'
  /**
   * Embedded lists show five rows by default, then keep the surrounding page stable with internal
   * scrolling; the cap is the height of the first five rows as rendered. `'all'` is for a list that
   * is the page's own content and scrolls with the page.
   */
  maxVisibleRows?: number | 'all'
  style?: CSSProperties
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style'>) {
  const fade = useScrollFade('y')
  const rowLimit = maxVisibleRows === 'all'
    ? undefined
    : maxVisibleRows ?? (variant === 'embedded' ? EMBEDDED_LIST_ROW_LIMIT : undefined)
  const list = useRef<HTMLDivElement | null>(null)
  const [cap, setCap] = useState<number | null>(null)
  const listRef = useCallback((node: HTMLDivElement | null) => {
    list.current = node
    fade(node)
  }, [fade])

  // Runs after every render: rows come and go with the children, and the observer follows the
  // rows' own size changes, such as text wrapping at a new window width.
  useLayoutEffect(() => {
    const node = list.current
    if (node === null || rowLimit === undefined) {
      setCap(null)
      return undefined
    }
    const measure = () => setCap(measureCap(node, rowLimit))
    measure()
    const rows = ownRows(node)
    if (rows.length <= rowLimit) return undefined
    const observer = new ResizeObserver(measure)
    for (const row of rows.slice(0, rowLimit)) observer.observe(row)
    return () => observer.disconnect()
  })

  const variantClass = variant === 'embedded' ? ' structured-list--embedded' : ''
  const scrollClass = cap === null ? '' : ' structured-list--scrollable'
  const listStyle = cap === null ? style : { ...style, maxHeight: cap }
  return (
    <div
      ref={listRef} className={`structured-list${variantClass}${scrollClass}${className ? ` ${className}` : ''}`}
      style={listStyle} {...props}
    >
      {children}
    </div>
  )
}

/**
 * Keeps the second press of a double-click on a row that opens something from selecting a word: the
 * row is a control, not prose. A first press, and so a drag, still selects; a field or an editor in
 * the row keeps its own selection.
 */
export function holdRepeatSelection(event: ReactMouseEvent) {
  if (event.detail < 2) return
  if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]') !== null) return
  event.preventDefault()
}

/**
 * The slot at a row's end for the actions on that row: neutral ghost glyphs (`IconButton`s, a
 * destructive one with `tone="danger"`, and `DotsMenu`) that show only while the row is hovered or
 * holds focus, or while one of their menus or dialogs is open. Any element marked `data-row-actions`
 * hosts the slot; `StructuredRow` and `ResearchObjectCard` mark themselves. The slot is a toolbar:
 * one Tab stop with the arrow keys between its actions, which join the row's own toolbar if it has one.
 */
export function RowActions({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Toolbar><span className={`row-actions${className ? ` ${className}` : ''}`}>{children}</span></Toolbar>
}

/**
 * The one interactive shell for list rows. With `onActivate` it renders as a keyboard-accessible
 * button, otherwise as a static div; `columns` lets pages set the column widths, while borders,
 * hover, focus and row clicks are implemented only here.
 * A `composite` row holds controls of its own, so it stays a div that forwards pointer clicks to `onActivate`;
 * its children must include the keyboard-accessible control for the same action. A `selected` row is
 * the one whose detail is open beside the list. A double-click on a row with `onActivate` selects no
 * text (`holdRepeatSelection`).
 */
export function StructuredRow({
  children, className = '', columns, composite = false, selected = false, onActivate, rowRef, style, ...props
}: {
  children: ReactNode
  className?: string
  columns?: string
  composite?: boolean
  selected?: boolean
  onActivate?: () => void
  /** DOM ref of a row without `onActivate`; a row with it, a button or a composite div, takes no ref. */
  rowRef?: Ref<HTMLDivElement>
  style?: CSSProperties
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className' | 'style' | 'onClick'>) {
  const rowStyle = columns ? { ...style, gridTemplateColumns: columns } : style
  const rowClass = `structured-row${composite ? ' structured-row--composite' : ''}${selected ? ' structured-row--selected' : ''}${className ? ` ${className}` : ''}`
  if (onActivate && composite) {
    return (
      <div
        className={rowClass} style={rowStyle} data-row-actions="" onClick={onActivate} onMouseDown={holdRepeatSelection}
        {...props as HTMLAttributes<HTMLDivElement>}
      >
        {children}
      </div>
    )
  }
  if (onActivate) {
    return (
      <button
        className={rowClass} style={rowStyle} type="button" onClick={onActivate} onMouseDown={holdRepeatSelection}
        {...props as HTMLAttributes<HTMLButtonElement>}
      >{children}</button>
    )
  }
  return (
    <div
      ref={rowRef} className={rowClass} style={rowStyle} data-row-actions=""
      {...props as HTMLAttributes<HTMLDivElement>}
    >
      {children}
    </div>
  )
}
