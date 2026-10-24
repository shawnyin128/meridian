type Point = { x: number; y: number }
type Rect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>

export const ZOOM_MIN = 0.6
export const ZOOM_MAX = 2.4
/** The widest a page is laid out at 100% zoom, in px, however much room there is. */
const PAGE_WIDTH = 830
/** The most a page is enlarged to fit at 100% zoom, so a small page is not blown up. */
const MAX_FIT = 1.6

/** A CSS transform of the sheet: translate by `x`, `y` pixels, then scale from its top-left corner. */
export type SheetTransform = { x: number; y: number; scale: number }

/**
 * The pdf.js scale a page `pageWidth` points wide is laid out at: at 100% zoom the page fills `room`,
 * the scroll area's content width in px, up to 830px wide and 1.6 times its size, and `zoom` scales
 * that fit.
 */
export function pageScale(pageWidth: number, room: number, zoom: number): number {
  return Math.min(Math.min(PAGE_WIDTH, room) / pageWidth, MAX_FIT) * zoom
}

/** `zoom` held within the reader's zoom limits. */
export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
}

/**
 * The transform that shows the sheet at `scale` times its laid-out size and leaves the point `at`,
 * in pixels from the sheet's laid-out top-left corner, where `held` showed it.
 */
export function scaledAbout(held: SheetTransform, scale: number, at: Point): SheetTransform {
  const factor = scale / held.scale
  return { x: at.x - (at.x - held.x) * factor, y: at.y - (at.y - held.y) * factor, scale }
}

/**
 * The scroll offsets to add once a page box is laid out at a new zoom, so that the point of the page
 * under `pointer` stays under it: `before` is the box's client rectangle while a CSS transform
 * scales it, `after` its client rectangle laid out without one.
 */
export function keptScroll(before: Rect, after: Rect, pointer: Point): { left: number; top: number } {
  return {
    left: after.left + (pointer.x - before.left) / before.width * after.width - pointer.x,
    top: after.top + (pointer.y - before.top) / before.height * after.height - pointer.y,
  }
}
