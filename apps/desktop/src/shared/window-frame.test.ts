// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = object
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): Node }
  getComputedStyle(element: Node): { overflowX: string; opacity: string }
}
const { document, getComputedStyle } = globalThis as unknown as Window

const stylesheet = (path: string) => readFileSync(join(import.meta.dirname, '..', 'renderer', path), 'utf8')

describe('窗口框架的滚动区', () => {
  it('时间线只在真能横向滚动时才留出滚动条的轨道', () => {
    document.head.innerHTML = ['components/ScrollArea.css', 'components/timeline/TimelineBoard.css']
      .map((path) => `<style>${stylesheet(path)}</style>`).join('')
    document.body.innerHTML = '<div class="gantt"><div class="gsplit"><div class="scroll-area scroll-area--x scroll-area--fill gwrap"></div></div></div>'
    expect(getComputedStyle(document.querySelector('.gwrap')).overflowX).toBe('auto')
  })

  it('内容自己滚动的页面主体照样留出滚动条的位置，栏和会滚动的页面主体对齐', () => {
    const css = ['components/ScrollArea.css', 'components/PageShell.css'].map(stylesheet).join('\n')
    const gutter = (selector: string) => new RegExp(`${selector.replace('.', '\\.')}\\{[^}]*scrollbar-gutter:stable`).test(css)
    expect([gutter('.scroll-area--gutter'), gutter('.desk-body--fill')]).toEqual([true, true])
  })

  it('侧栏各级的折叠箭头不悬停也看得见', () => {
    document.head.innerHTML = ['components/IconButton.css', 'components/FoldCaret.css', 'components/FoldToggle.css', 'shell/AppShell.css']
      .map((path) => `<style>${stylesheet(path)}</style>`).join('')
    const caret = '<span class="fold-caret is-closed"></span>'
    document.body.innerHTML = '<div class="sidebar">'
      + `<div class="sb-h" data-sect="inbox"><button class="fold-toggle">收件${caret}</button></div>`
      + `<div class="srow" id="rowInboxAll"><button class="nav-row-label">论文推送</button><button class="icbtn xs fold-toggle">${caret}</button></div>`
      + `<button class="fold-toggle srow disc" data-disc="topics">关注·主题${caret}</button></div>`
    for (const selector of ['[data-sect] .fold-caret', '#rowInboxAll .fold-caret', '[data-disc] .fold-caret']) {
      expect(getComputedStyle(document.querySelector(selector)).opacity, selector).toBe('1')
    }
  })
})
