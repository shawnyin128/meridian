// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScrollArea } from './ScrollArea.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('ScrollArea', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  it('names its axis, and fills its column, keeps a gutter or fades in paint only when asked', () => {
    expect(renderToStaticMarkup(<ScrollArea axis="y" className="reading-list">笔记</ScrollArea>))
      .toBe('<div class="scroll-area scroll-area--y reading-list">笔记</div>')
    expect(renderToStaticMarkup(<ScrollArea axis="x" as="section" fill gutter paint held={['top', 'left']} />))
      .toBe('<section class="scroll-area scroll-area--x scroll-area--fill scroll-area--gutter" data-fade-paint="" data-fade-held="top left"></section>')
  })

  it('fades the edge past which its content is hidden, and hands its element to the caller', () => {
    const held = createRef<HTMLDivElement>()
    act(() => root.render(<ScrollArea axis="y" ref={held}><div /></ScrollArea>))
    const area = host.querySelector<HTMLElement>('.scroll-area')!
    expect(held.current).toBe(area)
    for (const [key, value] of [['clientHeight', 100], ['scrollHeight', 300], ['scrollTop', 0]] as const) {
      Object.defineProperty(area, key, { configurable: true, value })
    }
    act(() => { area.dispatchEvent(new Event('scroll')) })
    expect(area.dataset['fade']).toBe('bottom')
  })

  it('also hands its element to a callback ref, such as one that follows the end of a stream', () => {
    const seen: (HTMLElement | null)[] = []
    act(() => root.render(<ScrollArea axis="y" ref={(node) => { seen.push(node) }} />))
    expect(seen.at(-1)).toBe(host.querySelector('.scroll-area'))
  })
})
