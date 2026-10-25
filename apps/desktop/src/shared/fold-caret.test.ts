// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = { querySelector(selector: string): Node }
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): Node }
  getComputedStyle(element: Node): {
    width: string; height: string; marginTop: string; marginBottom: string; transform: string; transition: string
  }
}
const { document, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every renderer source and stylesheet except tests, as paths relative to the renderer with `/` separators. */
const FILES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .map((path) => path.split('\\').join('/'))
  .filter((path) => /\.(tsx?|css)$/.test(path) && !/\.test\.tsx?$/.test(path))
  .sort()
const read = (path: string) => readFileSync(join(RENDERER, path), 'utf8')

/** The fold caret's chevron: a stroke pointing down from 6,9 through 12,15 to 18,9. */
const CHEVRON = /M\s*6[\s,]+9\s*l\s*6[\s,]+6\s+6[\s,]*-6/
/** A quarter turn, the way a fold caret points at its label while folded. */
const QUARTER_TURN = /rotate\(\s*[+-]?90deg\s*\)/

/** Files that draw the same chevron for something other than a fold, each with what it draws. */
const NOT_FOLDS: Record<string, string> = {
  'components/icons.tsx': 'IconChevron, the chevron of a picker that opens a menu, which never turns',
  'components/paper-table/PaperTable.tsx': 'the sort arrow of the sorted column\'s heading',
}

describe('折叠只有一种箭头', () => {
  it('折叠箭头的笔画只有 FoldCaret 画，别处同样的笔画都不是折叠', () => {
    const drawing = FILES.filter((path) => CHEVRON.test(read(path)))
    expect(drawing).toEqual(['components/FoldCaret.tsx', ...Object.keys(NOT_FOLDS)].sort())
  })

  it('只有 FoldCaret 的样式表把东西转四分之一圈', () => {
    expect(FILES.filter((path) => QUARTER_TURN.test(read(path)))).toEqual(['components/FoldCaret.css'])
  })

  it('选择器的箭头只用在选择器上，不拿来当折叠箭头', () => {
    const using = FILES.filter((path) => path !== 'components/icons.tsx' && /\bIconChevron\b/.test(read(path)))
    expect(using).toEqual(['components/FieldPickers.tsx'])
  })
})

describe('折叠箭头的样子和动效', () => {
  const caret = (open: boolean) => {
    document.head.innerHTML = `<style>${read('components/FoldCaret.css')}</style>`
    document.body.innerHTML = `<span class="${open ? 'fold-caret' : 'fold-caret is-closed'}"><svg></svg></span>`
    return document.querySelector('.fold-caret')
  }

  it('是 12px 的箭头，装在 16px 的格子里；格子上下各探出 2px，不把它所在的那一行撑高', () => {
    const box = caret(true)
    const [outer, glyph] = [getComputedStyle(box), getComputedStyle(box.querySelector('svg'))]
    expect([outer.width, outer.height, glyph.width, glyph.height]).toEqual(['16px', '16px', '12px', '12px'])
    expect([outer.marginTop, outer.marginBottom]).toEqual(['calc(-1 * var(--sp-2))', 'calc(-1 * var(--sp-2))'])
  })

  it('开着时朝下，收起时转四分之一圈朝向行尾，转动走 --t-fast', () => {
    expect([getComputedStyle(caret(true)).transform, getComputedStyle(caret(false)).transform]).toEqual(['none', 'rotate(-90deg)'])
    expect(getComputedStyle(caret(false)).transition).toMatch(/^transform var\(--t-fast\) var\(--e-out\)/)
  })

  it('减少动态效果时不转动画，直接换朝向', () => {
    const css = read('components/FoldCaret.css')
    expect(css.slice(css.indexOf('@media (prefers-reduced-motion:reduce){')))
      .toMatch(/^@media \(prefers-reduced-motion:reduce\)\{\.fold-caret\{transition:none\}\}/)
  })
})
