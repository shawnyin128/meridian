// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = { dispatchEvent(event: object): boolean }
type Window = {
  document: {
    head: { innerHTML: string }
    body: { innerHTML: string }
    getElementById(id: string): Node
  }
  MouseEvent: new (type: string, init: { bubbles: boolean }) => object
  getComputedStyle(element: Node): { cursor: string; color: string }
}
const { document, MouseEvent, getComputedStyle } = globalThis as unknown as Window

const STYLES = ['shell/tokens.css', 'components/paper-table/PaperTable.css']
  .map((path) => readFileSync(join(import.meta.dirname, '..', 'renderer', path), 'utf8'))

// The paper table's header as PaperTable renders it: a sortable column carries aria-sort, the others do not.
const HEAD = '<table class="ptable"><thead><tr><th id="title" aria-sort="none">标题</th><th id="short">短标题</th><th id="year" aria-sort="descending">年份</th></tr></thead></table>'

/** Cursor and colour of each header cell, after the pointer entered the one named `hovered`. */
const cells = (hovered?: string) => {
  document.body.innerHTML = HEAD
  if (hovered !== undefined) document.getElementById(hovered).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  return Object.fromEntries(['title', 'short', 'year'].map((id) => {
    const style = getComputedStyle(document.getElementById(id))
    return [id, `${style.cursor} ${style.color}`]
  }))
}

describe('论文表的表头', () => {
  beforeEach(() => {
    document.head.innerHTML = STYLES.map((css) => `<style>${css}</style>`).join('')
  })

  it('只有能排序的表头显示手形光标', () => {
    expect(cells()).toEqual({ title: 'pointer var(--sec)', short: 'default var(--sec)', year: 'pointer var(--sec)' })
  })

  it('悬停只让能排序的表头变深，不能排序的不变', () => {
    expect([cells('short').short, cells('year').year]).toEqual(['default var(--sec)', 'pointer var(--ink)'])
  })
})
