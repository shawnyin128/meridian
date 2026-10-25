// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Style = { gridTemplateColumns: string; gridColumn: string; whiteSpace: string }
type Window = {
  document: {
    head: { innerHTML: string }
    body: { innerHTML: string }
    querySelector(selector: string): object
  }
  getComputedStyle(element: object): Style
}
const { document, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '../renderer/components')
/** The stylesheets of a draft and its field rows, in bundle order. */
const STYLES = ['FormControls.css', 'DraftForm.css'].map((file) => readFileSync(join(RENDERER, file), 'utf8')).join('\n')

// The markup DraftForm and FieldRow render for a claim's conflict draft, plus a row without a label.
const DRAFT = `
  <div class="draft-form" id="form">
    <input class="form-control form-input form-control-field" id="text">
    <div class="field-row" id="long-line">
      <label class="field-row-label" id="long">与哪一条冲突</label>
      <div class="field-row-field" id="long-fields"><button class="form-control form-button form-control-field choice-picker"></button></div>
    </div>
    <div class="field-row" id="short-line">
      <label class="field-row-label" id="short">说明</label>
      <div class="field-row-field" id="short-fields"><input class="form-control form-input form-control-field"></div>
    </div>
    <div class="field-row" id="bare-line"><div class="field-row-field" id="bare-fields">实验</div></div>
    <div class="draft-form-foot" id="foot"></div>
  </div>`

describe('就地草稿的标签列', () => {
  beforeEach(() => {
    document.head.innerHTML = `<style>${STYLES}</style>`
    document.body.innerHTML = DRAFT
  })

  const style = (id: string) => getComputedStyle(document.querySelector(`#${id}`))

  it('一份草稿的带标签的行共用一列,和最长的标签一样宽:每行的栏位从同一处开始;没有标签的行和其余部分占满整行', () => {
    expect(style('form').gridTemplateColumns).toMatch(/^max-content /)
    expect(['text', 'long-line', 'short-line', 'bare-line', 'foot'].map((id) => style(id).gridColumn))
      .toEqual(['1/-1', '1/-1', '1/-1', '1/-1', '1/-1'])
    expect(['long-line', 'short-line', 'bare-line'].map((id) => style(id).gridTemplateColumns)).toEqual(['subgrid', 'subgrid', 'subgrid'])
    expect(['long', 'short'].map((id) => [style(id).gridColumn, style(id).whiteSpace])).toEqual([['1', 'nowrap'], ['1', 'nowrap']])
    expect(['long-fields', 'short-fields', 'bare-fields'].map((id) => style(id).gridColumn)).toEqual(['2', '2', '1/-1'])
  })
})
