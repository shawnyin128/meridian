// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { EntityLink } from './EntityLink.js'
import { TOOLTIP_DELAY } from './Tooltip.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('EntityLink', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })
  const html = (link: Parameters<typeof EntityLink>[0]) =>
    renderToStaticMarkup(<MessagesProvider><EntityLink {...link} /></MessagesProvider>)

  it('能打开的实体是一个按钮,打开时不让点击冒到它所在的行', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const onOpen = vi.fn()
    const onRow = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(
      <MessagesProvider><div onClick={onRow}><EntityLink kind="project" label="推测解码加速" onOpen={onOpen} /></div></MessagesProvider>,
    ))
    const link = host.querySelector<HTMLButtonElement>('.entity-link')!
    expect([link.tagName, link.className]).toEqual(['BUTTON', 'entity-link entity-link--project'])
    act(() => link.click())
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onRow).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('外部地址在浏览器里打开,末尾带外链标记;站内链接没有这个标记', () => {
    expect(html({ kind: 'external', label: '申请', href: 'https://example.com' })).toBe(
      '<a class="entity-link entity-link--external" href="https://example.com" target="_blank" rel="noreferrer">申请'
        + '<span class="entity-link-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"'
        + ' stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"></path><path d="M9 7h8v8"></path></svg></span></a>',
    )
    expect(html({ kind: 'page', label: '推测解码', href: '#wiki:topics/sd', onOpen: () => undefined })).not.toContain('entity-link-mark')
  })

  it('科研节点前面是它的状态点,用图例的词命名;名字太长时淡出', () => {
    const out = html({ kind: 'node', label: '树宽收益拐点', mode: 'supported', onOpen: () => undefined })
    expect(out).toMatch(/^<button type="button" class="entity-link entity-link--node">/)
    expect(out).toContain('<span class="status-dot status-dot--sm status-dot--good" role="img" aria-label="已验证" data-state="closed"></span>')
    expect(out).toContain('<span data-state="closed" class="fade-text">树宽收益拐点</span>')
    expect(out).not.toContain('title=')
  })

  it('名字被截断时共享 tooltip 显示节点全名,放得下时不弹;给了 title 的链接悬停显示它', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.useFakeTimers()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const tip = () => document.querySelector('[role="tooltip"]')?.textContent ?? null
    const hover = (element: Element) => {
      act(() => { element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
      act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
    }
    const leave = (element: Element) => {
      act(() => {
        element.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: document.body }))
        element.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
      })
      act(() => { document.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 400, pointerType: 'mouse' })) })
    }
    act(() => root.render(
      <MessagesProvider>
        <EntityLink kind="node" label="树宽收益拐点" mode="supported" onOpen={() => undefined} />
        <EntityLink kind="page" label="GPTQ" title="GPTQ: Accurate Post-Training Quantization" onOpen={() => undefined} />
      </MessagesProvider>,
    ))
    const name = host.querySelector<HTMLElement>('.entity-link--node .fade-text')!
    name.style.overflowX = 'hidden'
    const width = vi.spyOn(name, 'scrollWidth', 'get').mockReturnValue(80)
    vi.spyOn(name, 'clientWidth', 'get').mockReturnValue(80)
    hover(name)
    expect(tip()).toBeNull()
    leave(name)
    width.mockReturnValue(140)
    hover(name)
    expect(tip()).toBe('树宽收益拐点')
    leave(name)
    hover(host.querySelector('.entity-link--page')!)
    expect(tip()).toBe('GPTQ: Accurate Post-Training Quantization')
    expect(host.querySelector('[title]')).toBeNull()
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('不能打开时只是名字,不是链接', () => {
    expect(html({ kind: 'node', label: '宽树', mode: 'dead' })).toMatch(/^<span class="entity-link entity-link--node">/)
    expect(html({ kind: 'page', label: '推测解码' })).toBe('<span class="entity-link entity-link--page">推测解码</span>')
  })
})
