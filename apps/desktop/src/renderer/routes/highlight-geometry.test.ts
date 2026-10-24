// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { PaperHighlightRect } from '../../shared/contract.js'
import {
  drawnLines, highlightAt, highlightLines, highlightShape, normalizedHighlightRects, selectedLinesByPage, selectedTextRanges,
  selectionBox, uncoveredLines,
} from './highlight-geometry.js'

/** A US Letter page at the reader's fit scale (830 / 612), as the page box's client rectangle. */
const PAGE = { left: 120, top: 60, width: 830, height: 1074 }

/**
 * Text boxes of 11 pt type at that scale: Chromium measures each text node with its fallback font,
 * so serif, sans-serif and superscript runs on one line have different heights and tops.
 */
const SERIF = { ascent: 13.3, height: 16.5 }
const SANS = { ascent: 11.5, height: 14.9 }
const SUPERSCRIPT = { ascent: 13.6, height: 12 }

/** A text box from `left` to `right` on the line whose baseline is `baseline`, in client pixels. */
const text = (left: number, right: number, baseline: number, face = SERIF) =>
  ({ left, top: baseline - face.ascent, width: right - left, height: face.height })

/** A stored rectangle mapped back to client pixels on `page`, rounded to tenths of a pixel. */
const onScreenOf = (page: typeof PAGE) => (rect: PaperHighlightRect) => ({
  left: Math.round((page.left + rect.x * page.width) * 10) / 10,
  right: Math.round((page.left + (rect.x + rect.width) * page.width) * 10) / 10,
  top: Math.round((page.top + rect.y * page.height) * 10) / 10,
  bottom: Math.round((page.top + (rect.y + rect.height) * page.height) * 10) / 10,
})
const onScreen = onScreenOf(PAGE)

/**
 * A two-column section under a full-width figure: the left column's text runs from 193 to 524 px,
 * the right column's from 547 to 878 px, a 23 px gutter, and the rows of both columns share their
 * baselines. The selection starts in the first left line and ends in the second right line, so in
 * document order it covers the three left lines, then the first two right lines.
 */
const TWO_COLUMNS = [
  text(350, 470, 905), text(475.5, 524, 905, SANS),
  text(193, 300, 923.4), text(300, 306, 923.4, SUPERSCRIPT), text(311.5, 360, 923.4, SANS),
  text(365.5, 524, 923.4),
  text(193, 410, 941.8),
  text(547, 700, 905), text(705.5, 878, 905),
  text(547, 640, 923.4),
]

