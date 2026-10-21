import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

/** Where the text on the last line `box` shows whole ends, in px from the box's left edge. */
function lastLineEnd(box: HTMLElement): number {
  const frame = box.getBoundingClientRect()
  const range = document.createRange()
  range.selectNodeContents(box)
  const shown = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.bottom <= frame.bottom + 1)
  if (shown.length === 0) return frame.width
  const top = Math.max(...shown.map((rect) => rect.top))
  return Math.max(...shown.filter((rect) => rect.top >= top - 1).map((rect) => rect.right - frame.left))
}

/**
 * Whether the text in `box` is cut off by it: wider or taller than the box. Measured when `content`
 * changes and whenever the box changes size. With `lines`, a box of several lines that cuts its text
 * off also gets `--line-end`, where the text on its last whole line ends, so its fade can end there
 * rather than at the box's edge.
 */
export function useClipped(box: RefObject<HTMLElement | null>, content: unknown, lines = false): boolean {
  const [clipped, setClipped] = useState(false)
  useLayoutEffect(() => {
    const element = box.current
    if (element === null) return
    const measure = () => {
      const cut = element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
      if (lines && cut) element.style.setProperty('--line-end', `${lastLineEnd(element)}px`)
      else if (lines) element.style.removeProperty('--line-end')
      setClipped(cut)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [box, content, lines])
  return clipped
}
