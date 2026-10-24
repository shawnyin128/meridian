import { describe, expect, it } from 'vitest'
import {
  ZOOM_MAX, ZOOM_MIN, clampZoom, keptScroll, pageScale, scaledAbout, type SheetTransform,
} from './reader-zoom.js'

/** Where a point of the laid-out sheet shows on screen under `transform`, relative to the sheet's laid-out corner. */
const onScreen = (point: { x: number; y: number }, transform: SheetTransform) => ({
  x: transform.x + point.x * transform.scale,
  y: transform.y + point.y * transform.scale,
})

describe('reader zoom', () => {
  it('缩放不超出 60% 到 240%', () => {
    expect([ZOOM_MIN, ZOOM_MAX]).toEqual([0.6, 2.4])
    expect(clampZoom(3)).toBe(ZOOM_MAX)
    expect(clampZoom(0.2)).toBe(ZOOM_MIN)
    expect(clampZoom(1.37)).toBe(1.37)
  })

  it('缩放时指针下的那一点留在原处，中途换了指针位置也一样', () => {
    const first = { x: 300, y: 200 }
    const zoomedIn = scaledAbout({ x: 0, y: 0, scale: 1 }, 1.5, first)
    expect(zoomedIn.scale).toBe(1.5)
    expect(onScreen(first, zoomedIn)).toEqual(first)

    const pointer = { x: 520, y: 640 }
    const under = { x: (pointer.x - zoomedIn.x) / zoomedIn.scale, y: (pointer.y - zoomedIn.y) / zoomedIn.scale }
    const zoomedOut = scaledAbout(zoomedIn, 0.8, pointer)
    expect(zoomedOut.scale).toBe(0.8)
    expect(onScreen(under, zoomedOut).x).toBeCloseTo(pointer.x, 10)
    expect(onScreen(under, zoomedOut).y).toBeCloseTo(pointer.y, 10)
    expect(onScreen(first, zoomedOut)).not.toEqual(first)
  })

  it('页面按新比例重新排好后，滚动把指针下的那一点放回指针下', () => {
    const pointer = { x: 400, y: 500 }
    // The page box while CSS scales it, then laid out at the new zoom: wider margins and a rounded size.
    const scaled = { left: 100, top: -300, width: 1245, height: 1611 }
    const laidOut = { left: 160, top: 40, width: 1244, height: 1610 }
    const shift = keptScroll(scaled, laidOut, pointer)
    const fraction = { x: (pointer.x - scaled.left) / scaled.width, y: (pointer.y - scaled.top) / scaled.height }
    expect(laidOut.left - shift.left + fraction.x * laidOut.width).toBeCloseTo(pointer.x, 10)
    expect(laidOut.top - shift.top + fraction.y * laidOut.height).toBeCloseTo(pointer.y, 10)
  })

  it('100% 时页面放进可用宽度：地方够就是 830px，打开对话和侧栏后收窄到剩下的宽度，缩放在此之上再乘', () => {
    // A US Letter page is 612pt wide; 718px is what the 1440px window leaves with the chat and a rail tab open.
    expect(612 * pageScale(612, 1038, 1)).toBeCloseTo(830, 10)
    expect(612 * pageScale(612, 718, 1)).toBeCloseTo(718, 10)
    expect(612 * pageScale(612, 558, 1)).toBeCloseTo(558, 10)
    expect(612 * pageScale(612, 718, 1.5)).toBeCloseTo(1077, 10)
    // A small page is not blown up past 1.6 times its size to fill the width.
    expect(pageScale(300, 1038, 1)).toBe(1.6)
  })
})
