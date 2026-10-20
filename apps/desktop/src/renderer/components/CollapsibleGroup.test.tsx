// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CollapsibleGroup } from './CollapsibleGroup.js'

describe('CollapsibleGroup', () => {
  it('省略 count 时不写条数,给出 count 时像分节标题一样在标题后写 · N,不画徽标', () => {
    const withCount = renderToStaticMarkup(
      <CollapsibleGroup title="标题" count={3} open onToggle={vi.fn()}>内容</CollapsibleGroup>,
    )
    expect(withCount).toContain('<span class="collapsible-group-title">标题</span><span class="collapsible-group-count">· 3</span>')
    expect(withCount).not.toContain('count-badge')

    const withoutCount = renderToStaticMarkup(
      <CollapsibleGroup title="标题" open onToggle={vi.fn()}>内容</CollapsibleGroup>,
    )
    expect(withoutCount).not.toContain('collapsible-group-count')
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
})
