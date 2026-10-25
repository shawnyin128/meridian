// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Style = {
  gridTemplateColumns: string; gridColumn: string; whiteSpace: string; color: string; fontSize: string; fontFamily: string
}
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): object }
  getComputedStyle(element: object): Style
}
const { document, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')
const STYLES = readFileSync(join(RENDERER, 'components/FormControls.css'), 'utf8')

const FIELD = 'form-control form-input form-control-field'
// Field rows sharing one label column, a row on its own, and fields set in a small and a reading text.
const MARKUP = `
  <div class="field-rows" id="rows">
    <div class="status" id="head"></div>
    <div class="field-row" id="short-row"><label class="field-row-label" id="short">提供方</label><div class="field-row-field" id="short-field"><input class="${FIELD}"></div></div>
    <div class="field-row" id="long-row"><label class="field-row-label" id="long">Authentication</label><div class="field-row-field"><span id="value">Responses API</span></div></div>
  </div>
  <div class="field-row" id="alone"><label class="field-row-label">分组</label><div class="field-row-field"></div></div>
  <div style="font-size:12px;font-family:serif"><input class="${FIELD}" id="in-small"><textarea class="form-control form-textarea form-control-field" id="area-small"></textarea>
    <button class="form-control form-button form-control-field" id="picker-small"></button><input class="form-control form-input form-control-inline" id="inline-small"></div>
  <div style="font-size:14px"><input class="${FIELD}" id="in-reading"></div>`

describe('带标签的栏位', () => {
  beforeEach(() => {
    document.head.innerHTML = `<style>${STYLES}</style>`
    document.body.innerHTML = MARKUP
  })

  const style = (id: string) => getComputedStyle(document.querySelector(`#${id}`))

  it('一组栏位的行共用一列标签,和最长的标签一样宽;组里别的部分占满两列;单独一行有它自己的标签列', () => {
    expect(style('rows').gridTemplateColumns).toMatch(/^max-content /)
    expect(['head', 'short-row', 'long-row'].map((id) => style(id).gridColumn)).toEqual(['1/-1', '1/-1', '1/-1'])
    expect(['short-row', 'long-row'].map((id) => style(id).gridTemplateColumns)).toEqual(['subgrid', 'subgrid'])
    expect(style('alone').gridTemplateColumns).toMatch(/^max-content /)
    expect(['short', 'long'].map((id) => [style(id).gridColumn, style(id).whiteSpace])).toEqual([['1', 'nowrap'], ['1', 'nowrap']])
    expect(style('short-field').gridColumn).toBe('2')
  })

  it('标签一律是小号的第三级灰字,栏位里放的文字读作属性值', () => {
    expect([style('short').color, style('short').fontSize]).toEqual(['var(--ter)', 'var(--fs-meta)'])
    expect([style('value').color, style('value').fontSize]).toEqual(['var(--sec)', 'var(--fs-meta)'])
  })

  it('有框的栏位自己定字体,不随外面的字号变;就地编辑的栏位沿用它替换的文字', () => {
    expect(['in-small', 'area-small', 'picker-small', 'in-reading'].map((id) => [style(id).fontSize, style(id).fontFamily]))
      .toEqual([...Array(4)].map(() => ['var(--fs-body)', 'var(--sans)']))
    expect(style('inline-small').fontSize).toBe('12px')
  })
})

/** Every renderer source, tests excluded, as paths relative to the renderer. */
const SOURCES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx'))

type Node = { type: string; [key: string]: unknown }

/** The names of every JSX element in `node`. */
function elementNames(node: unknown, found: string[] = []): string[] {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const item of node) elementNames(item, found)
    return found
  }
  const held = node as Node
  if (held.type === 'JSXOpeningElement' && (held.name as Node).type === 'JSXIdentifier') found.push((held.name as Node).name as string)
  for (const [key, value] of Object.entries(held)) {
    if (key !== 'loc' && key !== 'start' && key !== 'end') elementNames(value, found)
  }
  return found
}

describe('标签列只有 FieldRow 一处', () => {
  it('只有 FormControls 画 <label>:别处的标签都是 FieldRow 的标签列', () => {
    const labels = SOURCES.filter((path) => path !== join('components', 'FormControls.tsx')).filter((path) => {
      const ast = parse(readFileSync(join(RENDERER, path), 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] })
      return elementNames(ast.program).includes('label')
    })
    expect(labels).toEqual([])
  })
})

describe('搜索框只有 SearchField 一种', () => {
  it('除了 ClearableInput 自己,没有源文件直接画可清空的输入框:每个搜索框都是 SearchField', () => {
    const bare = SOURCES.filter((path) => path !== join('components', 'ClearableInput.tsx')).filter((path) => {
      const ast = parse(readFileSync(join(RENDERER, path), 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] })
      return elementNames(ast.program).includes('ClearableInput')
    })
    expect(bare).toEqual([])
  })
})
