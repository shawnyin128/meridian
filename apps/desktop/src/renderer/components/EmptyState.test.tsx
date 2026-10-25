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

  it('draws the option variant as the same line, its text where an option\'s text starts', () => {
    expect(renderToStaticMarkup(<EmptyState variant="option" icon={<svg />}>没有找到匹配的内容</EmptyState>))
      .toBe('<div class="empty-state empty-state--option"><span>没有找到匹配的内容</span></div>')
  })

  it('puts its one action after the sentence', () => {
    const html = renderToStaticMarkup(
      <EmptyState variant="page" action={<button type="button" className="btn">打开项目列表</button>}>还没有项目论文</EmptyState>,
    )
    expect(html).toBe('<div class="empty-state empty-state--page"><span>还没有项目论文</span>'
      + '<button type="button" class="btn">打开项目列表</button></div>')
  })

  it('keeps the page variant usable without an icon', () => {
    const html = renderToStaticMarkup(<EmptyState variant="page">都看过了。</EmptyState>)
    expect(html).toContain('class="empty-state empty-state--page"')
    expect(html).not.toContain('<svg')
  })
})
