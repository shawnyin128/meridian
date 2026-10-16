import type { PaperHighlightRect } from '../../shared/contract.js'

type Rect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>

/** The selection toolbar's height and its distance from the selected text, in CSS pixels. */
const TOOLS_HEIGHT = 34
const TOOLS_GAP = 10
/** How close the toolbar comes to the window's top and bottom, and its centre to the sides. */
const TOOLS_MARGIN = 12
const TOOLS_HALF_WIDTH = 100

/**
 * Splits a selection into one range per text node it covers, each trimmed of leading and trailing
 * whitespace and dropped when nothing else is left. `Range.getClientRects` also returns the box of
 * every element the selection holds whole, `<br>` and the text layer's endOfContent included;
 * measuring these pieces instead returns the boxes of the selected glyphs only.
 */
export function selectedTextRanges(range: Range): Range[] {
  const root = range.commonAncestorContainer
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const pieces: Range[] = []
  for (let node = root.nodeType === Node.TEXT_NODE ? root : walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!range.intersectsNode(node)) continue
    const text = (node as Text).data
    let start = node === range.startContainer ? range.startOffset : 0
    let end = node === range.endContainer ? range.endOffset : text.length
    while (start < end && /\s/.test(text[start]!)) start += 1
    while (end > start && /\s/.test(text[end - 1]!)) end -= 1
    if (start === end) continue
    const piece = document.createRange()
    piece.setStart(node, start)
    piece.setEnd(node, end)
    pieces.push(piece)
  }
  return pieces
}

/**
 * Converts the client boxes of selected text to page-relative lines, one rectangle per line of text,
 * clipped at the PDF page edge. The result survives zoom because no CSS pixels cross the
 * persistence boundary.
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
  return highlightLines(clipped, page.width / page.height)
}

/**
 * Joins page-relative rectangles into one per line of text, sorted top to bottom, then left to
 * right. Two rectangles share a line when they overlap vertically by at least half the shorter one
 * and the horizontal gap between them is less than the shorter one's height, so the same row of
 * the other column, a gutter away, stays a separate line. A line is the union of its rectangles:
 * one height, ending where its text ends. `aspect` is the page's width over its height, which puts
 * horizontal gaps in the unit of heights.
 */
export function highlightLines(rects: PaperHighlightRect[], aspect: number): PaperHighlightRect[] {
  const sameLine = (a: PaperHighlightRect, b: PaperHighlightRect): boolean => {
    const shorter = Math.min(a.height, b.height)
    const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
    const gap = (Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width)) * aspect
    return overlap >= shorter / 2 && gap < shorter
  }
  const lines: PaperHighlightRect[] = []
  for (const rect of rects) {
    let line = rect
    // A rectangle can bridge two lines held so far, so the growing line keeps absorbing until none is left on it.
    let at = lines.findIndex((held) => sameLine(held, line))
    while (at !== -1) {
      line = unionOf([line, ...lines.splice(at, 1)])
      at = lines.findIndex((held) => sameLine(held, line))
    }
    lines.push(line)
  }
  return lines.sort((a, b) => a.y - b.y || a.x - b.x)
}

/**
 * The SVG drawing of a highlight's lines: `box` is their union in page coordinates, which places
 * the drawing and serves as its viewBox, and `path` either fills every line as one shape or, for a
 * highlight with a note, draws one underline along the bottom of each line.
 */
export function highlightShape(
  lines: PaperHighlightRect[], noted: boolean,
): { box: PaperHighlightRect; path: string } {
  const path = lines.map((line) => (noted
    ? `M${line.x} ${line.y + line.height}h${line.width}`
    : `M${line.x} ${line.y}h${line.width}v${line.height}h${-line.width}z`)).join('')
  return { box: unionOf(lines), path }
}

/**
 * Where the selection toolbar goes for the selected `lines` on a page whose client rectangle is
 * `page`: centred under the text, or above it when the window `view` has no room below. `left` is
 * the toolbar's centre and `top` its top edge, both in client pixels.
 */
export function selectionToolsAnchor(
  page: Rect, lines: PaperHighlightRect[], view: { width: number; height: number },
): { left: number; top: number } {
  const box = unionOf(lines)
  const top = page.top + box.y * page.height
  const below = top + box.height * page.height + TOOLS_GAP
  const centre = page.left + (box.x + box.width / 2) * page.width
  return {
    left: Math.min(view.width - TOOLS_HALF_WIDTH, Math.max(TOOLS_HALF_WIDTH, centre)),
    top: below + TOOLS_HEIGHT <= view.height - TOOLS_MARGIN
      ? below : Math.max(TOOLS_MARGIN, top - TOOLS_GAP - TOOLS_HEIGHT),
  }
}

/** The smallest rectangle holding every one of `rects`, which must not be empty. */
function unionOf(rects: PaperHighlightRect[]): PaperHighlightRect {
  const x = Math.min(...rects.map((rect) => rect.x))
  const y = Math.min(...rects.map((rect) => rect.y))
  return {
    x,
    y,
    width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x,
    height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y,
  }
}
