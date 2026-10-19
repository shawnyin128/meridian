// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IconButton } from './IconButton.js'
import { IconCross } from './icons.js'

describe('IconButton', () => {
  it('is named by its label, which the shared tooltip shows, and has no native title', () => {
    expect(renderToStaticMarkup(<IconButton label="收起详情"><IconCross /></IconButton>))
      .toBe(`<button type="button" class="icbtn" aria-label="收起详情" data-state="closed">${renderToStaticMarkup(<IconCross />)}</button>`)
  })

  it('takes one size class, a danger tone and the classes that place it', () => {
    const classOf = (html: string) => /class="([^"]*)"/.exec(html)![1]
    expect([
      classOf(renderToStaticMarkup(<IconButton label="x" size="nested"><IconCross /></IconButton>)),
      classOf(renderToStaticMarkup(<IconButton label="x" size="inline" tone="danger" className="rx"><IconCross /></IconButton>)),
    ]).toEqual(['icbtn sm', 'icbtn xs danger rx'])
  })

  it('reports a pressed toggle only when it is one', () => {
    expect(renderToStaticMarkup(<IconButton label="x" pressed><IconCross /></IconButton>)).toContain('aria-pressed="true"')
    expect(renderToStaticMarkup(<IconButton label="x" pressed={false}><IconCross /></IconButton>)).toContain('aria-pressed="false"')
    expect(renderToStaticMarkup(<IconButton label="x"><IconCross /></IconButton>)).not.toContain('aria-pressed')
  })
})
