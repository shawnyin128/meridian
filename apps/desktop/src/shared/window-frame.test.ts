// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = object
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): Node }
  getComputedStyle(element: Node): { overflowX: string }
}
const { document, getComputedStyle } = globalThis as unknown as Window

const stylesheet = (path: string) => readFileSync(join(import.meta.dirname, '..', 'renderer', path), 'utf8')

describe('窗口框架的滚动区', () => {
  it('时间线只在真能横向滚动时才留出滚动条的轨道', () => {
    document.head.innerHTML = `<style>${stylesheet('components/timeline/TimelineBoard.css')}</style>`
    document.body.innerHTML = '<div class="gantt"><div class="gsplit"><div class="gwrap"></div></div></div>'
    expect(getComputedStyle(document.querySelector('.gwrap')).overflowX).toBe('auto')
  })
})
