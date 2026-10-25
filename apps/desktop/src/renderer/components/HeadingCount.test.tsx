// @vitest-environment jsdom
import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CardTray } from './CardTray.js'
import { Group } from './GroupedList.js'
import { PageTitle, SectionHeading } from './PageShell.js'
import { TOOLTIP_DELAY, TooltipProvider } from './Tooltip.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const COUNT = '<span class="heading-count"> · 7</span>'

describe('标题的计数', () => {
  it('每种标题都把计数写在标题字后面，同一个 · N，跟着标题的字', () => {
    const html = (node: ReactNode) => renderToStaticMarkup(node)
    expect(html(<PageTitle count={7}>垃圾桶</PageTitle>)).toContain(`>垃圾桶${COUNT}</span>`)
    expect(html(<SectionHeading count={7}>对话</SectionHeading>))
      .toBe(`<div class="section-heading section-heading--section"><span>对话${COUNT}</span></div>`)
    expect(html(<SectionHeading level="group" count={7} actions={<button>新增</button>}>任务</SectionHeading>))
      .toBe(`<div class="section-heading section-heading--group"><span>任务${COUNT}</span><div class="section-heading-actions"><button>新增</button></div></div>`)
    expect(html(<Group title="已归档" count={7} fold={{ open: true, onToggle: vi.fn() }}>内容</Group>))
      .toContain(`<span><span class="collapsible-group-title">已归档</span>${COUNT}</span>`)
    expect(html(<Group title="今天" count={7}>内容</Group>)).toBe(`<div class="section-heading section-heading--group"><span>今天${COUNT}</span></div>内容`)
    expect(html(<CardTray variant="row" summary="版本史" count={7}><p>旧版</p></CardTray>)).toContain(`>版本史${COUNT}</span>`)
  })

  it('没有计数的标题不写 ·', () => {
    expect(renderToStaticMarkup(<SectionHeading>对话</SectionHeading>)).toBe('<div class="section-heading section-heading--section">对话</div>')
    expect(renderToStaticMarkup(<PageTitle>论文</PageTitle>)).not.toContain('heading-count')
    expect(renderToStaticMarkup(<Group title="昨天">内容</Group>)).toBe('<div class="section-heading section-heading--group">昨天</div>内容')
  })

  it('页面标题放不下时，提示里的整段标题带着计数', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(200)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    try {
      // The tooltip opens only on a box that clips its text, which the title's stylesheet makes it.
      act(() => { root.render(<TooltipProvider><PageTitle count={7} style={{ overflowX: 'hidden' }}>垃圾桶</PageTitle></TooltipProvider>) })
      const title = host.querySelector('.t')!
      expect(title.textContent).toBe('垃圾桶 · 7')
      act(() => { title.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
      act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
      expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('垃圾桶 · 7')
    } finally {
      act(() => root.unmount())
      host.remove()
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })
})
