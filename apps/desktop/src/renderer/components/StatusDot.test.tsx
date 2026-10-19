import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StatusDot } from './StatusDot.js'

describe('StatusDot', () => {
  it('without a label is a decorative small dot, hidden from assistive technology', () => {
    expect(renderToStaticMarkup(<StatusDot tone="good" />))
      .toBe('<span class="status-dot status-dot--sm status-dot--good" aria-hidden="true"></span>')
  })

  it('comes in two sizes', () => {
    expect(renderToStaticMarkup(<StatusDot tone="warn" size="md" />)).toContain('status-dot--md status-dot--warn')
  })

  it('writes its label after the dot, so the state does not rest on colour alone', () => {
    expect(renderToStaticMarkup(<StatusDot tone="bad" label="未找到" />)).toBe(
      '<span class="status-dot-labelled"><span class="status-dot status-dot--sm status-dot--bad" aria-hidden="true"></span>'
      + '<span class="status-dot-label">未找到</span></span>',
    )
  })

  it('in a dense row keeps the label as the dot\'s name and tooltip instead of visible text', () => {
    expect(renderToStaticMarkup(<StatusDot tone="neutral" label="候选 / 搁置" labelHidden />))
      .toBe('<span class="status-dot status-dot--sm status-dot--neutral" role="img" aria-label="候选 / 搁置" title="候选 / 搁置"></span>')
  })
})
