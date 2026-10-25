import { forwardRef, useCallback } from 'react'
import type { ReactNode, Ref } from 'react'
import { useScrollFade } from '../hooks/useScrollFade.js'
import './SplitPage.css'

/**
 * `rail`: a main column, then a rail or a side panel as wide as it is. `index`: a narrow index, then the
 * detail of what it picks.
 */
export type SplitColumns = 'rail' | 'index'

/**
 * The one page of two columns side by side, a master and its detail. It takes the height its page body
 * has left, and each column scrolls inside itself from the same top: a SplitColumn, a SplitRail or a
 * ListColumn fills its column, and a SidePanel or a card is as tall as its content up to the column's
 * height. `columns` sets their widths and the gap between them. `className` only names or places it.
 */
export function SplitPage({ columns, className, children }: {
  columns: SplitColumns
  className?: string
  children: ReactNode
}) {
  return <div className={`split-page split-page--${columns}${className ? ` ${className}` : ''}`}>{children}</div>
}

/** The element of a scroll column, attached to `ref` too and faded at an edge while content is hidden past it. */
function useColumn(ref: Ref<HTMLDivElement>) {
  const fade = useScrollFade('y')
  return useCallback((node: HTMLDivElement | null) => {
    fade(node)
    if (typeof ref === 'function') ref(node)
    else if (ref !== null) ref.current = node
  }, [fade, ref])
}

/** A column of a SplitPage that scrolls inside itself. `className` only names it. */
export const SplitColumn = forwardRef<HTMLDivElement, { className?: string; children: ReactNode }>(
  function SplitColumn({ className, children }, ref) {
    return <div ref={useColumn(ref)} className={`split-column${className ? ` ${className}` : ''}`}>{children}</div>
  },
)

/**
 * The rail of a SplitPage: properties, links and contents beside its main column, in small text after a
 * rule, scrolling inside itself. `className` only names it.
 */
export const SplitRail = forwardRef<HTMLDivElement, { className?: string; children: ReactNode }>(
  function SplitRail({ className, children }, ref) {
    return <div ref={useColumn(ref)} className={`split-rail${className ? ` ${className}` : ''}`} data-fade-paint="">{children}</div>
  },
)
