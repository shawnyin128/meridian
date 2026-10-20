// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClipped } from './useClipped.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** A box of text that says whether its text is cut off. */
function Box({ text }: { text: string }) {
  const box = useRef<HTMLDivElement>(null)
  return <div ref={box} data-clipped={useClipped(box, text)}>{text}</div>
}

describe('useClipped', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  /** Renders the box with content of `content` px against a 100px by 40px box and returns whether it counts as cut. */
  const clipped = (content: { width: number; height: number }) => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40)
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(content.width)
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(content.height)
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(<Box text="按接受率动态调整草稿树宽度" />))
    const found = host.querySelector('div')!.dataset.clipped
    act(() => root.unmount())
    return found
  }

  it('放得下时不算被截', () => {
    expect(clipped({ width: 100, height: 40 })).toBe('false')
  })

  it('一行文字比盒子宽时算被截', () => {
    expect(clipped({ width: 180, height: 40 })).toBe('true')
  })

  it('多行文字比盒子高时也算被截', () => {
    expect(clipped({ width: 100, height: 62 })).toBe('true')
  })
})
