import type { PaperHighlight, PaperHighlightRect } from '../../shared/contract.js'
import { onOneLine } from '../../shared/highlight-overlap.js'

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
 * The lines `range` selects on each page it covers, keyed by the page's `.pdfpagebox`: the selected
 * glyphs of the page's text layer, normalized against the page box as a highlight of them would be.
 * Text outside a page's text layer does not count, and a page with no selected glyphs is left out.
 */
export function selectedLinesByPage(range: Range): Map<HTMLElement, PaperHighlightRect[]> {
  const boxes = new Map<HTMLElement, DOMRect[]>()
  for (const piece of selectedTextRanges(range)) {
    const page = piece.startContainer.parentElement?.closest('.textLayer')?.closest<HTMLElement>('.pdfpagebox')
    if (page === null || page === undefined) continue
    boxes.set(page, [...(boxes.get(page) ?? []), ...piece.getClientRects()])
  }
  const lines = new Map<HTMLElement, PaperHighlightRect[]>()
  for (const [page, selected] of boxes) {
    const fitted = normalizedHighlightRects(page.getBoundingClientRect(), selected)
    if (fitted.length > 0) lines.set(page, fitted)
  }
  return lines
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
 * What remains of `lines` where no line of `over` on the same line covers them: each line loses the
 * stretch across that every such line of `over` spans, which can split it in two or leave nothing.
 */
export function uncoveredLines(lines: PaperHighlightRect[], over: PaperHighlightRect[]): PaperHighlightRect[] {
  return lines.flatMap((line) => over.filter((cover) => onOneLine(line, cover)).reduce<PaperHighlightRect[]>(
    (pieces, cover) => pieces.flatMap((piece) => [
      { ...piece, width: Math.min(piece.x + piece.width, cover.x) - piece.x },
      { ...piece, x: Math.max(piece.x, cover.x + cover.width), width: piece.x + piece.width - Math.max(piece.x, cover.x + cover.width) },
    ].filter((part) => part.width > 0)),
    [line],
  ))
}

/**
 * The lines each of `highlights`, all on one page and in stored order, is drawn with: its lines
 * where no later one in the list, a newer one, covers them on the same line; one covered whole gets
 * none. `aspect` is the page's width over its height.
 */
export function drawnLines(highlights: readonly PaperHighlight[], aspect: number): PaperHighlightRect[][] {
  const newer: PaperHighlightRect[] = []
  const drawn: PaperHighlightRect[][] = []
  for (let at = highlights.length - 1; at >= 0; at -= 1) {
    const lines = highlightLines(highlights[at]!.rects, aspect)
    drawn[at] = uncoveredLines(lines, newer)
    newer.push(...lines)
  }
  return drawn
}

/**
 * The highlight of `highlights`, all on one page and in stored order, drawn at `point` in page
 * fractions, the newest where drawn lines meet, or null where none is drawn.
 */
export function highlightAt(
  highlights: readonly PaperHighlight[], aspect: number, point: { x: number; y: number },
): PaperHighlight | null {
  const drawn = drawnLines(highlights, aspect)
  for (let at = highlights.length - 1; at >= 0; at -= 1) {
    const hit = drawn[at]!.some((line) => point.x >= line.x && point.x <= line.x + line.width
      && point.y >= line.y && point.y <= line.y + line.height)
    if (hit) return highlights[at]!
  }
  return null
}

/**
 * The SVG path that traces the outline of `lines`, a highlight's lines top to bottom as drawnLines
 * gives them: one closed outline for each run of lines that each touch or overlap the next and share
 * a stretch across with it, stepping where the wider of two lines ends, and one rectangle for a line
 * that joins neither neighbour.
 */
export function highlightOutline(lines: PaperHighlightRect[]): string {
  const right = (line: PaperHighlightRect) => line.x + line.width
  const bottom = (line: PaperHighlightRect) => line.y + line.height
  const runs: PaperHighlightRect[][] = []
  for (const line of lines) {
    const run = runs.at(-1)
    const above = run?.at(-1)
    const joins = above !== undefined && line.y > above.y && line.y <= bottom(above)
      && line.x < right(above) && above.x < right(line)
    if (joins) run!.push(line)
    else runs.push([line])
  }
  return runs.map((run) => {
    const points: [number, number][] = [[run[0]!.x, run[0]!.y], [right(run[0]!), run[0]!.y]]
    for (let at = 0; at < run.length - 1; at += 1) {
      const [a, b] = [run[at]!, run[at + 1]!]
      const step = right(b) > right(a) ? b.y : bottom(a)
      points.push([right(a), step], [right(b), step])
    }
    const last = run.at(-1)!
    points.push([right(last), bottom(last)], [last.x, bottom(last)])
    for (let at = run.length - 2; at >= 0; at -= 1) {
      const [a, b] = [run[at]!, run[at + 1]!]
      const step = b.x < a.x ? b.y : bottom(a)
      points.push([b.x, step], [a.x, step])
    }
    return `${points.map(([x, y], at) => `${at === 0 ? 'M' : 'L'}${x} ${y}`).join('')}Z`
  }).join('')
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
