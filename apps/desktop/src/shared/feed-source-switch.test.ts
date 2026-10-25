// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = object
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): Node }
  getComputedStyle(element: Node): { justifyContent: string; width: string }
}
const { document, getComputedStyle } = globalThis as unknown as Window

/** The stylesheets that lay out a page toolbar and the feed, in bundle order. */
const STYLES = ['shell/tokens.css', 'components/PageShell.css', 'components/SegmentedControl.css', 'routes/shell.css', 'routes/Feed.css']
  .map((path) => readFileSync(join(import.meta.dirname, '..', 'renderer', path), 'utf8'))

/** A page toolbar holding a switch, inside the feed's stream as Feed renders it or on another page, and one feed entry. */
const SWITCH = '<div class="page-toolbar page-toolbar--center mwrap"><div class="segmented-control" role="group"><button>全部</button></div></div>'
const ENTRY = '<div class="mwrap entry"><div class="msg"><div class="fitem"></div></div></div>'
const FEED = `<div class="desk feedcol"><div class="desk-body"><div class="msgs">${SWITCH}${ENTRY}</div></div></div>`
const ELSEWHERE = `<div class="desk"><div class="desk-body">${SWITCH.replace('page-toolbar--center mwrap', 'elsewhere')}</div></div>`

describe('动态的来源切换', () => {
  it('居中摆在动态流的上方，别的页面的工具栏仍把切换放在开头', () => {
    document.head.innerHTML = STYLES.map((css) => `<style>${css}</style>`).join('')
    document.body.innerHTML = FEED + ELSEWHERE
    expect(['.feedcol .page-toolbar', '.page-toolbar.elsewhere'].map((selector) => getComputedStyle(document.querySelector(selector)).justifyContent))
      .toEqual(['center', 'normal'])
  })

  it('动态的条目和别的列表屏一样占满整栏，不比栏窄', () => {
    document.head.innerHTML = STYLES.map((css) => `<style>${css}</style>`).join('')
    document.body.innerHTML = FEED
    expect(['.feedcol .page-toolbar', '.feedcol .entry'].map((selector) => getComputedStyle(document.querySelector(selector)).width))
      .toEqual(['100%', '100%'])
  })
})
