import { useCallback, useLayoutEffect, useRef } from 'react'
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { scrollParent, useNearEnd } from '../hooks/useListPaging.js'
import { useNeighbourFocus } from '../hooks/useNeighbourFocus.js'
import { useRowCap } from '../hooks/useRowCap.js'
import { useScrollFade } from '../hooks/useScrollFade.js'
import './List.css'

export const EMBEDDED_LIST_ROW_LIMIT = 5

/** The items that belong to `list`, in document order, without those of a nested list. */
const listItems = (list: HTMLElement) => [...list.querySelectorAll<HTMLElement>('.item')]
  .filter((item) => item.closest('.list') === list)

/** The rendered items that belong to `list`: those that draw no box, such as those of a folded group, do not count. */
const ownItems = (list: HTMLElement) => listItems(list).filter((item) => item.getClientRects().length > 0)

/**
 * How many of `list`'s items fit the room the area that scrolls it shows from the list's top down,
 * with that area scrolled to its top, or its whole visible height when less than half of it is left
 * there: as many rows of the measured item height as fit, times the grid's columns. Null while the
 * list holds no items or lies on a hidden screen.
 */
function fitCount(list: HTMLElement): number | null {
  const items = ownItems(list)
  const area = scrollParent(list.parentElement)
  if (items.length === 0 || area === null || area.clientHeight === 0) return null
  const areaStyle = getComputedStyle(area)
  const padTop = parseFloat(areaStyle.paddingTop)
  const visible = area.clientHeight - padTop - parseFloat(areaStyle.paddingBottom)
  const top = list.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop - padTop
  const room = visible - top >= visible / 2 ? visible - top : visible
  const listStyle = getComputedStyle(list)
  const columns = listStyle.display === 'grid' ? listStyle.gridTemplateColumns.split(' ').length : 1
  const gap = listStyle.display === 'grid' ? parseFloat(listStyle.rowGap) || 0 : 0
  const height = Math.max(...items.slice(0, columns + 1).map((item) => item.getBoundingClientRect().height))
  return Math.max(1, Math.floor((room + gap) / (height + gap))) * columns
}

/**
 * The one container of `Item`s: its outline or the dividers between its rows, the grid of its cards,
 * and how many rows it shows before it scrolls inside itself. When the item that holds the keyboard
 * focus goes away, a neighbouring item takes it (useNeighbourFocus). A list of `rows="all"` with
 * `onFit` reports, after every render and whenever it or the area that scrolls it changes size, how
 * many items fill the room that area shows (fitCount); with `onEnd` it calls that whenever its last
 * item comes within one screen of that area's visible end.
 */
export function List({
  children, className = '', variant = 'card', rows, grid = false, nested = false, flush = false, style, onFit, onEnd, ...props
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
  onFit?: ((items: number) => void) | undefined
  onEnd?: (() => void) | undefined
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style'>) {
  const fade = useScrollFade('y')
  const rowLimit = rows === 'all' || rows === 'fill'
    ? undefined
    : rows ?? (variant === 'embedded' ? EMBEDDED_LIST_ROW_LIMIT : undefined)
  const list = useRef<HTMLDivElement | null>(null)
  const cap = useRowCap(list, ownItems, rowLimit)
  const keepFocus = useNeighbourFocus(listItems)
  useNearEnd(list, ownItems, onEnd)
  const fit = useRef(onFit)
  fit.current = onFit
  const fits = onFit !== undefined
  useLayoutEffect(() => {
    const node = list.current
    if (!fits || node === null) return undefined
    const measure = () => {
      const count = fitCount(node)
      if (count !== null) fit.current?.(count)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    const area = scrollParent(node.parentElement)
    if (area !== null) observer.observe(area)
    return () => observer.disconnect()
  })
  const listRef = useCallback((node: HTMLDivElement | null) => {
    list.current = node
    fade(node)
    keepFocus(node)
  }, [fade, keepFocus])

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
