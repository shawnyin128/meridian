import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DetailPanel } from './DetailPanel.js'

describe('DetailPanel', () => {
  it('exposes one open and closed state contract for inline and overlay panels', () => {
    const closed = renderToStaticMarkup(
      <DetailPanel open={false} mode="inline" className="fixture"><span>Details</span></DetailPanel>,
    )
    const open = renderToStaticMarkup(
      <DetailPanel open mode="overlay" className="fixture"><span>Details</span></DetailPanel>,
    )

    expect(closed).toContain('detail-panel--inline is-closed fixture')
    expect(closed).toContain('data-panel-state="closed"')
    expect(closed).toContain('aria-hidden="true"')
    expect(open).toContain('detail-panel--overlay is-open fixture')
    expect(open).toContain('data-panel-state="open"')
    expect(open).toContain('aria-hidden="false"')
  })

  it('keeps a resized information rail accessible while it changes width', () => {
    const html = renderToStaticMarkup(
      <DetailPanel as="aside" open={false} mode="resize"><span>Properties</span></DetailPanel>,
    )

    expect(html).toContain('<aside')
    expect(html).not.toContain('aria-hidden')
  })
})
