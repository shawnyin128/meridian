import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * The height that shows exactly the first `limit` of `rows`, measured from the top edge of their
 * scroll box `box`, or null when there are no more rows than that.
 */
function measureCap(box: HTMLElement, rows: readonly HTMLElement[], limit: number): number | null {
  if (rows.length <= limit) return null
  const top = box.getBoundingClientRect().top - box.scrollTop
  return Math.ceil(rows[limit - 1]!.getBoundingClientRect().bottom - top)
}

/**
 * The max height of the scroll box `box` that shows its first `limit` rendered rows, as `rowsOf`
 * finds them, and everything above them in the box; null while `limit` is undefined or the box holds
 * no more rows than that. It is measured after every render and whenever one of those rows changes size.
 */
export function useRowCap(
  box: RefObject<HTMLElement | null>, rowsOf: (box: HTMLElement) => HTMLElement[], limit: number | undefined,
): number | null {
  const [cap, setCap] = useState<number | null>(null)
  // Runs after every render: rows come and go with the children, and the observer follows the
  // rows' own size changes, such as text wrapping at a new window width.
  useLayoutEffect(() => {
    const node = box.current
    if (node === null || limit === undefined) {
      setCap(null)
      return undefined
    }
    const measure = () => setCap(measureCap(node, rowsOf(node), limit))
    measure()
    const rows = rowsOf(node)
    if (rows.length <= limit) return undefined
    const observer = new ResizeObserver(measure)
    for (const row of rows.slice(0, limit)) observer.observe(row)
    return () => observer.disconnect()
  })
  return cap
}
