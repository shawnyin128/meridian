import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NavRow } from './NavRow.js'

describe('NavRow', () => {
  it('is one button that carries the selected state and marks itself a navigation row', () => {
    expect(renderToStaticMarkup(
      <NavRow className="srow" selected data-desk="papers" onActivate={() => undefined}>论文</NavRow>,
    )).toBe('<button type="button" class="nav-row srow on" data-nav-row="" data-desk="papers">论文</button>')
  })

  it('keeps a row with controls of its own a div, so no button is nested in another', () => {
    expect(renderToStaticMarkup(
      <NavRow className="srow" label="讨论" onActivate={() => undefined}><button type="button">…</button></NavRow>,
    )).toBe('<div class="srow" data-nav-row=""><button type="button" class="nav-row nav-row-label">讨论</button><button type="button">…</button></div>')
  })

  it('puts the fold of the group under a row with controls of its own right after its label', () => {
    const markup = renderToStaticMarkup(
      <NavRow
        className="srow" label="论文推送" onActivate={() => undefined}
        fold={{ label: '收起/展开「论文推送」', open: false, onToggle: () => undefined, controls: 'g-inboxsub' }}
      >{null}</NavRow>,
    )
    const [label, fold, rest] = markup.split('</button>')
    expect(label).toBe('<div class="srow" data-nav-row=""><button type="button" class="nav-row nav-row-label">论文推送')
    expect(fold).toMatch(/^<button [^>]*class="icbtn xs fold-toggle"[^>]*><span class="fold-caret is-closed"/)
    expect(['aria-label="收起/展开「论文推送」"', 'aria-expanded="false"', 'aria-controls="g-inboxsub"'].filter((held) => !fold!.includes(held)))
      .toEqual([])
    expect(rest).toBe('</div>')
  })
})
