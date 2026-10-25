// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = object
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): Node }
  getComputedStyle(element: Node): { textAlign: string; backgroundColor: string; backgroundImage: string }
}
const { document, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')

describe('Wiki 的论文比较表', () => {
  it('空值的破折号靠左，和有值的格对齐；自动列不铺自己的底色，和别的格一样盖不住行间的分隔线', () => {
    document.head.innerHTML = ['components/Table.css', 'routes/Wiki.css']
      .map((path) => `<style>${readFileSync(join(RENDERER, path), 'utf8')}</style>`).join('')
    document.body.innerHTML = '<table class="table cmp"><tbody><tr class="table-row">'
      + '<td class="table-cell--title rh"><span class="table-text">EAGLE</span></td><td class="table-cell--meta na"><span class="table-text">—</span></td>'
      + '<td class="dv"><span class="table-chips"></span></td><td id="value"><span class="table-text">W4</span></td></tr></tbody></table>'
    expect(getComputedStyle(document.querySelector('td.na')).textAlign).not.toBe('center')
    const fill = (cell: string) => {
      const style = getComputedStyle(document.querySelector(cell))
      return [style.backgroundColor, style.backgroundImage]
    }
    expect(fill('td.dv')).toEqual(fill('#value'))
  })
})
