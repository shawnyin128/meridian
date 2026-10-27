/** How long an area's scrollbars stay shown after it last scrolled, in ms. */
export const SCROLLBAR_IDLE_MS = 1000

/** Whether the point (`x`, `y`) in client coordinates lies on a scrollbar `element` draws for content it hides. */
function onScrollbar(element: Element, x: number, y: number): boolean {
  const box = element.getBoundingClientRect()
  const vertical = element.scrollHeight > element.clientHeight && x - box.left >= element.clientLeft + element.clientWidth
  const horizontal = element.scrollWidth > element.clientWidth && y - box.top >= element.clientTop + element.clientHeight
  return (vertical || horizontal) && x < box.right && y < box.bottom
}

/**
 * Shows each area's scrollbars only while they are in use, for every scroll container in `root`: a
 * scroll marks the scrolled element `data-scrolling`, which tokens.css draws the thumb on, and the mark
 * goes once the element has not scrolled for SCROLLBAR_IDLE_MS. The pointer over a scrollbar of an area
 * that can scroll shows it too, and that or a press held on it keeps the mark until it ends and the
 * delay has passed. Returns a function that stops watching.
 */
export function initializeScrollbars(root: Document = document): () => void {
  const timers = new Map<Element, ReturnType<typeof setTimeout>>()
  let hovered: Element | null = null
  let held: Element | null = null

  const show = (element: Element) => {
    clearTimeout(timers.get(element))
    timers.delete(element)
    element.setAttribute('data-scrolling', '')
  }
  const hideLater = (element: Element) => {
    clearTimeout(timers.get(element))
    timers.set(element, setTimeout(() => {
      timers.delete(element)
      if (element !== hovered && element !== held) element.removeAttribute('data-scrolling')
    }, SCROLLBAR_IDLE_MS))
  }
  const hover = (element: Element | null) => {
    if (element === hovered) return
    const left = hovered
    hovered = element
    if (element !== null) show(element)
    if (left !== null && left !== held) hideLater(left)
  }
  const release = () => {
    const released = held
    held = null
    if (released !== null && released !== hovered) hideLater(released)
  }

  const onScroll = (event: Event) => {
    const element = event.target === root ? root.documentElement : event.target
    if (!(element instanceof Element)) return
    show(element)
    hideLater(element)
  }
  const hoverAt = (event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target : null
    hover(target !== null && onScrollbar(target, event.clientX, event.clientY) ? target : null)
  }
  const onPointerMove = (event: PointerEvent) => {
    // A drag on a native scrollbar sends no pointermove, and may end without a pointerup the page sees.
    hoverAt(event)
    if (held !== null && event.buttons === 0) release()
  }
  const onPointerUp = (event: PointerEvent) => {
    hoverAt(event)
    release()
  }
  const onPointerDown = (event: PointerEvent) => {
    if (!(event.target instanceof Element) || !onScrollbar(event.target, event.clientX, event.clientY)) return
    held = event.target
    show(held)
  }
  const onPointerLeave = () => hover(null)

  const page = root.documentElement
  root.addEventListener('scroll', onScroll, { capture: true, passive: true })
  root.addEventListener('pointermove', onPointerMove, { capture: true, passive: true })
  root.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true })
  root.addEventListener('pointerup', onPointerUp, { capture: true, passive: true })
  root.addEventListener('pointercancel', release, { capture: true, passive: true })
  page.addEventListener('pointerleave', onPointerLeave)
  return () => {
    root.removeEventListener('scroll', onScroll, { capture: true })
    root.removeEventListener('pointermove', onPointerMove, { capture: true })
    root.removeEventListener('pointerdown', onPointerDown, { capture: true })
    root.removeEventListener('pointerup', onPointerUp, { capture: true })
    root.removeEventListener('pointercancel', release, { capture: true })
    page.removeEventListener('pointerleave', onPointerLeave)
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  }
}
