// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Style = { gridTemplateColumns: string; width: string }
type Window = {
  document: {
    head: { innerHTML: string }
    body: { innerHTML: string }
    querySelector(selector: string): object
  }
  getComputedStyle(element: object): Style
}
const { document, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '../renderer')
const STYLES = ['routes/shell.css', 'components/project/ProjectSignals.css', 'components/wiki/WikiTidy.css']
  .map((path) => readFileSync(join(RENDERER, path), 'utf8')).join('\n')

// The markup TidyList renders for two rows, one with the longest kind tag.
const LIST = `
  <div class="list list--embedded attn project-signal-columns tidy-list" id="list">
    <div class="item item--row item--actionable attnrow tidy-row" id="long">
      <span class="project-signal-kind" id="long-kind"><span class="tag">未归入主题</span></span><span class="tidy-what"></span>
    </div>
    <div class="item item--row item--actionable attnrow tidy-row" id="short">
      <span class="project-signal-kind" id="short-kind"><span class="tag">结论冲突</span></span><span class="tidy-what"></span>
    </div>
  </div>`

describe('需要整理的种类列', () => {
  beforeEach(() => {
    document.head.innerHTML = `<style>${STYLES}</style>`
    document.body.innerHTML = LIST
  })

  const style = (id: string) => getComputedStyle(document.querySelector(`#${id}`))

  it('所有行共用一列,和最长的种类标签一样宽,不按固定宽度截掉', () => {
    expect(style('list').gridTemplateColumns).toMatch(/^max-content /)
    expect(['long', 'short'].map((id) => style(id).gridTemplateColumns)).toEqual(['subgrid', 'subgrid'])
    expect(['long-kind', 'short-kind'].map((id) => style(id).width)).toEqual(['auto', 'auto'])
  })
})
