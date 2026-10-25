// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CountBadge } from './CountBadge.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('CountBadge', () => {
  it('shows a quiet count, and keeps a host class for placement', () => {
    expect(renderToStaticMarkup(<CountBadge count={79} />)).toBe('<span class="count-badge">79</span>')
    expect(renderToStaticMarkup(<CountBadge count={3} className="n" />))
      .toBe('<span class="count-badge n">3</span>')
  })

  it('shows zero instead of hiding itself; hosts that hide an empty count leave the badge out', () => {
    expect(renderToStaticMarkup(<CountBadge count={0} />)).toBe('<span class="count-badge">0</span>')
  })

  it('is a button in the same look when it opens what it counts', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const open = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => { root.render(<CountBadge count={3} label="查看 3 条笔记" onClick={open} />) })
    const badge = host.querySelector('button')!
    expect([badge.outerHTML]).toEqual([
      '<button type="button" class="count-badge" aria-label="查看 3 条笔记">3</button>',
    ])
    act(() => badge.click())
    expect(open).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
  })

  it('counts the items folded away as +N, and shows − while they are unfolded', () => {
    expect(renderToStaticMarkup(<CountBadge count={2} more={{ open: false }} label="展开其余 2 项" onClick={() => {}} />))
      .toBe('<button type="button" class="count-badge" aria-label="展开其余 2 项" aria-expanded="false">+2</button>')
    expect(renderToStaticMarkup(<CountBadge count={2} more={{ open: true }} label="收起其余 2 项" onClick={() => {}} />))
      .toBe('<button type="button" class="count-badge" aria-label="收起其余 2 项" aria-expanded="true">−</button>')
  })
})
