// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Style = { display: string; height: string; gridTemplateRows: string; overflowY: string; alignSelf: string; maxHeight: string }
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): object }
  getComputedStyle(element: object): Style
}
const { document, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')
const STYLES = ['components/SplitPage.css', 'components/SidePanel.css', 'routes/shell.css', 'routes/Wiki.css', 'routes/Ideas.css',
  'components/paper-table/PaperTable.css']

/** Each split page as its screen renders it: the Wiki page and its rail, the Ideas list and its panel, the research map. */
const SPLITS = {
  wiki: '<div class="split-page split-page--rail wkpage"><div class="split-column wkmain"></div><div class="split-rail"></div></div>',
  ideas: '<div class="split-page split-page--rail"><div class="split-column"></div><aside class="side-panel side-panel--card idea-detail-panel"></aside></div>',
  map: '<section class="research-map"><div class="split-page split-page--index"><div class="list-column research-map-index"></div><div class="research-map-detail"></div></div></section>',
}

describe('并排的两栏', () => {
  beforeEach(() => {
    document.head.innerHTML = `<style>${STYLES.map((path) => readFileSync(join(RENDERER, path), 'utf8')).join('\n')}</style>`
  })

  it('每个分栏页都占满页面主体剩下的高度,两栏排在同一行里,从同一个顶端排起、在同一个底端收住', () => {
    const looks = Object.entries(SPLITS).map(([name, markup]) => {
      document.body.innerHTML = markup
      const split = getComputedStyle(document.querySelector('.split-page'))
      return `${name}: ${split.display} ${split.height} ${split.gridTemplateRows}`
    })
    expect(looks).toEqual(Object.keys(SPLITS).map((name) => `${name}: grid 100% minmax(0,1fr)`))
  })

  it('正文栏和右栏各在自己里面滚动,不随整页滚;栏里的侧面板只有内容那么高,最高到栏的高度', () => {
    document.body.innerHTML = SPLITS.wiki
    expect(['.split-column', '.split-rail'].map((selector) => getComputedStyle(document.querySelector(selector)).overflowY))
      .toEqual(['auto', 'auto'])
    document.body.innerHTML = SPLITS.ideas
    const panel = getComputedStyle(document.querySelector('.side-panel'))
    expect([panel.alignSelf, panel.maxHeight]).toEqual(['start', '100%'])
  })
})
