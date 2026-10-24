import { describe, expect, it } from 'vitest'
import { sharesText } from './highlight-overlap.js'

/** One line of 11 pt text on a US Letter page as a stored rectangle, from `x` across `width`, its top at `y`. */
const line = (x: number, width: number, y = 0.25) => ({ x, y, width, height: 0.0175 })
/** Where the next line of that text starts: its box overlaps this one's by about a tenth of its height. */
const NEXT = 0.25 + 0.0155

describe('两段高亮是否盖住同一段文字', () => {
  it('同一行上重叠的一截就算,哪怕只盖住一个窄字', () => {
    expect(sharesText([line(0.1, 0.2)], [line(0.2, 0.2)])).toBe(true)
    // An "i" of 11 pt type is about 3 pt of the page's 612.
    expect(sharesText([line(0.1, 0.2)], [line(0.3 - 3 / 612, 0.2)])).toBe(true)
  })

  it('同一行上紧挨着的两个词不算,字距让两个框叠了不到一点也不算', () => {
    expect(sharesText([line(0.1, 0.2)], [line(0.3, 0.2)])).toBe(false)
    expect(sharesText([line(0.1, 0.2)], [line(0.3 - 0.5 / 612, 0.2)])).toBe(false)
  })

  it('上下相邻、行框叠了一点的两行不算', () => {
    expect(sharesText([line(0.1, 0.2)], [line(0.1, 0.2, NEXT)])).toBe(false)
  })

  it('多行的高亮只要有一行和另一段在同一行上重叠就算', () => {
    expect(sharesText([line(0.1, 0.4), line(0.1, 0.3, NEXT)], [line(0.35, 0.1, NEXT)])).toBe(true)
    expect(sharesText([line(0.1, 0.4), line(0.1, 0.3, NEXT)], [line(0.45, 0.1, NEXT)])).toBe(false)
  })
})
