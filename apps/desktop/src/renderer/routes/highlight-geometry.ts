import type { PaperHighlightRect } from '../../shared/contract.js'

type Rect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>

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
 * the drawing and serves as its viewBox, `fill` fills every line as one shape, and `underline` draws
 * one line along the bottom of each line, the mark of a highlight with a note.
 */
export function highlightShape(
  lines: PaperHighlightRect[],
): { box: PaperHighlightRect; fill: string; underline: string } {
  return {
    box: unionOf(lines),
    fill: lines.map((line) => `M${line.x} ${line.y}h${line.width}v${line.height}h${-line.width}z`).join(''),
    underline: lines.map((line) => `M${line.x} ${line.y + line.height}h${line.width}`).join(''),
  }
}

/**
 * The client rectangle around the selected `lines` on a page whose client rectangle is `page`: the
 * box the selection toolbar is placed against.
 */
export function selectionBox(page: Rect, lines: PaperHighlightRect[]): DOMRect {
  const box = unionOf(lines)
  return DOMRect.fromRect({
    x: page.left + box.x * page.width, y: page.top + box.y * page.height,
    width: box.width * page.width, height: box.height * page.height,
  })
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
