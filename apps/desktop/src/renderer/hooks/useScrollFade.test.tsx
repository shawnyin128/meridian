// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScrollFade } from './useScrollFade.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** A scroll area that fades along `axis`. */
function Area({ axis }: { axis: 'x' | 'y' | 'both' }) {
  return <div className="area" ref={useScrollFade(axis)}><div className="content" /></div>
}

/** The callbacks of every ResizeObserver made, with the elements each one watches. */
const observers: { callback: () => void; watched: Set<Element> }[] = []

describe('useScrollFade', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    observers.length = 0
    vi.stubGlobal('ResizeObserver', class {
      private held: { callback: () => void; watched: Set<Element> }
      constructor(callback: () => void) { this.held = { callback, watched: new Set() }; observers.push(this.held) }
      observe(element: Element) { this.held.watched.add(element) }
      disconnect() { this.held.watched.clear() }
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  /**
   * Mounts the area 100px by 100px with content `size` px long on each axis, and returns it with a way
   * to scroll it to `x`, `y` and to give its content another `size`.
   */
  const mount = (axis: 'x' | 'y' | 'both', size: { x: number; y: number }) => {
    act(() => root.render(<Area axis={axis} />))
    const area = host.querySelector<HTMLElement>('.area')!
    let offset = { x: 0, y: 0 }
    let content = size
    for (const [key, value] of [
      ['clientWidth', () => 100], ['clientHeight', () => 100], ['scrollWidth', () => content.x], ['scrollHeight', () => content.y],
      ['scrollLeft', () => offset.x], ['scrollTop', () => offset.y],
    ] as const) Object.defineProperty(area, key, { configurable: true, get: value })
    const scrollTo = (x: number, y: number) => act(() => { offset = { x, y }; area.dispatchEvent(new Event('scroll')) })
    const grow = (next: { x: number; y: number }) => { content = next }
    return { area, scrollTo, grow }
  }

  it('内容放得下时不淡出任何一边', () => {
    const { area, scrollTo } = mount('both', { x: 100, y: 100 })
    scrollTo(0, 0)
    expect(area.hasAttribute('data-fade')).toBe(false)
  })

  it('只在藏着内容的那一边淡出:顶上只淡下边,中间两边都淡,滚到底只淡上边', () => {
    const { area, scrollTo } = mount('y', { x: 100, y: 300 })
    scrollTo(0, 0)
    expect(area.dataset.fade).toBe('bottom')
    scrollTo(0, 100)
    expect(area.dataset.fade).toBe('top bottom')
    scrollTo(0, 200)
    expect(area.dataset.fade).toBe('top')
  })

  it('横向滚动区同样只标出藏着内容的左边或右边', () => {
    const { area, scrollTo } = mount('x', { x: 250, y: 100 })
    scrollTo(0, 0)
    expect(area.dataset.fade).toBe('right')
    scrollTo(150, 0)
    expect(area.dataset.fade).toBe('left')
  })

  it('两个方向都能滚时四边各自标出:起点只淡右下,中间四边都淡,终点只淡左上', () => {
    const { area, scrollTo } = mount('both', { x: 300, y: 300 })
    scrollTo(0, 0)
    expect(area.dataset.fade).toBe('bottom right')
    scrollTo(100, 100)
    expect(area.dataset.fade).toBe('top bottom left right')
    scrollTo(200, 200)
    expect(area.dataset.fade).toBe('top left')
  })

  it('滚动区或内容变了大小、调用方却没有重新渲染时也重新量一遍', () => {
    const { area, grow } = mount('y', { x: 100, y: 100 })
    expect(area.hasAttribute('data-fade')).toBe(false)
    const watching = observers.find((held) => held.watched.has(area))!
    expect(watching.watched.has(area.querySelector('.content')!)).toBe(true)
    grow({ x: 100, y: 240 })
    act(() => watching.callback())
    expect(area.dataset.fade).toBe('bottom')
  })
})
