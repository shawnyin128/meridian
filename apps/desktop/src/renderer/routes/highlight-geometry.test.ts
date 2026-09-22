import { describe, expect, it } from 'vitest'
import { normalizedHighlightRects } from './highlight-geometry.js'

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
})
