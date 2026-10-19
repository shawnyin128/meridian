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
    document.head.innerHTML = `<style>${stylesheet('components/timeline/TimelineBoard.css')}</style>`
    document.body.innerHTML = '<div class="gantt"><div class="gsplit"><div class="gwrap"></div></div></div>'
    expect(getComputedStyle(document.querySelector('.gwrap')).overflowX).toBe('auto')
  })

  it('侧栏各级的折叠箭头不悬停也看得见', () => {
    document.head.innerHTML = ['components/IconButton.css', 'shell/AppShell.css']
      .map((path) => `<style>${stylesheet(path)}</style>`).join('')
    document.body.innerHTML = '<div class="sidebar">'
      + '<button class="sb-h sect-h" data-sect="inbox">收件<span class="sh-caret"></span></button>'
      + '<div class="srow" id="rowInboxAll"><button class="nav-row-label">论文推送</button><button class="icbtn xs sh-caret"></button></div>'
      + '<button class="srow disc" data-disc="topics">关注·主题<span class="sh-caret"></span></button></div>'
    for (const selector of ['[data-sect] .sh-caret', '#rowInboxAll .sh-caret', '[data-disc] .sh-caret']) {
      expect(getComputedStyle(document.querySelector(selector)).opacity, selector).toBe('1')
    }
  })
})
