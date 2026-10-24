import type { PaperHighlightRect } from './contract.js'

/**
 * Whether two highlight rectangles lie on one line of text: their heights overlap by at least half
 * the shorter one. The boxes of neighbouring lines, which overlap a little on tightly set text, do not.
 */
export function onOneLine(a: PaperHighlightRect, b: PaperHighlightRect): boolean {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return overlap >= Math.min(a.height, b.height) / 2
}

/**
 * Whether the highlight rectangles `a` and `b`, on one page, cover some of the same text: a rectangle
 * of each lies on one line with one of the other, and across they overlap by more than a quarter of
 * the shorter one's height, less than the narrowest glyph. Neighbouring words, whose boxes kerning
 * may overlap by a fraction of that, do not.
 */
export function sharesText(a: readonly PaperHighlightRect[], b: readonly PaperHighlightRect[]): boolean {
  return a.some((one) => b.some((other) => onOneLine(one, other)
    && Math.min(one.x + one.width, other.x + other.width) - Math.max(one.x, other.x) > Math.min(one.height, other.height) / 4))
}
