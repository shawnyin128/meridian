// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = object
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): Node }
  getComputedStyle(element: Node): { textAlign: string; backgroundColor: string }
}
const { document, getComputedStyle } = globalThis as unknown as Window

describe('Wiki 的论文比较表', () => {
  it('空值的破折号靠左，和有值的格对齐；自动列不铺底色，盖不住行间的分隔线', () => {
    document.head.innerHTML = `<style>${readFileSync(join(import.meta.dirname, '..', 'renderer', 'routes', 'Wiki.css'), 'utf8')}</style>`
    document.body.innerHTML = '<table class="cmp"><thead><tr><th>论文</th><th class="dv">方法</th></tr></thead><tbody><tr><td class="na">—</td><td class="dv">—</td></tr></tbody></table>'
    expect(getComputedStyle(document.querySelector('td.na')).textAlign).not.toBe('center')
    for (const cell of ['th.dv', 'td.dv']) {
      expect(getComputedStyle(document.querySelector(cell)).backgroundColor, cell).toBe('rgba(0, 0, 0, 0)')
    }
  })
})
