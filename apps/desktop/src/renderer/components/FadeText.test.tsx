// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FadeText } from './FadeText.js'
import { Tooltip, TOOLTIP_DELAY } from './Tooltip.js'

describe('FadeText', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  const render = (scrollWidth: number, clientWidth: number): string => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth)
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(<FadeText className="record-line">三个模块的消融</FadeText>))
    const className = host.querySelector('.fade-text')!.className
    act(() => root.unmount())
    return className
  }

  it('放得下时整段显示,不淡出', () => {
    expect(render(80, 120)).toBe('fade-text record-line')
  })

  it('放不下时才在右边淡出', () => {
    expect(render(200, 120)).toBe('fade-text record-line clipped')
  })

  it('展开式的文字折行，平时只露一行、放不下时淡出，停在上面一会儿就向下展开整段，移开就收回', () => {
    vi.useFakeTimers()
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(60)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(20)
    vi.spyOn(document, 'createRange').mockReturnValue({ selectNodeContents() {}, getClientRects: () => [] } as unknown as Range)
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(<FadeText className="record-line" expand>宽度扫描：B=16 时动态树宽比固定宽度 4 快 2.6×</FadeText>))
    const box = host.querySelector<HTMLElement>('.fade-text')!
    expect(box.className).toBe('fade-text fade-lines fade-expand record-line clipped')
    act(() => { box.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) })
    act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY - 1) })
    expect(box.classList.contains('is-open')).toBe(false)
    act(() => { vi.advanceTimersByTime(1) })
    expect(box.classList.contains('is-open')).toBe(true)
    act(() => { box.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: host })) })
    expect(box.classList.contains('is-open')).toBe(false)
    act(() => root.unmount())
    vi.useRealTimers()
  })

  it('展开式的文字自己展开，不另弹 tooltip', () => {
    expect(renderToStaticMarkup(<FadeText expand>动态树宽度的实现讨论</FadeText>))
      .toBe('<span class="fade-text fade-lines fade-expand">动态树宽度的实现讨论</span>')
  })

  it('有 label 时自己是 tooltip 的元素;放在别的 tooltip 里时让外面那个来说全名,不再叠一个', () => {
    expect(renderToStaticMarkup(<FadeText label="动态树宽度的实现讨论">动态树宽度的实现讨论</FadeText>))
      .toBe('<span class="fade-text" data-state="closed">动态树宽度的实现讨论</span>')
    expect(renderToStaticMarkup(
      <Tooltip label="动态树宽度的实现讨论"><span className="row"><FadeText label="动态树宽度的实现讨论">动态树宽度的实现讨论</FadeText></span></Tooltip>,
    )).toBe('<span class="row" data-state="closed"><span class="fade-text">动态树宽度的实现讨论</span></span>')
  })
})
