import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EmptyState } from './EmptyState.js'

describe('EmptyState', () => {
  it('draws the page variant as a centred icon plus one sentence', () => {
    const html = renderToStaticMarkup(
      <EmptyState variant="page" icon={<svg />}>还没有论文推送。</EmptyState>,
    )
    expect(html).toContain('class="empty-state empty-state--page"')
    expect(html).toContain('<svg')
    expect(html).toContain('还没有论文推送。')
  })

  it('draws the section variant as one grey line without an icon slot', () => {
    const html = renderToStaticMarkup(
      <EmptyState variant="section" icon={<svg />}>暂无关联想法。</EmptyState>,
    )
    expect(html).toContain('class="empty-state empty-state--section"')
    expect(html).not.toContain('<svg')
  })

  it('keeps the page variant usable without an icon', () => {
    const html = renderToStaticMarkup(<EmptyState variant="page">都看过了。</EmptyState>)
    expect(html).toContain('class="empty-state empty-state--page"')
    expect(html).not.toContain('<svg')
  })
})
