import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NavRow } from './NavRow.js'

describe('NavRow', () => {
  it('is one button that carries the selected and expanded state', () => {
    expect(renderToStaticMarkup(
      <NavRow className="srow" selected expanded={false} data-desk="papers" onActivate={() => undefined}>论文</NavRow>,
    )).toBe('<button type="button" class="nav-row srow on" aria-expanded="false" data-desk="papers">论文</button>')
  })

  it('keeps a row with controls of its own a div, so no button is nested in another', () => {
    expect(renderToStaticMarkup(
      <NavRow className="srow" label="讨论" onActivate={() => undefined}><button type="button">…</button></NavRow>,
    )).toBe('<div class="srow"><button type="button" class="nav-row nav-row-label">讨论</button><button type="button">…</button></div>')
  })
})
