// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Window = {
  document: {
    head: { innerHTML: string }
    body: { innerHTML: string }
    querySelector(selector: string): object
  }
  getComputedStyle(element: object): { position: string }
}
const { document, getComputedStyle } = globalThis as unknown as Window

const STYLES = readFileSync(join(import.meta.dirname, '../renderer/components/CardTray.css'), 'utf8')

// The markup CardTray renders for a composite row whose summary names an entity with a link.
const ROW = `
  <div class="card-tray card-tray--row"><div class="card-tray-head"><div class="card-tray-press">
    <button class="card-tray-toggle" type="button" aria-expanded="false" aria-labelledby="s"></button>
    <span class="card-tray-chevron"></span>
    <span class="fade-text card-tray-summary" id="s">项目「<a class="entity-link" href="#project:draft">draft 效率</a>」· 改了字段</span>
  </div></div></div>`

describe('composite 行的展开钮', () => {
  beforeEach(() => {
    document.head.innerHTML = `<style>${STYLES}</style>`
    document.body.innerHTML = ROW
  })

  it('铺在箭头和摘要上面,点它们哪里都展开;摘要里的链接排在它后面且有定位,盖在它上面', () => {
    const position = (selector: string) => getComputedStyle(document.querySelector(selector)).position
    expect(['.card-tray-press', '.card-tray-toggle', '.card-tray-summary a'].map(position))
      .toEqual(['relative', 'absolute', 'relative'])
  })
})
