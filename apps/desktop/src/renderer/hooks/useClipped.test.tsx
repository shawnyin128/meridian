// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isClipped, useClipped } from './useClipped.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** A box of text that says whether its text is cut off, measuring its last line's end when it has `lines`. */
function Box({ text, lines = false }: { text: string; lines?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  return <div ref={box} data-clipped={useClipped(box, text, lines)}>{text}</div>
}

describe('useClipped', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  /**
   * Renders the box with content of `content` px against a 100px by 40px box and returns whether it counts
   * as cut, and the `--line-end` it was given.
   */
  const measure = (content: { width: number; height: number }, lines = false) => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40)
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(content.width)
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(content.height)
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(<Box text="Dynamic Draft Trees: Adaptive Width for Speculative Decoding" lines={lines} />))
    const box = host.querySelector('div')!
    const found = { clipped: box.dataset.clipped, end: box.style.getPropertyValue('--line-end') }
    act(() => root.unmount())
    return found
  }
  const clipped = (content: { width: number; height: number }) => measure(content).clipped

  it('放得下时不算被截', () => {
    expect(clipped({ width: 100, height: 40 })).toBe('false')
  })

  it('一行文字比盒子宽时算被截', () => {
    expect(clipped({ width: 180, height: 40 })).toBe('true')
  })

  it('多行文字比盒子高时也算被截', () => {
    expect(clipped({ width: 100, height: 62 })).toBe('true')
  })

  it('多行文字被截时记下最后一整行的文字在哪里结束,淡出就在那里收尾;放得下时不记', () => {
    // Two lines of 20px show in the 40px box, the second ending at 72px; a third, hidden, starts below it.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 0, bottom: 40, width: 100 } as DOMRect)
    const rects = [{ top: 2, bottom: 18, right: 108, width: 98 }, { top: 22, bottom: 38, right: 82, width: 72 }, { top: 42, bottom: 58, right: 60, width: 50 }]
    vi.spyOn(document, 'createRange').mockReturnValue({ selectNodeContents() {}, getClientRects: () => rects } as unknown as Range)
    expect(measure({ width: 100, height: 62 }, true)).toEqual({ clipped: 'true', end: '72px' })
    expect(measure({ width: 100, height: 40 }, true)).toEqual({ clipped: 'false', end: '' })
  })
})

describe('isClipped', () => {
  /** A 100px by 40px box whose content is `width` by `height` px. */
  const box = (width: number, height: number) => ({ clientWidth: 100, clientHeight: 40, scrollWidth: width, scrollHeight: height }) as Element

  it('只按问的方向算:横向只看宽,纵向只看高,两个方向哪边放不下都算', () => {
    expect([isClipped(box(180, 40), 'x'), isClipped(box(180, 40), 'y'), isClipped(box(180, 40), 'both')]).toEqual([true, false, true])
    expect([isClipped(box(100, 62), 'x'), isClipped(box(100, 62), 'y'), isClipped(box(100, 62), 'both')]).toEqual([false, true, true])
  })

  it('取整多出的一像素不算被截', () => {
    expect(isClipped(box(101, 41), 'both')).toBe(false)
    expect(isClipped(box(102, 40), 'x')).toBe(true)
  })
})
