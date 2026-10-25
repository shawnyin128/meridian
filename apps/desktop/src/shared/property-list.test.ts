// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Style = { gridTemplateColumns: string; gridColumn: string; whiteSpace: string; color: string; fontSize: string }
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): object }
  getComputedStyle(element: object): Style
}
const { document, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')
const STYLES = readFileSync(join(RENDERER, 'components/PropertyList.css'), 'utf8')

// A rail's list, and two aligned lists in one host grid, as PropertyList renders them.
const MARKUP = `
  <dl class="property-list" id="rail">
    <div class="property" id="row"><dt class="property-label" id="label">当前目标</dt><dd class="property-value" id="value">把树形草稿跑通</dd></div>
  </dl>
  <div style="display:grid;grid-template-columns:max-content minmax(0,1fr)">
    <dl class="property-list property-list--aligned" id="fields"><div class="property"><dt class="property-label">涉及</dt><dd class="property-value">x</dd></div></dl>
    <dl class="property-list property-list--aligned" id="grounds"><div class="property"><dt class="property-label">实验结论</dt><dd class="property-value">y</dd></div></dl>
  </div>`

describe('属性列表', () => {
  beforeEach(() => {
    document.head.innerHTML = `<style>${STYLES}</style>`
    document.body.innerHTML = MARKUP
  })

  const style = (id: string) => getComputedStyle(document.querySelector(`#${id}`))

  it('标签列和最长的标签一样宽、不折行,值在第二列;值是次级字,标签是第三级字,都是小号', () => {
    expect(style('rail').gridTemplateColumns).toMatch(/^max-content /)
    expect([style('row').gridColumn, style('row').gridTemplateColumns]).toEqual(['1/-1', 'subgrid'])
    expect([style('label').gridColumn, style('label').whiteSpace, style('label').color]).toEqual(['1', 'nowrap', 'var(--ter)'])
    expect([style('value').gridColumn, style('value').color]).toEqual(['2', 'var(--sec)'])
    expect(style('rail').fontSize).toBe('var(--fs-meta)')
  })

  it('对齐的列表用它所在网格的标签列,同一张卡片上的几张列表从同一处开始写值', () => {
    expect(['fields', 'grounds'].map((id) => [style(id).gridColumn, style(id).gridTemplateColumns]))
      .toEqual([['1/-1', 'subgrid'], ['1/-1', 'subgrid']])
  })
})

/** Every renderer source, tests excluded, as paths relative to the renderer. */
const SOURCES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx'))

type Node = { type: string; [key: string]: unknown }

/** Every JSX opening element in `node`, with its name and its literal class words. */
function openings(node: unknown, found: { name: string; classes: string[] }[] = []) {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const item of node) openings(item, found)
    return found
  }
  const held = node as Node
  if (held.type === 'JSXOpeningElement' && (held.name as Node).type === 'JSXIdentifier') {
    const className = (held.attributes as Node[]).find((attribute) => (attribute.name as Node | undefined)?.name === 'className')
    const value = className?.value as Node | undefined
    found.push({ name: (held.name as Node).name as string, classes: value?.type === 'StringLiteral' ? (value.value as string).split(/\s+/) : [] })
  }
  for (const [key, value] of Object.entries(held)) {
    if (key !== 'loc' && key !== 'start' && key !== 'end') openings(value, found)
  }
  return found
}

describe('标签和值的列表只有 PropertyList 一种', () => {
  it('只有 PropertyList 画 dl、dt、dd,也没有源文件自己拼标签格 pk 和属性表 wkprops', () => {
    const copies = SOURCES.filter((path) => path !== join('components', 'PropertyList.tsx')).flatMap((path) => {
      const ast = parse(readFileSync(join(RENDERER, path), 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] })
      return openings(ast.program)
        .filter((element) => ['dl', 'dt', 'dd'].includes(element.name) || element.classes.some((word) => word === 'pk' || word === 'wkprops'))
        .map((element) => `${path} ${element.name}`)
    })
    expect([...new Set(copies)]).toEqual([])
  })
})
