// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CollapsibleGroup } from './CollapsibleGroup.js'

describe('CollapsibleGroup', () => {
  it('省略 count 时不渲染计数徽标,给出 count 时渲染它', () => {
    const withCount = renderToStaticMarkup(
      <CollapsibleGroup title="标题" count={3} open onToggle={vi.fn()}>内容</CollapsibleGroup>,
    )
    expect(withCount).toContain('collapsible-group-count">3<')

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
