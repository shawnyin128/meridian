import { useEffect, useRef } from 'react'

/** How long, in ms, a landed target flashes: the two pulses of `[data-arrived]` in tokens.css, each `--t-flash` long. */
export const ARRIVAL_FLASH_MS = 1000

const flashing = new WeakMap<Element, number>()

/**
 * Lands on `target`, a row or an anchor a jump points at: scrolls it into view by `block` and flashes
 * it, marking it `data-arrived` for ARRIVAL_FLASH_MS. Landing on it again while it flashes starts the
 * flash over.
 */
export function land(target: Element, block: ScrollLogicalPosition = 'nearest'): void {
  target.scrollIntoView({ block })
  window.clearTimeout(flashing.get(target))
  // Taking the mark off and reading the layout before marking it again restarts its animation.
  target.removeAttribute('data-arrived')
  target.getBoundingClientRect()
  target.setAttribute('data-arrived', '')
  flashing.set(target, window.setTimeout(() => {
    target.removeAttribute('data-arrived')
    flashing.delete(target)
  }, ARRIVAL_FLASH_MS))
}

/**
 * Lands (see `land`) on the target of `arrival`, a jump, once the screen is `ready` to show it: `find`
 * returns its element then, and `onLanded` is called. Each `arrival`, by identity, lands once; one
 * whose target is not on the page by then lands nowhere. After `arrival` is null, the same value lands
 * again.
 */
export function useArrival<T>(
  arrival: T | null | undefined,
  ready: boolean,
  find: (arrival: T) => Element | null | undefined,
  { block = 'nearest', onLanded }: { block?: ScrollLogicalPosition; onLanded?: () => void } = {},
): void {
  const landed = useRef<T | null>(null)
  // Runs after every render: a target shows once its screen has rendered it, which no dependency names.
  useEffect(() => {
    if (arrival === null || arrival === undefined) {
      landed.current = null
      return
    }
    if (!ready || landed.current === arrival) return
    landed.current = arrival
    const target = find(arrival)
    if (target !== null && target !== undefined) land(target, block)
    onLanded?.()
  })
}
