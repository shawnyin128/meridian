// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { SourceAnchor } from './SourceAnchor.js'

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

  it('悬停和聚焦都显示它锚定的原文,离开或失焦就收起;没有原文时什么也不弹', () => {
    const quoted = mount('wide trees amortize')
    act(() => { quoted.anchor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) })
    const tip = document.querySelector('.source-anchor-quote')!
    expect(tip.textContent).toBe('p.7 · 原文“wide trees amortize”')
    expect(quoted.anchor.getAttribute('aria-describedby')).toBe(tip.id)
    act(() => { quoted.anchor.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })) })
    expect(document.querySelector('.source-anchor-quote')).toBeNull()
    act(() => quoted.anchor.focus())
    expect(document.querySelector('.source-anchor-quote')).not.toBeNull()
    act(() => quoted.anchor.blur())
    expect(document.querySelector('.source-anchor-quote')).toBeNull()
    quoted.done()

    const bare = mount()
    act(() => bare.anchor.focus())
    expect(document.querySelector('.source-anchor-quote')).toBeNull()
    bare.done()
  })
})
