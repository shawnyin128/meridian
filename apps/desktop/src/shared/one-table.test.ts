import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')
const source = (path: string) => readFileSync(join(RENDERER, path), 'utf8')

/** Every screen stylesheet: all but the flat `components/*.css` of the shared components and the tokens. */
const SCREEN_SHEETS = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.css') && !/^components\/[^/]+\.css$/.test(path) && path !== 'shell/tokens.css')

/** Each rule of every screen stylesheet as its file and its selectors, comments dropped. */
const SCREEN_RULES = SCREEN_SHEETS.flatMap((path) => [...source(path).replace(/\/\*[\s\S]*?\*\//g, '')
  .matchAll(/([^{}]+)\{[^{}]*\}/g)].map(([, selector]) => ({ path, selectors: selector!.trim().replace(/\s+/g, ' ').split(',') })))

/** The tables of the three screens, by the source that renders each and the name it gives its table. */
const TABLES = {
  papers: ['components/paper-table/PaperTable.tsx', 'ptable'],
  wiki: ['routes/Wiki.tsx', 'cmp'],
  ideas: ['routes/Ideas.tsx', 'idea-stats'],
} as const

/** The element a selector styles: its last compound selector, without what `:not()` and `:has()` name. */
const subject = (selector: string) => selector.trim().split(/\s*[\s>+~]\s*/).at(-1)!.replace(/:(not|has)\([^)]*\)/g, '')

/** Whether a compound selector styles a part of a table: a table element, or a table's or its scroll box's name. */
const TABLE_PART = new RegExp(`^(table|thead|tbody|tr|th|td|col)\\b|\\.(${['tblwrap', 'cmpwrap', 'idea-stats-head', 'idea-stats-row',
  'idea-stats-n', ...Object.values(TABLES).map(([, name]) => name)].join('|')})(?![\\w-])`)

describe('论文表、Wiki 的论文比较表和想法的各项目统计是同一张表', () => {
  it('三处都由共享的 Table 画，各自只给它起个名字', () => {
    const drawn = Object.fromEntries(Object.entries(TABLES).map(([screen, [file, name]]) => [
      screen, new RegExp(`<Table\\b[^>]*\\bclassName="${name}"`).test(source(file)),
    ]))
    expect(drawn).toEqual({ papers: true, wiki: true, ideas: true })
  })

  it('表头、格子和行的样子只写在 Table.css 里，屏幕的样式表不各写一份', () => {
    // A Markdown body's own tables are text set in the reading typography, not a table of the App.
    const restyled = SCREEN_RULES.flatMap(({ path, selectors }) => selectors
      .filter((selector) => TABLE_PART.test(subject(selector)) && !/\.md\b/.test(selector))
      .map((selector) => `${path}  ${selector.trim()}`))
    expect(restyled).toEqual([])
  })
})

describe('表格和行、卡片用同一个内边距', () => {
  it('第一列的内容从行和卡片开始的地方开始，最后一列在它们结束的地方结束', () => {
    const rule = (path: string, selector: string) => [...source(path).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .find(([, prelude]) => prelude!.trim() === selector)?.[2] ?? ''
    const inset = /padding:var\(--sp-6\) ([^;}]+)/.exec(rule('components/Item.css', '.item--row'))?.[1]
    expect(inset).toBe('calc(var(--item-inset) + 1px)')
    expect([rule('components/Table.css', '.table :is(th,td):first-child'), rule('components/Table.css', '.table :is(th,td):last-child')])
      .toEqual([`padding-left:${inset}`, `padding-right:${inset}`])
  })
})
