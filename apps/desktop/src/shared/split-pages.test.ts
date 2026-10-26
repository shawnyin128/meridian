// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Style = { display: string; height: string; gridTemplateRows: string; overflowY: string; alignSelf: string; maxHeight: string }
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): object }
  getComputedStyle(element: object): Style
}
const { document, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')
const STYLES = ['components/ScrollArea.css', 'components/SplitPage.css', 'components/SidePanel.css', 'routes/shell.css', 'routes/Wiki.css', 'routes/Ideas.css',
  'components/paper-table/PaperTable.css']

/** Each split page as its screen renders it: the Wiki page and its rail, the Ideas list and its panel, the research map. */
const SPLITS = {
  wiki: '<div class="split-page split-page--rail wkpage"><div class="scroll-area scroll-area--y split-column wkmain"></div><div class="scroll-area scroll-area--y split-rail"></div></div>',
  ideas: '<div class="split-page split-page--rail"><div class="scroll-area scroll-area--y split-column"></div><aside class="side-panel side-panel--card idea-detail-panel"></aside></div>',
  map: '<section class="research-map"><div class="split-page split-page--index"><div class="list-column research-map-index"></div><div class="research-map-detail"></div></div></section>',
}

describe('并排的两栏', () => {
  beforeEach(() => {
    document.head.innerHTML = `<style>${STYLES.map((path) => readFileSync(join(RENDERER, path), 'utf8')).join('\n')}</style>`
  })

  it('每个分栏页都占满页面主体剩下的高度,两栏排在同一行里,从同一个顶端排起、在同一个底端收住', () => {
    const looks = Object.entries(SPLITS).map(([name, markup]) => {
      document.body.innerHTML = markup
      const split = getComputedStyle(document.querySelector('.split-page'))
      return `${name}: ${split.display} ${split.height} ${split.gridTemplateRows}`
    })
    expect(looks).toEqual(Object.keys(SPLITS).map((name) => `${name}: grid 100% minmax(0,1fr)`))
  })

  it('正文栏和右栏各在自己里面滚动,不随整页滚;栏里的侧面板只有内容那么高,最高到栏的高度', () => {
    document.body.innerHTML = SPLITS.wiki
    expect(['.split-column', '.split-rail'].map((selector) => getComputedStyle(document.querySelector(selector)).overflowY))
      .toEqual(['auto', 'auto'])
    document.body.innerHTML = SPLITS.ideas
    const panel = getComputedStyle(document.querySelector('.side-panel'))
    expect([panel.alignSelf, panel.maxHeight]).toEqual(['start', '100%'])
  })
})

type Node = { type: string; [key: string]: unknown }

/** Every JSX opening element named `name` in `node`. */
function openings(node: unknown, name: string, found: Node[] = []): Node[] {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const item of node) openings(item, name, found)
    return found
  }
  const held = node as Node
  if (held.type === 'JSXOpeningElement' && (held.name as Node).type === 'JSXIdentifier' && (held.name as Node).name === name) found.push(held)
  for (const [key, value] of Object.entries(held)) {
    if (key !== 'loc' && key !== 'start' && key !== 'end') openings(value, name, found)
  }
  return found
}

/** The name of the last element a JSX element or fragment ends with: itself, or a fragment's last child element. */
function lastElement(node: Node): string | undefined {
  if (node.type === 'JSXElement') return ((node.openingElement as Node).name as Node).name as string
  if (node.type !== 'JSXFragment') return undefined
  const children = (node.children as Node[]).filter((child) => child.type === 'JSXElement')
  return children.length === 0 ? undefined : lastElement(children.at(-1)!)
}

describe('对话框右栏的头部', () => {
  it('每个 SplitMain 的头部要么以小节标题收尾,由标题留出下面的空隙;要么标着 fields,由它在字段和正文之间留出间距', () => {
    const sources = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
      .filter((path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx'))
    const mains = sources.flatMap((path) => openings(
      parse(readFileSync(join(RENDERER, path), 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] }).program, 'SplitMain',
    ).map((opening) => ({ path, opening })))
    expect(mains.length).toBeGreaterThanOrEqual(2)
    const unspaced = mains.filter(({ opening }) => {
      const attributes = (opening.attributes as Node[]).filter((attribute) => attribute.type === 'JSXAttribute')
      const named = (name: string) => attributes.find((attribute) => (attribute.name as Node).name === name)
      if (named('fields') !== undefined) return false
      const value = named('head')?.value as Node | undefined
      return value?.type !== 'JSXExpressionContainer' || lastElement(value.expression as Node) !== 'SectionHeading'
    }).map(({ path, opening }) => `${path}:${(opening.loc as { start: { line: number } }).start.line}`)
    expect(unspaced).toEqual([])
  })
})
