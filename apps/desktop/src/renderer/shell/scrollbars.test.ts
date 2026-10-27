// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeScrollbars, SCROLLBAR_IDLE_MS } from './scrollbars.js'

/**
 * A 100px by 100px area at the page's top left whose scrollbars are 12px wide, with content `content`
 * px long on each axis; with `gutter` it keeps the vertical scrollbar's strip whether or not it
 * overflows, as `scrollbar-gutter: stable` does. jsdom lays nothing out, so the geometry is set by hand.
 */
function area(content: { x: number; y: number }, gutter = false): HTMLElement {
  const element = document.createElement('div')
  const clientWidth = gutter || content.y > 100 ? 88 : 100
  const clientHeight = content.x > 100 ? 88 : 100
  const sizes = {
    clientLeft: 0, clientTop: 0, clientWidth, clientHeight,
    scrollWidth: Math.max(content.x, clientWidth), scrollHeight: Math.max(content.y, clientHeight),
  }
  for (const [name, value] of Object.entries(sizes)) Object.defineProperty(element, name, { value })
  element.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100)
  document.body.append(element)
  return element
}

const scroll = (element: Element) => element.dispatchEvent(new Event('scroll'))
const point = (element: Element, type: 'pointermove' | 'pointerdown' | 'pointerup', x: number, y: number, buttons = 0) =>
  element.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, buttons }))
const shown = (element: Element) => element.hasAttribute('data-scrolling')

describe('scrollbars that show only while their area scrolls', () => {
  let stop: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    stop = initializeScrollbars()
  })
  afterEach(() => {
    stop()
    document.body.replaceChildren()
    vi.useRealTimers()
  })

  it('an area that has not scrolled shows no scrollbar', () => {
    const list = area({ x: 100, y: 400 })
    expect(shown(list)).toBe(false)
  })

  it('a scroll shows the scrollbar, which hides once the area has not scrolled for the idle delay', () => {
    const list = area({ x: 100, y: 400 })
    scroll(list)
    expect(shown(list)).toBe(true)
    vi.advanceTimersByTime(SCROLLBAR_IDLE_MS - 1)
    expect(shown(list)).toBe(true)
    vi.advanceTimersByTime(1)
    expect(shown(list)).toBe(false)
  })

  it('each further scroll restarts the idle delay', () => {
    const list = area({ x: 100, y: 400 })
    scroll(list)
    vi.advanceTimersByTime(SCROLLBAR_IDLE_MS - 100)
    scroll(list)
    vi.advanceTimersByTime(SCROLLBAR_IDLE_MS - 1)
    expect(shown(list)).toBe(true)
    vi.advanceTimersByTime(1)
    expect(shown(list)).toBe(false)
  })

  it('only the area that scrolled shows its scrollbar', () => {
    const [scrolled, still] = [area({ x: 100, y: 400 }), area({ x: 100, y: 400 })]
    scroll(scrolled)
    expect([shown(scrolled), shown(still)]).toEqual([true, false])
  })

  it('the pointer over the vertical scrollbar shows it and keeps it past the delay; leaving lets it hide', () => {
    const list = area({ x: 100, y: 400 })
    point(list, 'pointermove', 94, 50)
    expect(shown(list)).toBe(true)
    vi.advanceTimersByTime(SCROLLBAR_IDLE_MS * 3)
    expect(shown(list)).toBe(true)
    point(list, 'pointermove', 40, 50)
    vi.advanceTimersByTime(SCROLLBAR_IDLE_MS - 1)
    expect(shown(list)).toBe(true)
    vi.advanceTimersByTime(1)
    expect(shown(list)).toBe(false)
  })

  it('the pointer over the horizontal scrollbar shows it too', () => {
    const table = area({ x: 400, y: 100 })
    point(table, 'pointermove', 50, 94)
    expect(shown(table)).toBe(true)
  })

  it('the pointer over the content of an area keeps no scrollbar showing', () => {
    const list = area({ x: 100, y: 400 })
    scroll(list)
    point(list, 'pointermove', 40, 50)
    vi.advanceTimersByTime(SCROLLBAR_IDLE_MS)
    expect(shown(list)).toBe(false)
  })

  it('an area that cannot scroll never shows a scrollbar, even with the pointer over the strip it keeps for one', () => {
    const still = area({ x: 100, y: 100 }, true)
    point(still, 'pointermove', 94, 50)
    point(still, 'pointermove', 50, 94)
    expect(shown(still)).toBe(false)
  })

  it('a thumb held by a press stays shown until the press ends away from it, then hides after the delay', () => {
    const list = area({ x: 100, y: 400 })
    point(list, 'pointermove', 94, 50)
    point(list, 'pointerdown', 94, 50, 1)
    scroll(list)
    // A drag moves the pointer off the scrollbar without any pointermove reaching the page.
    vi.advanceTimersByTime(SCROLLBAR_IDLE_MS * 3)
    expect(shown(list)).toBe(true)
    point(document.body, 'pointerup', 300, 300)
    vi.advanceTimersByTime(SCROLLBAR_IDLE_MS - 1)
    expect(shown(list)).toBe(true)
    vi.advanceTimersByTime(1)
    expect(shown(list)).toBe(false)
  })

  it('a pointer that moves with no button down ends a press whose release the page never saw', () => {
    const list = area({ x: 100, y: 400 })
    point(list, 'pointerdown', 94, 50, 1)
    point(document.body, 'pointermove', 300, 300)
    vi.advanceTimersByTime(SCROLLBAR_IDLE_MS)
    expect(shown(list)).toBe(false)
  })

  it('the pointer leaving the window from a scrollbar lets it hide', () => {
    const list = area({ x: 100, y: 400 })
    point(list, 'pointermove', 94, 50)
    document.documentElement.dispatchEvent(new PointerEvent('pointerleave'))
    vi.advanceTimersByTime(SCROLLBAR_IDLE_MS)
    expect(shown(list)).toBe(false)
  })

  it('a stopped watcher marks nothing', () => {
    stop()
    const list = area({ x: 100, y: 400 })
    scroll(list)
    point(list, 'pointermove', 94, 50)
    expect(shown(list)).toBe(false)
  })
})
