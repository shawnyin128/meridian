// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = { querySelector(selector: string): Node }
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): Node }
  getComputedStyle(element: Node): { width: string; height: string; transform: string; transition: string }
}
const { document, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')

const read = (path: string) => readFileSync(join(RENDERER, path), 'utf8')

describe('折叠箭头的样子和动效', () => {
  const caret = (open: boolean) => {
    document.head.innerHTML = `<style>${read('components/FoldCaret.css')}</style>`
    document.body.innerHTML = `<span class="${open ? 'fold-caret' : 'fold-caret is-closed'}"><svg></svg></span>`
    return document.querySelector('.fold-caret')
  }

  it('是 12px 的箭头，装在 16px 的格子里', () => {
    const box = caret(true)
    const [outer, glyph] = [getComputedStyle(box), getComputedStyle(box.querySelector('svg'))]
    expect([outer.width, outer.height, glyph.width, glyph.height]).toEqual(['16px', '16px', '12px', '12px'])
  })

  it('开着时朝下，收起时转四分之一圈指向标签，转动走 --t-fast', () => {
    expect([getComputedStyle(caret(true)).transform, getComputedStyle(caret(false)).transform]).toEqual(['none', 'rotate(-90deg)'])
    expect(getComputedStyle(caret(false)).transition).toMatch(/^transform var\(--t-fast\) var\(--e-out\)/)
  })

  it('减少动态效果时不转动画，直接换朝向', () => {
    const css = read('components/FoldCaret.css')
    expect(css.slice(css.indexOf('@media (prefers-reduced-motion:reduce){')))
      .toMatch(/^@media \(prefers-reduced-motion:reduce\)\{\.fold-caret\{transition:none\}\}/)
  })
})
