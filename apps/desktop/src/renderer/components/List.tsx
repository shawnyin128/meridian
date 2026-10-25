import { useCallback, useRef } from 'react'
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { useRowCap } from '../hooks/useRowCap.js'
import { useScrollFade } from '../hooks/useScrollFade.js'
import './List.css'

export const EMBEDDED_LIST_ROW_LIMIT = 5

/**
 * The rendered items that belong to `list`, in document order: items of a nested list and items that
 * draw no box, such as those of a folded group, do not count.
 */
const ownItems = (list: HTMLElement) => [...list.querySelectorAll<HTMLElement>('.item')]
  .filter((item) => item.closest('.list') === list && item.getClientRects().length > 0)

/**
 * The one container of `Item`s: its outline or the dividers between its rows, the grid of its cards,
 * and how many rows it shows before it scrolls inside itself.
 */
export function List({
  children, className = '', variant = 'card', rows, grid = false, nested = false, flush = false, style, ...props
}: {
  children: ReactNode
  className?: string
  /** `card` outlines the list; `embedded` draws no outline, only dividers between adjacent rows. */
  variant?: 'card' | 'embedded'
  /**
   * Embedded lists show five rows by default, then keep the surrounding page stable with internal
   * scrolling; the cap is the height of the first five rows as rendered. `'all'` is for a list that
   * is the page's own content and scrolls with the page. `'fill'` is for a list that takes the rest of
   * its flex container's height: it keeps its own height while its rows fit and scrolls inside once
   * they do not.
   */
  rows?: number | 'all' | 'fill'
  /** Lays the list's cards out in columns of the card width instead of one under another. */
  grid?: boolean
  /** The list lies in another surface's content, a card's body or a message box: its rows start at that content's edge. */
  nested?: boolean
  /** The list lies in a surface that clips at its edges, so it keeps no ring room of its own there. */
  flush?: boolean
  style?: CSSProperties
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style'>) {
  const fade = useScrollFade('y')
  const rowLimit = rows === 'all' || rows === 'fill'
    ? undefined
    : rows ?? (variant === 'embedded' ? EMBEDDED_LIST_ROW_LIMIT : undefined)
  const list = useRef<HTMLDivElement | null>(null)
  const cap = useRowCap(list, ownItems, rowLimit)
  const listRef = useCallback((node: HTMLDivElement | null) => {
    list.current = node
    fade(node)
  }, [fade])

  const variantClass = `${variant === 'embedded' ? ' list--embedded' : ''}${grid ? ' list--grid' : ''}${nested ? ' list--nested' : ''}`
  const scrollClass = `${rows === 'fill' ? ' list--fill' : cap === null ? '' : ' list--scrollable'}${flush ? ' list--flush' : ''}`
  const listStyle = cap === null ? style : { ...style, maxHeight: cap }
  return (
    <div
      ref={listRef} className={`list${variantClass}${scrollClass}${className ? ` ${className}` : ''}`}
      style={listStyle} {...props}
    >
      {children}
    </div>
  )
}

/**
 * A column of lists that takes the height its container gives it and scrolls them together once they
 * do not fit, fading at the edges it clips. It keeps the focus-ring room inside its edges and reaches
 * out by as much, so its lists sit where they would without it.
 */
export function ListColumn({ children, className = '' }: { children: ReactNode; className?: string }) {
  const fade = useScrollFade<HTMLDivElement>('y')
  return <div ref={fade} className={`list-column${className ? ` ${className}` : ''}`}>{children}</div>
}