describe('highlight geometry', () => {
  it('把 CSS 像素换成页内比例，缩放前后保存的锚点不变', () => {
    expect(normalizedHighlightRects(
      { left: 100, top: 50, width: 800, height: 1000 },
      [{ left: 180, top: 250, width: 240, height: 20 }],
    )).toEqual([{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }])
    expect(normalizedHighlightRects(
      { left: 100, top: 50, width: 400, height: 500 },
      [{ left: 140, top: 150, width: 120, height: 10 }],
    )).toEqual([{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }])
  })

  it('选区伸到页外时裁在边界内，空矩形不落盘', () => {
    const [clipped] = normalizedHighlightRects(
      { left: 0, top: 0, width: 100, height: 100 },
      [
        { left: 90, top: 95, width: 30, height: 20 },
        { left: 120, top: 30, width: 10, height: 10 },
        { left: 20, top: 20, width: 0, height: 10 },
      ],
    )
    expect(clipped).toMatchObject({ x: 0.9, y: 0.95 })
    expect(clipped?.width).toBeCloseTo(0.1)
    expect(clipped?.height).toBeCloseTo(0.05)
  })

  it('合并 pdf.js 同一行重复和相接的矩形,不把两栏远处文字连起来', () => {
    const merged = normalizedHighlightRects(
      { left: 0, top: 0, width: 1000, height: 1000 },
      [
        { left: 100, top: 100, width: 300, height: 20 },
        { left: 100, top: 100, width: 120, height: 20 },
        { left: 398, top: 101, width: 102, height: 19 },
        { left: 700, top: 100, width: 100, height: 20 },
      ],
    )
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({ x: 0.1, y: 0.1 })
    expect(merged[0]?.width).toBeCloseTo(0.4)
    expect(merged[0]?.height).toBeCloseTo(0.02)
    expect(merged[1]).toMatchObject({ x: 0.7, y: 0.1 })
    expect(merged[1]?.width).toBeCloseTo(0.1)
    expect(merged[1]?.height).toBeCloseTo(0.02)
  })

  it('跨两栏的选区每栏每行一个矩形：一行一个高度，左右只到文字为止，不越过栏间距', () => {
    expect(normalizedHighlightRects(PAGE, TWO_COLUMNS).map(onScreen)).toEqual([
      { left: 350, right: 524, top: 891.7, bottom: 908.4 },
      { left: 547, right: 878, top: 891.7, bottom: 908.2 },
      { left: 193, right: 524, top: 909.8, bottom: 926.8 },
      { left: 547, right: 640, top: 910.1, bottom: 926.6 },
      { left: 193, right: 410, top: 928.5, bottom: 945 },
    ])
  })

  it('文字框的先后次序不影响结果，后来的框能把同一行已分开的两段连起来', () => {
    expect(normalizedHighlightRects(PAGE, [...TWO_COLUMNS].reverse()).map(onScreen))
      .toEqual(normalizedHighlightRects(PAGE, TWO_COLUMNS).map(onScreen))
    expect(normalizedHighlightRects(
      PAGE, [text(193, 250, 941.8), text(290, 410, 941.8), text(250, 290, 941.8)],
    ).map(onScreen)).toEqual([{ left: 193, right: 410, top: 928.5, bottom: 945 }])
  })

  it('0.0.15.3 存下的高亮仍能画出：同一行的碎片并成一行，按页面宽高比判断字距，另一栏的同一行不并', () => {
    // Stored by 0.0.15.3 for one line of each column: span and text boxes of uneven height, 14 px
    // apart on the left line, and the right column's line 23 px across the gutter.
    const stored: PaperHighlightRect[] = [
      { x: 0.0880, y: 0.7747, width: 0.1289, height: 0.0154 },
      { x: 0.2337, y: 0.7764, width: 0.0843, height: 0.0139 },
      { x: 0.2337, y: 0.7747, width: 0.0843, height: 0.0154 },
      { x: 0.3250, y: 0.7747, width: 0.1617, height: 0.0154 },
      { x: 0.5145, y: 0.7747, width: 0.3988, height: 0.0154 },
    ]
    const lines = highlightLines(stored, PAGE.width / PAGE.height)
    expect(lines).toHaveLength(2)
    expect(lines[0]!.x).toBeCloseTo(0.0880, 4)
    expect(lines[0]!.y).toBeCloseTo(0.7747, 4)
    expect(lines[0]!.width).toBeCloseTo(0.3987, 4)
    expect(lines[0]!.height).toBeCloseTo(0.0156, 4)
    expect(lines[1]).toEqual(stored[4])
  })

  it('后来的高亮盖住的那一截从先前的高亮里剪掉,同一行上可能剪成两段,被盖满的行不剩;下一行不受上一行的影响', () => {
    const line = (x: number, width: number, y: number) => ({ x, y, width, height: 1 / 64 })
    // The second line's box overlaps the first one's a little, as tightly set lines do.
    const older = [line(0.125, 0.5, 0.25), line(0.125, 0.25, 0.25 + 7 / 512), line(0.5, 0.125, 0.5)]
    const newer = [line(0.25, 0.125, 0.25), line(0.375, 0.5, 0.5)]
    expect(uncoveredLines(older, newer)).toEqual([
      line(0.125, 0.125, 0.25), line(0.375, 0.25, 0.25), line(0.125, 0.25, 0.25 + 7 / 512),
    ])
    expect(uncoveredLines(older, [])).toEqual(older)
  })

  it('一页上每段高亮按画出来的行算:后来的盖住的那一截不算前面那段的;点在哪一行上就是哪段,行外不算', () => {
    const line = (x: number, width: number, y: number) => ({ x, y, width, height: 1 / 64 })
    const highlight = (id: string, rects: PaperHighlightRect[]) => ({
      id, page: 1, quote: id, rects, color: 'yellow' as const, note: '', created: '2026-10-24', updated: '2026-10-24',
    })
    const older = highlight('older', [line(0.125, 0.5, 0.25), line(0.125, 0.25, 0.25 + 7 / 512)])
    const newer = highlight('newer', [line(0.25, 0.125, 0.25)])
    const whole = highlight('whole', [line(0.125, 0.125, 0.5)])
    const over = highlight('over', [line(0.125, 0.125, 0.5)])
    expect(drawnLines([older, newer, whole, over], 1)).toEqual([
      [line(0.125, 0.125, 0.25), line(0.375, 0.25, 0.25), line(0.125, 0.25, 0.25 + 7 / 512)],
      [line(0.25, 0.125, 0.25)], [], [line(0.125, 0.125, 0.5)],
    ])
    const at = (x: number, y: number) => highlightAt([older, newer, whole, over], 1, { x, y })?.id ?? null
    // On the stretch both cover, the newer wins; beside it on the same line, the older one.
    expect([at(0.3, 0.255), at(0.2, 0.255), at(0.5, 0.255), at(0.2, 0.27)]).toEqual(['newer', 'older', 'older', 'older'])
    // A highlight covered whole is never hit; past the end of a line and between lines nothing is.
    expect([at(0.2, 0.505), at(0.7, 0.255), at(0.2, 0.4)]).toEqual(['over', null, null])

    // Where the boxes of two neighbouring lines overlap, as on tightly set text, the newer one is hit.
    const above = highlight('above', [line(0.125, 0.5, 0.25)])
    const below = highlight('below', [line(0.125, 0.5, 0.25 + 7 / 512)])
    expect(highlightAt([above, below], 1, { x: 0.2, y: 0.265 })?.id).toBe('below')
  })

  it('高亮的填色每行一个矩形，批注的底线每行一条，沿着同一行的底边', () => {
    const lines = normalizedHighlightRects(PAGE, TWO_COLUMNS).slice(0, 2)
    const shape = highlightShape(lines)
    expect(shape.fill.match(/M/g)).toHaveLength(2)
    expect(shape.fill.match(/z/g)).toHaveLength(2)
    expect(shape.underline).toBe(lines.map((line) => `M${line.x} ${line.y + line.height}h${line.width}`).join(''))
    expect(onScreen(shape.box)).toEqual({ left: 350, right: 878, top: 891.7, bottom: 908.4 })
  })

  it('选区工具条贴着的框是选中各行在屏幕上的外接矩形，页面挪了框跟着挪', () => {
    const lines = normalizedHighlightRects(PAGE, TWO_COLUMNS)
    const box = selectionBox(PAGE, lines)
    const union = highlightShape(lines).box
    expect(box.left).toBeCloseTo(PAGE.left + union.x * PAGE.width, 5)
    expect(box.top).toBeCloseTo(PAGE.top + union.y * PAGE.height, 5)
    expect(box.width).toBeCloseTo(union.width * PAGE.width, 5)
    expect(box.height).toBeCloseTo(union.height * PAGE.height, 5)
    expect(selectionBox({ ...PAGE, left: PAGE.left + 40 }, lines).left).toBeCloseTo(box.left + 40, 5)
  })

  it('选区只按选中的文字节点量，去掉首尾空白，不量元素、<br> 和 endOfContent', () => {
    document.body.innerHTML = '<div class="textLayer">'
      + '<span role="presentation">Speculative decoding </span><br role="presentation">'
      + '<span class="markedContent"><span role="presentation">drafts tokens</span></span>'
      + '<span role="presentation"> </span><br role="presentation">'
      + '<span role="presentation">  in parallel</span>'
      + '<div class="endOfContent"></div></div>'
    const layer = document.querySelector('.textLayer')!
    const range = document.createRange()
    range.setStart(layer.firstChild!.firstChild!, 12)
    range.setEnd(layer, layer.childNodes.length)
    const pieces = selectedTextRanges(range)
    expect(pieces.map((piece) => piece.toString())).toEqual(['decoding', 'drafts tokens', 'in parallel'])
    for (const piece of pieces) {
      expect(piece.startContainer.nodeType).toBe(Node.TEXT_NODE)
      expect(piece.endContainer).toBe(piece.startContainer)
    }

    const inside = document.createRange()
    const words = layer.querySelector('.markedContent span')!.firstChild!
    inside.setStart(words, 2)
    inside.setEnd(words, 7)
    expect(selectedTextRanges(inside).map((piece) => piece.toString())).toEqual(['afts'])
  })

  it('选区按页给出选中的行：每页按自己的页框换算，跨栏的每栏每行一个矩形，页外和文字层外的字不算', () => {
    document.body.innerHTML = '<div class="pdfsheet">'
      + '<div class="pdfpagebox"><div class="textLayer"><span>Speculative</span><span>decoding</span><span>drafts</span></div></div>'
      + '<div class="pdfpagebox"><div class="paper-selection"><span>drawn</span></div><div class="textLayer"><span>tokens</span></div></div>'
      + '</div><aside><p>side panel</p></aside>'
    const pages = [...document.querySelectorAll<HTMLElement>('.pdfpagebox')]
    const next = { ...PAGE, top: PAGE.top + PAGE.height + 24 }
    const boxes = new Map([[pages[0], PAGE], [pages[1], next]])
    // jsdom lays nothing out: each page box and each selected word report the box they have on screen.
    const words = new Map([
      ['Speculative', text(350, 470, 905)], ['decoding', text(547, 700, 905)], ['drafts', text(193, 410, 923.4)],
      ['drawn', text(193, 300, next.top + 40)], ['tokens', text(193, 300, next.top + 60)], ['side panel', text(10, 90, 300)],
    ])
    const box = ({ left, top, width, height }: { left: number; top: number; width: number; height: number }) =>
      DOMRect.fromRect({ x: left, y: top, width, height })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return box(boxes.get(this) ?? { left: 0, top: 0, width: 0, height: 0 })
    })
    Range.prototype.getClientRects = function (this: Range) { return [box(words.get(this.toString())!)] as unknown as DOMRectList }
    const range = document.createRange()
    range.setStart(pages[0]!.querySelector('span')!.firstChild!, 0)
    range.setEnd(document.querySelector('aside p')!.firstChild!, 4)

    const lines = selectedLinesByPage(range)
    expect([...lines.keys()]).toEqual(pages)
    expect(lines.get(pages[0]!)!.map(onScreen)).toEqual([
      { left: 350, right: 470, top: 891.7, bottom: 908.2 },
      { left: 547, right: 700, top: 891.7, bottom: 908.2 },
      { left: 193, right: 410, top: 910.1, bottom: 926.6 },
    ])
    expect(lines.get(pages[1]!)!.map(onScreenOf(next))).toEqual([
      { left: 193, right: 300, top: next.top + 46.7, bottom: next.top + 63.2 },
    ])
    vi.restoreAllMocks()
    delete (Range.prototype as Partial<Range>).getClientRects
  })
})
