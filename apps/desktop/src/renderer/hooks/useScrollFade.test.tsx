// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useScrollFade } from './useScrollFade.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** A scroll area that fades along `axis`. */
function Area({ axis }: { axis: 'x' | 'y' }) {
  return <div className="area" ref={useScrollFade(axis)} />
}

describe('useScrollFade', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  /**
   * Mounts the area 100px long along `axis` with content `content` px long, and returns it with a way
   * to scroll it to `at`.
   */
  const mount = (axis: 'x' | 'y', content: number) => {
    const [client, scroll, offsetKey] = axis === 'y'
      ? ['clientHeight', 'scrollHeight', 'scrollTop']
      : ['clientWidth', 'scrollWidth', 'scrollLeft']
    act(() => root.render(<Area axis={axis} />))
    const area = host.querySelector<HTMLElement>('.area')!
    let offset = 0
    Object.defineProperty(area, client, { configurable: true, get: () => 100 })
    Object.defineProperty(area, scroll, { configurable: true, get: () => content })
    Object.defineProperty(area, offsetKey, { configurable: true, get: () => offset })
    const scrollTo = (at: number) => act(() => { offset = at; area.dispatchEvent(new Event('scroll')) })
    return { area, scrollTo }
  }

  it('内容放得下时不淡出任何一边', () => {
    const { area, scrollTo } = mount('y', 100)
    scrollTo(0)
    expect(area.hasAttribute('data-fade')).toBe(false)
  })

  it('只在藏着内容的那一边淡出:顶上只淡下边,中间两边都淡,滚到底只淡上边', () => {
    const { area, scrollTo } = mount('y', 300)
    scrollTo(0)
    expect(area.dataset.fade).toBe('bottom')
    scrollTo(100)
    expect(area.dataset.fade).toBe('top bottom')
    scrollTo(200)
    expect(area.dataset.fade).toBe('top')
  })

  it('横向滚动区同样只标出藏着内容的左边或右边', () => {
    const { area, scrollTo } = mount('x', 250)
    scrollTo(0)
    expect(area.dataset.fade).toBe('right')
    scrollTo(150)
    expect(area.dataset.fade).toBe('left')
  })
})
