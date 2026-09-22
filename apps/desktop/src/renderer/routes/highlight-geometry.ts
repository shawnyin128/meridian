import type { PaperHighlightRect } from '../../shared/contract.js'

type Rect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>

/**
 * Converts browser selection rectangles to page-relative coordinates and
 * clips selection fragments at the PDF page edge. The result survives zoom
 * because no CSS pixels cross the persistence boundary.
 */
export function normalizedHighlightRects(page: Rect, selected: Rect[]): PaperHighlightRect[] {
  if (page.width <= 0 || page.height <= 0) return []
  const clipped = selected.filter((rect) => rect.width > 0 && rect.height > 0).map((rect) => {
    const x = Math.min(1, Math.max(0, (rect.left - page.left) / page.width))
    const y = Math.min(1, Math.max(0, (rect.top - page.top) / page.height))
    return {
      x,
      y,
      width: Math.min(1 - x, rect.width / page.width),
      height: Math.min(1 - y, rect.height / page.height),
    }
  }).filter((rect) => rect.width > 0 && rect.height > 0)
  return mergedHighlightRects(clipped)
}

/** Merge normalized fragments of the same row; also used to accommodate previously saved duplicate rectangles. */
export function mergedHighlightRects(rects: PaperHighlightRect[]): PaperHighlightRect[] {
  const ordered = rects.map((rect) => ({ ...rect })).sort((a, b) => a.y - b.y || a.x - b.x)
  // pdf.js's TextLayer returns identical or partially overlapping DOMRects for nested spans. Drawing directly will result in the same
  // Rows overlap dark squares; here only adjacent/overlapping segments in the same visual row are merged, and distant text is not connected across columns.
  const merged: PaperHighlightRect[] = []
  for (const rect of ordered) {
    const rectRight = rect.x + rect.width
    const held = merged.findLast((candidate) => {
      const heldMiddle = candidate.y + candidate.height / 2
      const rectMiddle = rect.y + rect.height / 2
      const sameLine = Math.abs(heldMiddle - rectMiddle)
        <= Math.min(candidate.height, rect.height) * 0.55
      const heldRight = candidate.x + candidate.width
      const touching = rect.x <= heldRight + 0.005 && candidate.x <= rectRight + 0.005
      return sameLine && touching
    })
    if (held !== undefined) {
      const heldMiddle = held.y + held.height / 2
      const rectMiddle = rect.y + rect.height / 2
      const sameLine = Math.abs(heldMiddle - rectMiddle) <= Math.min(held.height, rect.height) * 0.55
      const heldRight = held.x + held.width
      const touching = rect.x <= heldRight + 0.005 && held.x <= rectRight + 0.005
      if (sameLine && touching) {
        const right = Math.max(heldRight, rectRight)
        const bottom = Math.max(held.y + held.height, rect.y + rect.height)
        held.x = Math.min(held.x, rect.x)
        held.y = Math.min(held.y, rect.y)
        held.width = right - held.x
        held.height = bottom - held.y
        continue
      }
    }
    merged.push({ ...rect })
  }
  return merged
}
