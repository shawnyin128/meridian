import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EMBEDDED_LIST_ROW_LIMIT, StructuredList, StructuredRow } from './StructuredList.js'

describe('StructuredList', () => {
  it('uses a button only for an actionable row', () => {
    const interactive = renderToStaticMarkup(
      <StructuredList><StructuredRow onActivate={() => undefined}>项目</StructuredRow></StructuredList>,
    )
    const staticRow = renderToStaticMarkup(
      <StructuredList><StructuredRow>项目</StructuredRow></StructuredList>,
    )
    expect(interactive).toContain('<button')
    expect(staticRow).toContain('<div class="structured-row"')
  })

  it('keeps a composite row a div so the controls inside it are never nested in a button', () => {
    const html = renderToStaticMarkup(
      <StructuredRow composite onActivate={() => undefined}><button type="button">归档</button></StructuredRow>,
    )
    expect(html).toBe(
      '<div class="structured-row structured-row--composite"><button type="button">归档</button></div>',
    )
  })

  it('marks the row whose detail is open with the shared selected variant', () => {
    expect(renderToStaticMarkup(<StructuredRow selected onActivate={() => undefined}>项目</StructuredRow>))
      .toContain('class="structured-row structured-row--selected"')
    expect(renderToStaticMarkup(<StructuredRow onActivate={() => undefined}>项目</StructuredRow>))
      .not.toContain('structured-row--selected')
  })

  it('accepts a route-specific column contract', () => {
    const html = renderToStaticMarkup(
      <StructuredRow columns="100px minmax(0, 1fr)">项目</StructuredRow>,
    )
    expect(html).toContain('grid-template-columns:100px minmax(0, 1fr)')
  })

  it('accepts a DOM ref for a static composite row', () => {
    const row = createRef<HTMLDivElement>()
    const html = renderToStaticMarkup(<StructuredRow rowRef={row}>项目</StructuredRow>)
    expect(html).toContain('class="structured-row"')
  })

  it('marks an embedded list so only its adjacent rows receive separators', () => {
    const html = renderToStaticMarkup(
      <StructuredList variant="embedded">
        <StructuredRow>想法一</StructuredRow>
        <StructuredRow>想法二</StructuredRow>
      </StructuredList>,
    )
    expect(html).toContain('class="structured-list structured-list--embedded"')
    expect(html.match(/class="structured-row"/g)).toHaveLength(2)
  })

  it('keeps five embedded rows in normal page flow', () => {
    const html = renderToStaticMarkup(
      <StructuredList variant="embedded">
        {Array.from({ length: EMBEDDED_LIST_ROW_LIMIT }, (_, index) => (
          <StructuredRow key={index}>想法 {index + 1}</StructuredRow>
        ))}
      </StructuredList>,
    )
    expect(html).not.toContain('structured-list--scrollable')
  })

  it('scrolls embedded rows after the fifth row', () => {
    const html = renderToStaticMarkup(
      <StructuredList variant="embedded">
        {Array.from({ length: EMBEDDED_LIST_ROW_LIMIT + 1 }, (_, index) => (
          <StructuredRow key={index}>想法 {index + 1}</StructuredRow>
        ))}
      </StructuredList>,
    )
    expect(html).toContain('structured-list--embedded structured-list--scrollable')
    expect(html).toContain('--structured-list-visible-rows:5')
  })
})
