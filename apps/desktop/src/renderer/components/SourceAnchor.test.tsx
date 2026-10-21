// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { SourceAnchor } from './SourceAnchor.js'
import { TOOLTIP_DELAY } from './Tooltip.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('SourceAnchor', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
  })

  const mount = (quote?: string) => {
    const onOpen = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<MessagesProvider><SourceAnchor page={7} quote={quote} onOpen={onOpen} /></MessagesProvider>))
    const anchor = host.querySelector<HTMLButtonElement>('.source-anchor')!
    return { anchor, onOpen, done: () => { act(() => root.unmount()); host.remove() } }
  }

  it('标签处处一样是 p.N,名字说出是原文第几页,点它打开那一页', () => {
    const { anchor, onOpen, done } = mount()
    expect([anchor.tagName, anchor.textContent, anchor.getAttribute('aria-label')]).toEqual(['BUTTON', 'p.7', '原文第 7 页'])
    act(() => anchor.click())
    expect(onOpen).toHaveBeenCalledOnce()
    done()
  })

  it('悬停和键盘聚焦都在共享 tooltip 里显示它锚定的原文,离开或失焦就收起;没有原文时什么也不弹', () => {
    const tip = () => document.querySelector('[role="tooltip"]')
    const keyboardFocus = (anchor: HTMLElement) => act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
      anchor.focus()
    })
    const quoted = mount('wide trees amortize')
    vi.useFakeTimers()
    act(() => { quoted.anchor.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
    act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
    vi.useRealTimers()
    expect(tip()!.textContent).toBe('“wide trees amortize”')
    expect(quoted.anchor.getAttribute('aria-describedby')).toBe(tip()!.id)
    act(() => {
      quoted.anchor.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: document.body }))
      quoted.anchor.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
    })
    act(() => { document.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 400, pointerType: 'mouse' })) })
    expect(tip()).toBeNull()
    keyboardFocus(quoted.anchor)
    expect(tip()!.textContent).toBe('“wide trees amortize”')
    act(() => quoted.anchor.blur())
    expect(tip()).toBeNull()
    quoted.done()

    const bare = mount()
    keyboardFocus(bare.anchor)
    expect(tip()).toBeNull()
    bare.done()
  })

  it('跟在文字后面时,锚点连同它前面的分隔是一段不断行的内容,紧贴那段文字的最后一个字', () => {
    const host = document.createElement('p')
    document.body.append(host)
    const root = createRoot(host)
    const parts = () => [...host.childNodes].map((node) => (node instanceof Element ? `${node.className}|${node.textContent}` : node.textContent))
    act(() => root.render(<MessagesProvider>W4<SourceAnchor page={7} separator=" " onOpen={() => undefined} /></MessagesProvider>))
    expect(parts()).toEqual(['W4', 'source-anchor-keep| p.7'])
    act(() => root.render(<MessagesProvider>可忽略。<SourceAnchor page={7} onOpen={() => undefined} /></MessagesProvider>))
    expect(parts()).toEqual(['可忽略。', 'source-anchor-keep|p.7'])
    expect(host.querySelector('.source-anchor-keep > .source-anchor')).not.toBeNull()
    act(() => root.unmount())
    host.remove()
  })
})
