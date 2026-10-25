// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Style = { textOverflow: string; maskImage: string; fontSize: string; whiteSpace: string; height: string; getPropertyValue(name: string): string }
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): object | null }
  getComputedStyle(element: object): Style
}
const { document, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')
const SHEETS = [
  'shell/tokens.css', 'components/FadeText.css', 'components/Item.css',
  'components/Table.css', 'components/paper-table/PaperTable.css', 'routes/Wiki.css',
]

/**
 * A row of the paper table, with a title cut off, a text cell that fits and a chip cell cut off (the
 * table marks a cut text `table-cut`); a research map group and its detail head, each a name above the line
 * of its kind or count; and a Wiki home paper card.
 */
const MARKUP = `<table class="table ptable"><tbody><tr class="table-row">
  <td class="table-cell--title pt-title"><span class="table-text table-cut" id="cut"><button class="table-open">Speculative Decoding with Big Little Decoder</button></span></td>
  <td class="table-cell--meta"><span class="table-text" id="fits">2024</span></td>
  <td><span class="table-chips" id="chips"><span class="tag tag--chip tagchip">推理</span></span></td>
</tr></tbody></table>
<div class="item item--row item--slotted item--two-line research-map-group"><span class="item-main"><span class="item-title"><span class="fade-text research-map-group-name" id="group">KV cache 量化</span></span><span class="item-meta"><span>项目关联</span></span></span></div>
<div class="research-map-detail-head"><div><span class="fade-text research-map-detail-name" id="detail">KV cache 量化</span><span>3 篇论文</span></div></div>
<article class="item item--card item--slotted wkcard wkcard--paper"><div class="item-head"><div class="item-leading"><span class="tag">论文</span></div>
  <div class="item-main"><div class="item-title"><button class="item-open tt" id="paper-title"><span class="tt-lines fade-lines" id="paper-lines">EAGLE: Speculative Sampling Requires Rethinking Feature Uncertainty</span></button></div></div>
</div><span class="fade-text wm" id="paper-meta">2024 arXiv · 推测解码</span></article>`

describe('标题放不下时', () => {
  beforeAll(() => {
    document.head.innerHTML = `<style>${SHEETS.map((path) => readFileSync(join(RENDERER, path), 'utf8')).join('\n')}</style>`
    document.body.innerHTML = MARKUP
  })

  const style = (id: string) => getComputedStyle(document.querySelector(`#${id}`)!)

  it('论文表里放不下的文字格和别处的一行标题一样淡出，不出省略号；放得下的格子和标签格不淡', () => {
    expect([style('cut').textOverflow, style('cut').maskImage]).toEqual(['clip', 'var(--clipfade)'])
    expect([style('fits').textOverflow, style('fits').maskImage]).toEqual(['clip', 'none'])
    expect([style('chips').textOverflow, style('chips').maskImage]).toEqual(['clip', 'none'])
  })

  it('研究地图的分组名和选中分组的名字淡出时保持自己的字号，不跟着下面那一行变小', () => {
    expect([style('group').fontSize, style('detail').fontSize]).toEqual(['var(--fs-item-title)', 'var(--fs-group)'])
  })

  it('Wiki 首页论文卡片的标题最多占两行，不用省略号截断，下面的年份、会场和主题只占一行', () => {
    expect([style('paper-title').whiteSpace, style('paper-title').maskImage]).toEqual(['normal', 'none'])
    expect([style('paper-lines').height, style('paper-lines').getPropertyValue('-webkit-line-clamp')]).toEqual(['48px', ''])
    expect([style('paper-meta').whiteSpace, style('paper-meta').height]).toEqual(['nowrap', 'auto'])
  })
})
