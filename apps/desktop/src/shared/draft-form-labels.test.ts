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

const STYLES = readFileSync(join(import.meta.dirname, '../renderer/components/DraftForm.css'), 'utf8')

// The markup DraftForm and DraftLine render for a claim's conflict draft, plus a line without a label.
const DRAFT = `
  <div class="draft-form" id="form">
    <input class="form-control form-input" id="text">
    <div class="draft-form-line" id="long-line">
      <span class="draft-form-label" id="long">与哪一条冲突</span>
      <div class="draft-form-fields" id="long-fields"><button class="form-control choice-picker"></button></div>
    </div>
    <div class="draft-form-line" id="short-line">
      <span class="draft-form-label" id="short">说明</span>
      <div class="draft-form-fields" id="short-fields"><input class="form-control form-input"></div>
    </div>
    <div class="draft-form-line" id="bare-line"><div class="draft-form-fields" id="bare-fields">实验</div></div>
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
