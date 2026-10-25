// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CollapsibleGroup } from './CollapsibleGroup.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('CollapsibleGroup', () => {
  it('省略 count 时不写条数,给出 count 时像分节标题一样在标题后写 · N,不画徽标', () => {
    const withCount = renderToStaticMarkup(
      <CollapsibleGroup title="标题" count={3} open onToggle={vi.fn()}>内容</CollapsibleGroup>,
    )
    expect(withCount).toContain('<span class="collapsible-group-label"><span class="collapsible-group-title">标题</span><span class="collapsible-group-count"> · 3</span></span>')
    expect(withCount).not.toContain('count-badge')

    const withoutCount = renderToStaticMarkup(
      <CollapsibleGroup title="标题" open onToggle={vi.fn()}>内容</CollapsibleGroup>,
    )
    expect(withoutCount).not.toContain('collapsible-group-count')
  })

  it('分组标题是共享的折叠钮：箭头跟在标题和条数后面，报出展开与否和它折叠的分组内容；收起时箭头转向', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    for (const variant of ['section', 'quiet'] as const) {
      act(() => root.render(<CollapsibleGroup title="主题" count={2} open onToggle={vi.fn()} variant={variant}>内容</CollapsibleGroup>))
      const toggle = host.querySelector<HTMLButtonElement>('.collapsible-group-toggle')!
      expect([...toggle.children].map((child) => child.className), variant).toEqual(['collapsible-group-label', 'fold-caret'])
      expect(document.getElementById(toggle.getAttribute('aria-controls')!), variant).toBe(host.querySelector('.collapsible-group-body'))
      act(() => root.render(<CollapsibleGroup title="主题" count={2} open={false} onToggle={vi.fn()} variant={variant}>内容</CollapsibleGroup>))
      expect([toggle.getAttribute('aria-expanded'), toggle.lastElementChild!.matches('.is-closed')], variant).toEqual(['false', true])
    }
    act(() => root.unmount())
    host.remove()
  })

  it('quiet 变体带上安静样式的类名,默认变体不带', () => {
    const quiet = renderToStaticMarkup(
      <CollapsibleGroup title="已归档" open={false} onToggle={vi.fn()} variant="quiet">内容</CollapsibleGroup>,
    )
    expect(quiet).toContain('collapsible-group--quiet')

    const section = renderToStaticMarkup(
      <CollapsibleGroup title="标题" count={1} open={false} onToggle={vi.fn()}>内容</CollapsibleGroup>,
    )
    expect(section).not.toContain('collapsible-group--quiet')
  })

  it('列表出现时开着的分组和由外部打开的分组都直接整组显示,只有点标题打开的分组才长出来', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    const root = createRoot(host)
    const body = () => host.querySelector('.collapsible-group-body')
    const render = (open: boolean) => act(() => root.render(
      <CollapsibleGroup title="标题" open={open} onToggle={vi.fn()}>内容</CollapsibleGroup>,
    ))
    const clickToggle = () => act(() => host.querySelector<HTMLButtonElement>('.collapsible-group-toggle')!.click())

    render(true)
    expect(body()?.className).toBe('collapsible-group-body')
    clickToggle()
    render(false)
    clickToggle()
    render(true)
    expect(body()?.className).toBe('collapsible-group-body is-opening')
    clickToggle()
    render(false)
    render(true)
    expect(body()?.className).toBe('collapsible-group-body')
    act(() => root.unmount())
  })
})
