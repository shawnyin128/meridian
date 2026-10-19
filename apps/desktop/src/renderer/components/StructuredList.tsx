import { Children } from 'react'
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react'
import { useScrollFade } from '../hooks/useScrollFade.js'
import './StructuredList.css'

export const EMBEDDED_LIST_ROW_LIMIT = 5

type StructuredListStyle = CSSProperties & {
  '--structured-list-row-height'?: string
  '--structured-list-visible-rows'?: number
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
   * scrolling. `'all'` is for a list that is the page's own content and scrolls with the page.
   */
  maxVisibleRows?: number | 'all'
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style'> & {
  style?: StructuredListStyle
}) {
  const fade = useScrollFade('y')
  const rowLimit = maxVisibleRows === 'all'
    ? undefined
    : maxVisibleRows ?? (variant === 'embedded' ? EMBEDDED_LIST_ROW_LIMIT : undefined)
  const scrollable = rowLimit !== undefined && Children.toArray(children).length > rowLimit
  const variantClass = variant === 'embedded' ? ' structured-list--embedded' : ''
  const scrollClass = scrollable ? ' structured-list--scrollable' : ''
  const listStyle: StructuredListStyle | undefined = scrollable
    ? { ...style, '--structured-list-visible-rows': rowLimit }
    : style
  return (
    <div
      className={`structured-list${variantClass}${scrollClass}${className ? ` ${className}` : ''}`}
      style={listStyle} ref={scrollable ? fade : undefined} {...props}
    >
      {children}
    </div>
  )
}

/**
 * The one interactive shell for list rows. With `onActivate` it renders as a keyboard-accessible
 * button, otherwise as a static div; `columns` lets pages set the column widths, while borders,
 * hover, focus and row clicks are implemented only here.
 * A `composite` row holds controls of its own, so it stays a div that forwards pointer clicks to `onActivate`;
 * its children must include the keyboard-accessible control for the same action. A `selected` row is
 * the one whose detail is open beside the list.
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
      <div className={rowClass} style={rowStyle} onClick={onActivate} {...props as HTMLAttributes<HTMLDivElement>}>
        {children}
      </div>
    )
  }
  if (onActivate) {
    return (
      <button
        className={rowClass} style={rowStyle} type="button" onClick={onActivate}
        {...props as HTMLAttributes<HTMLButtonElement>}
      >{children}</button>
    )
  }
  return (
    <div ref={rowRef} className={rowClass} style={rowStyle} {...props as HTMLAttributes<HTMLDivElement>}>
      {children}
    </div>
  )
}
