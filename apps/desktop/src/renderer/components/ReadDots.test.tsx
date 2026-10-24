// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { readDotFills, ReadDots } from './ReadDots.js'

describe('ReadDots', () => {
  it('fills one dot per 已读, half-fills one per 在读 and rings every other state, read first, then reading, then the rest', () => {
    expect(readDotFills(['未读', '在读', '已读', '稍后阅读', '已读', '在读', '某个以后的状态']))
      .toEqual(['full', 'full', 'half', 'half', 'ring', 'ring', 'ring'])
    expect(readDotFills([])).toEqual([])
  })

  it('draws the dots on one fading line named by its label, with no text of its own', () => {
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(<ReadDots states={['未读', '已读', '在读']} label="已读 1/3" />)
    const line = host.firstElementChild!
    expect([line.className, line.getAttribute('role'), line.getAttribute('aria-label'), line.textContent])
      .toEqual(['fade-text read-dots', 'img', '已读 1/3', ''])
    expect([...line.children].map((dot) => dot.className)).toEqual([
      'status-dot status-dot--sm status-dot--neutral',
      'status-dot status-dot--sm status-dot--neutral status-dot--half',
      'status-dot status-dot--sm status-dot--neutral status-dot--ring',
    ])
  })
})
