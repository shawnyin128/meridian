// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFollowEnd } from './useFollowEnd.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** The callbacks of every ResizeObserver made. */
const resized: (() => void)[] = []
let follow: () => void = () => {}

/** A conversation that keeps its end in view. */
function Stream() {
  const end = useFollowEnd<HTMLDivElement>()
  follow = end.follow
  return <div className="stream" ref={end.ref}><div className="message" /></div>
}

describe('useFollowEnd', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    resized.length = 0
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resized.push(callback) }
      observe() {}
      disconnect() {}
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
   * Mounts the stream 300px tall over `content` px of content, and returns it with ways to give the content
   * another length, silently or as a size change the observers report, and to scroll it as the reader does.
   */
  const mount = (content: number) => {
    act(() => root.render(<Stream />))
    const area = host.querySelector<HTMLElement>('.stream')!
    let top = 0
    let length = content
    Object.defineProperty(area, 'clientHeight', { configurable: true, get: () => 300 })
    Object.defineProperty(area, 'scrollHeight', { configurable: true, get: () => length })
    Object.defineProperty(area, 'scrollTop', {
      configurable: true, get: () => top, set: (value: number) => { top = Math.min(value, Math.max(length - 300, 0)) },
    })
    const lengthen = (next: number) => { length = next }
    const grow = (next: number) => act(() => { lengthen(next); for (const callback of resized) callback() })
    const scrollTo = (next: number) => act(() => { area.scrollTop = next; area.dispatchEvent(new Event('scroll')) })
    return { area, lengthen, grow, scrollTo }
  }

  it('停在末尾时内容变长,就跟到新的末尾', () => {
    const { area, grow } = mount(300)
    grow(800)
    expect(area.scrollTop).toBe(500)
    grow(1200)
    expect(area.scrollTop).toBe(900)
  })

  it('离末尾只差几行时也算在末尾,内容变长照样跟上', () => {
    const { area, grow, scrollTo } = mount(1000)
    scrollTo(690)
    grow(1400)
    expect(area.scrollTop).toBe(1100)
  })

  it('读者往上翻着读时内容变长,不去抢他的位置', () => {
    const { area, grow, scrollTo } = mount(1000)
    scrollTo(200)
    grow(1400)
    expect(area.scrollTop).toBe(200)
  })

  it('新加进来的一条消息也算内容变了', async () => {
    const { area, lengthen } = mount(300)
    await act(async () => {
      lengthen(1000)
      area.append(document.createElement('div'))
    })
    expect(area.scrollTop).toBe(700)
  })

  it('follow 回到末尾,之后又跟着新内容走', () => {
    const { area, grow, scrollTo } = mount(1000)
    scrollTo(200)
    act(() => follow())
    expect(area.scrollTop).toBe(700)
    grow(1300)
    expect(area.scrollTop).toBe(1000)
  })
})
