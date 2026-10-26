// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Style = { flexShrink: string; whiteSpace: string; minWidth: string; overflow: string; gridTemplateColumns: string }
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): object }
  getComputedStyle(element: object): Style
}
const { document, getComputedStyle } = globalThis as unknown as Window

const COMPONENTS = join(import.meta.dirname, '..', 'renderer', 'components')
/** The stylesheets that lay out a paper card's meta line: the item's slots, the tag, the fading text and the card's own. */
const STYLES = ['GroupedList.css', 'Item.css', 'Tag.css', 'FadeText.css', 'paper/PaperCard.css']
  .map((path) => readFileSync(join(COMPONENTS, path), 'utf8')).join('\n')

/**
 * A paper card's meta line as PaperCard renders it (its test holds it to this shape): authors, a venue
 * badge, the citation count; in a group that folds, as the Inbox lists cards.
 */
const META = '<section class="collapsible-group"><div class="collapsible-group-body" id="body"><div class="collapsible-group-content"><article class="item item--card item--slotted paper-card"><div class="item-head"><div class="item-main"><div class="item-meta">'
  + '<span class="fade-text paper-card-authors" id="authors">Joon Sung Park, Carolyn Q. Zou, Aaron Shaw</span>'
  + '<span class="tag tag--label tag--neutral paper-card-badge venue" id="badge">Nature Human Behaviour</span>'
  + '<span class="fade-text paper-card-citations citations" id="citations">157 引用</span>'
  + '</div></div></div></article></div></div></section>'

describe('论文卡片的元数据一行', () => {
  beforeEach(() => {
    document.head.innerHTML = `<style>${STYLES}</style>`
    document.body.innerHTML = META
  })

  const look = (id: string) => {
    const style = getComputedStyle(document.querySelector(`#${id}`))
    return [style.flexShrink, style.whiteSpace, style.minWidth, style.overflow]
  }

  it('作者放不下时收窄并淡出，不换行', () => {
    expect(look('authors')).toEqual(['1', 'nowrap', '0px', 'hidden'])
  })

  it('能折叠的分组不让一行放不下的内容撑宽它的列，卡片宽度跟着页面，作者才收得窄', () => {
    expect(getComputedStyle(document.querySelector('#body')).gridTemplateColumns).toBe('minmax(0,1fr)')
  })

  it('会场徽标和引用数不收缩也不换行，所以不会逐字断开，也不会伸到行尾的操作下面', () => {
    expect([look('badge').slice(0, 2), look('citations').slice(0, 2)]).toEqual([['0', 'nowrap'], ['0', 'nowrap']])
  })
})
