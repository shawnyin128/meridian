// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Style = { gridTemplateColumns: string; gridColumn: string; width: string; whiteSpace: string }
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
const STYLES = ['components/PropertyList.css', 'routes/shell.css', 'components/wiki/ReviewQueue.css', 'components/wiki/ProposalChange.css']
  .map((path) => readFileSync(join(RENDERER, path), 'utf8')).join('\n')

// The markup ReviewQueue and PropertyList render for a card whose change rests on a project conclusion and a source passage, and that writes one more page.
const CARD = `
  <div class="item item--row review-row">
    <div class="proposal-card" id="card">
      <div class="proposal-change" id="change">
        <div class="proposal-where"><span class="tag">添加结论</span><span class="proposal-target">推测解码</span></div>
        <p class="proposal-text proposal-text--new">x</p>
        <dl class="property-list property-list--aligned proposal-rows" id="grounds">
          <div class="property" id="row"><dt class="property-label" id="long">实验结论</dt><dd class="property-value" id="value"><div class="proposal-value">项目 › 节点</div></dd></div>
          <div class="property"><dt class="property-label" id="short">原文</dt><dd class="property-value"><div class="proposal-value">EAGLE · p.1</div></dd></div>
        </dl>
      </div>
      <dl class="property-list property-list--aligned proposal-rows" id="pages"><div class="property"><dt class="property-label" id="other">涉及</dt><dd class="property-value">树形草稿</dd></div></dl>
    </div>
  </div>`

describe('审阅卡片的标签列', () => {
  beforeEach(() => {
    document.head.innerHTML = `<style>${STYLES}</style>`
    document.body.innerHTML = CARD
  })

  const style = (id: string) => getComputedStyle(document.querySelector(`#${id}`))

  it('一张卡片的标签行共用一列,和最长的标签一样宽:实验结论一行放下,原文与涉及的内容和它对齐', () => {
    expect(style('card').gridTemplateColumns).toMatch(/^max-content /)
    expect(['change', 'grounds', 'row', 'pages'].map((id) => [style(id).gridTemplateColumns, style(id).gridColumn]))
      .toEqual([['subgrid', '1/-1'], ['subgrid', '1/-1'], ['subgrid', '1/-1'], ['subgrid', '1/-1']])
    expect(['long', 'short', 'other'].map((id) => [style(id).width, style(id).whiteSpace])).toEqual([['auto', 'nowrap'], ['auto', 'nowrap'], ['auto', 'nowrap']])
  })
})
