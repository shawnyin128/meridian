// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CardOpen, ResearchObjectCard } from './ResearchObjectCard.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('ResearchObjectCard', () => {
  it('owns the shared project and idea card shell', () => {
    const html = renderToStaticMarkup(
      <ResearchObjectCard className="domain-card" selected muted onActivate={() => undefined}>
        研究对象
      </ResearchObjectCard>,
    )
    expect(html).toContain('research-object-card selected muted domain-card')
    expect(html).toContain('data-actionable=""')
    expect(html).toContain('data-row-actions=""')
  })

  it('an actionable card is composite: it is no button itself and holds the button that opens it', () => {
    const html = renderToStaticMarkup(
      <ResearchObjectCard onActivate={() => undefined}>
        <CardOpen>MoE 路由分析</CardOpen><button type="button">更多</button>
      </ResearchObjectCard>,
    )
    expect(html).not.toContain('role="button"')
    expect(html).not.toContain('tabindex=')
    expect(html).toContain('<button type="button" class="research-object-card-open">MoE 路由分析</button>')
  })

  it('opens once from its name button and once from a click elsewhere on the card', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const onActivate = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(
      <ResearchObjectCard onActivate={onActivate}>
        <CardOpen>MoE 路由分析</CardOpen><p>统计各层路由的负载分布</p>
      </ResearchObjectCard>,
    ))
    act(() => host.querySelector<HTMLButtonElement>('.research-object-card-open')!.click())
    expect(onActivate).toHaveBeenCalledTimes(1)
    act(() => host.querySelector('p')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onActivate).toHaveBeenCalledTimes(2)
    act(() => root.unmount())
    host.remove()
  })

  it('lays a grid card out with the grid variant of the same shell', () => {
    expect(renderToStaticMarkup(<ResearchObjectCard variant="grid" className="wkcard">主题</ResearchObjectCard>))
      .toContain('class="research-object-card research-object-card--grid wkcard"')
  })

  it('does not claim button semantics without an activation action', () => {
    const html = renderToStaticMarkup(<ResearchObjectCard>新建项目</ResearchObjectCard>)
    expect(html).not.toContain('role="button"')
    expect(html).not.toContain('tabindex=')
    expect(html).not.toContain('data-actionable')
  })
})
