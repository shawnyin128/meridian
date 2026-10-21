// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Style = { gridTemplateColumns: string; width: string; whiteSpace: string }
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
const STYLES = ['routes/shell.css', 'components/wiki/ReviewQueue.css'].map((path) => readFileSync(join(RENDERER, path), 'utf8')).join('\n')

// The markup ReviewQueue renders for a card that cites an unverified experiment conclusion and writes one page.
const CARD = `
  <div class="structured-row review-row" id="card">
    <div class="review-head"><span class="review-title">提案</span></div>
    <div class="wkrel review-unverified" id="unverified"><span class="rl" id="long">实验结论</span><span class="review-links"><button class="tagchip">加宽实验</button></span></div>
    <div class="review-change" id="change">
      <div class="wkrel review-target" id="target"><span class="rl" id="short">写入</span><span class="review-links"><button class="tagchip">推测解码</button></span></div>
      <div class="diff"><div>+ 添加结论：x</div></div>
    </div>
  </div>`

describe('审阅卡片的标签列', () => {
  beforeEach(() => {
    document.head.innerHTML = `<style>${STYLES}</style>`
    document.body.innerHTML = CARD
  })

  const style = (id: string) => getComputedStyle(document.querySelector(`#${id}`))

  it('一张卡片的标签行共用一列,和最长的标签一样宽:实验结论一行放下,写入那一行的链接和它对齐', () => {
    expect(style('card').gridTemplateColumns).toMatch(/^max-content /)
    expect(['change', 'unverified', 'target'].map((id) => style(id).gridTemplateColumns)).toEqual(['subgrid', 'subgrid', 'subgrid'])
    expect(['long', 'short'].map((id) => [style(id).width, style(id).whiteSpace])).toEqual([['auto', 'nowrap'], ['auto', 'nowrap']])
  })
})
