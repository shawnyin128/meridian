// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { StatusDot } from './StatusDot.js'
import { TOOLTIP_DELAY } from './Tooltip.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('StatusDot', () => {
  it('without a label is a decorative small dot, hidden from assistive technology', () => {
    expect(renderToStaticMarkup(<StatusDot tone="good" />))
      .toBe('<span class="status-dot status-dot--sm status-dot--good" aria-hidden="true"></span>')
  })

  it('comes in three sizes, the third the mark of a navigation row, which can say that something new is waiting', () => {
    expect(renderToStaticMarkup(<StatusDot tone="warn" size="md" />)).toContain('status-dot--md status-dot--warn')
    expect(renderToStaticMarkup(<StatusDot tone="new" size="nav" />))
      .toBe('<span class="status-dot status-dot--nav status-dot--new" aria-hidden="true"></span>')
  })

  it('is filled by default, or half-filled, a hollow ring or a cross in its tone', () => {
    expect(renderToStaticMarkup(<StatusDot tone="neutral" fill="half" />))
      .toBe('<span class="status-dot status-dot--sm status-dot--neutral status-dot--half" aria-hidden="true"></span>')
    expect(renderToStaticMarkup(<StatusDot tone="neutral" fill="ring" />)).toContain('status-dot--neutral status-dot--ring')
    expect(renderToStaticMarkup(<StatusDot tone="bad" fill="cross" />)).toContain('status-dot--bad status-dot--cross')
  })

  it('writes its label after the dot, so the state does not rest on colour alone', () => {
    expect(renderToStaticMarkup(<StatusDot tone="bad" label="未找到" />)).toBe(
      '<span class="status-dot-labelled"><span class="status-dot status-dot--sm status-dot--bad" aria-hidden="true"></span>'
      + '<span class="fade-text status-dot-label">未找到</span></span>',
    )
  })

  it('in a dense row keeps the label as the dot\'s name and shows it in the shared tooltip, not a native title', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<StatusDot tone="neutral" label="候选 / 搁置" labelHidden />))
    const dot = host.querySelector('.status-dot')!
    expect([dot.getAttribute('role'), dot.getAttribute('aria-label'), dot.getAttribute('title')]).toEqual(['img', '候选 / 搁置', null])
    act(() => { dot.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
    act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('候选 / 搁置')
    act(() => root.unmount())
    vi.useRealTimers()
  })
})
