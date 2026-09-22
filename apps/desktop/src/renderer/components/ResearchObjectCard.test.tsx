import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ResearchObjectCard } from './ResearchObjectCard.js'

describe('ResearchObjectCard', () => {
  it('owns the shared project and idea card shell', () => {
    const html = renderToStaticMarkup(
      <ResearchObjectCard className="domain-card" selected muted onActivate={() => undefined}>
        研究对象
      </ResearchObjectCard>,
    )
    expect(html).toContain('research-object-card selected muted domain-card')
    expect(html).toContain('data-actionable=""')
    expect(html).toContain('role="button"')
    expect(html).toContain('tabindex="0"')
  })

  it('does not claim button semantics without an activation action', () => {
    const html = renderToStaticMarkup(<ResearchObjectCard>新建项目</ResearchObjectCard>)
    expect(html).not.toContain('role="button"')
    expect(html).not.toContain('tabindex=')
  })
})
