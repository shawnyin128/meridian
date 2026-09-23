import { Children } from 'react'
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react'
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
  /** `embedded` does not draw the container outline, but only draws dividing lines between adjacent lines. */
  variant?: 'card' | 'embedded'
  /**
   * Embedded lists show five rows by default, then keep the surrounding page stable with internal
   * scrolling. `'all'` is for a list that is the page's own content and scrolls with the page.
   */
  maxVisibleRows?: number | 'all'
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style'> & {
  style?: StructuredListStyle
}) {
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
      style={listStyle} {...props}
    >
      {children}
    </div>
  )
}

/**
 * The only interactive shell for list rows. When passed to `onActivate`, it is rendered as a keyboard-accessible button, otherwise it is a static div;
 * `columns` allows business pages to define column widths, while borders, hover, focus and row-level clicks are only implemented once.
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
  /** DOM reference of static/composite rows; clickable rows are rendered as buttons by the component itself and do not receive div references. */
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
