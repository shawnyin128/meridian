// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Element = {
  tagName: string
  textContent: string | null
  parentElement: Element | null
  nextElementSibling: Element | null
  firstElementChild: Element | null
  children: Iterable<Element>
  matches(selector: string): boolean
}
type Window = {
  document: { body: { innerHTML: string }; querySelector(selector: string): Element | null; querySelectorAll(selector: string): Iterable<Element> }
}
const { document } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')
/** The stylesheets that set the space around the headings below and the blocks that follow them, in bundle order. */
const SHEETS = [
  'shell/tokens.css', 'routes/shell.css', 'components/PageShell.css', 'components/GroupedList.css', 'components/Card.css',
  'components/CardTray.css', 'components/Item.css', 'components/List.css', 'components/Markdown.css', 'routes/Feed.css',
  'components/settings/ExtensionSettings.css', 'routes/Settings.css',
]

type Rule = { selectors: string[]; declarations: Map<string, string>; order: number }
let rules: Rule[] = []
const tokens = new Map<string, string>()

/** The rules of `css` outside at-rules, which apply only at some sizes or describe animations. */
function parse(css: string, offset: number): Rule[] {
  let flat = css.replace(/\/\*[\s\S]*?\*\//g, '')
  // Drop every at-rule block, nested blocks included.
  for (let at = flat.search(/@[\w-]+[^{;]*\{/); at >= 0; at = flat.search(/@[\w-]+[^{;]*\{/)) {
    let depth = 0
    let end = flat.indexOf('{', at)
    for (; end < flat.length; end += 1) {
      if (flat[end] === '{') depth += 1
      else if (flat[end] === '}' && --depth === 0) break
    }
    flat = flat.slice(0, at) + flat.slice(end + 1)
  }
  return [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match, index) => ({
    selectors: match[1]!.split(/,(?![^(]*\))/).map((selector) => selector.trim()),
    declarations: new Map(match[2]!.split(';').map((part) => part.trim()).filter(Boolean)
      .map((part) => [part.slice(0, part.indexOf(':')).trim(), part.slice(part.indexOf(':') + 1).trim()])),
    order: offset + index,
  }))
}

/** A selector's specificity as one number: ids, then classes, attributes and pseudo-classes, then types. */
function specificity(selector: string): number {
  const bare = selector.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '').replace(/:(?:not|is|has)\(/g, ' ').replace(/[()]/g, ' ')
  const ids = (bare.match(/#[\w-]+/g) ?? []).length
  const classes = (bare.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length
  const types = (bare.replace(/[#.:][\w-]+|\[[^\]]*\]/g, ' ').match(/(?:^|[\s>+~])[a-z][\w-]*/gi) ?? []).length
  return ids * 10_000 + classes * 100 + types
}

const MARGIN_SIDES = ['top', 'right', 'bottom', 'left']
/** The value `property` takes in one rule, read from its longhand or its `margin` or `padding` shorthand. */
function fromRule(declarations: Map<string, string>, property: string): string | undefined {
  if (declarations.has(property)) return declarations.get(property)
  const box = /^(margin|padding)-(top|bottom)$/.exec(property)
  if (box !== null && declarations.has(box[1]!)) {
    const parts = declarations.get(box[1]!)!.split(/\s+(?![^(]*\))/)
    const sides = [parts[0], parts[1] ?? parts[0], parts[2] ?? parts[0], parts[3] ?? parts[1] ?? parts[0]]
    return sides[MARGIN_SIDES.indexOf(box[2]!)]
  }
  if (property === 'row-gap' && declarations.has('gap')) return declarations.get('gap')!.split(/\s+(?![^(]*\))/)[0]
  if (property === 'border-top-width' && declarations.has('border-top')) return declarations.get('border-top')!.split(/\s+/)[0]
  return undefined
}

/** The cascaded value of `property` on `element`: the most specific, then the latest, matching declaration. */
function cascaded(element: Element, property: string): string | undefined {
  let best: { rank: number; order: number; value: string } | undefined
  for (const rule of rules) {
    const value = fromRule(rule.declarations, property)
    if (value === undefined) continue
    for (const selector of rule.selectors) {
      if (/::|:hover|:focus|:active|:has\(/.test(selector) || !element.matches(selector)) continue
      const rank = specificity(selector)
      if (best === undefined || rank > best.rank || (rank === best.rank && rule.order > best.order)) best = { rank, order: rule.order, value }
    }
  }
  return best?.value
}

/** A length in px, its tokens resolved; calc() of one product is all the stylesheets use here. */
function px(value: string | undefined): number {
  if (value === undefined || value === '0' || value === 'auto' || value === 'normal') return 0
  const resolved = value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
    const held = tokens.get(name)
    if (held === undefined) throw new Error(`no token ${name}`)
    return held
  })
  if (resolved !== value) return px(resolved)
  const product = /^calc\(\s*(-?[\d.]+)\s*\*\s*(-?[\d.]+)px\s*\)$/.exec(resolved)
  if (product !== null) return Number(product[1]) * Number(product[2])
  const length = /^(-?[\d.]+)px$/.exec(resolved)
  if (length === null) throw new Error(`not a length: ${value}`)
  return Number(length[1])
}

const display = (element: Element) => cascaded(element, 'display') ?? (element.tagName === 'SPAN' ? 'inline' : 'block')
/** The nearest ancestor of `element` that draws a box. */
const boxParent = (element: Element): Element => {
  const parent = element.parentElement!
  return display(parent) === 'contents' ? boxParent(parent) : parent
}
/** The first block that follows `element` in its box parent, looking into boxless wrappers. */
function nextBlock(element: Element): Element | null {
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    for (let next = node.nextElementSibling; next !== null; next = next.nextElementSibling) {
      const found = display(next) === 'contents' ? firstBlock(next) : next
      if (found !== null) return found
    }
    if (node.parentElement === null || display(node.parentElement) !== 'contents') return null
  }
  return null
}
const firstBlock = (element: Element): Element | null => {
  for (const child of element.children) {
    const found = display(child) === 'contents' ? firstBlock(child) : child
    if (found !== null) return found
  }
  return null
}
/** The top margin a block brings to the edge above it: its own and those of first children it collapses with. */
function topMargin(element: Element): number {
  const own = px(cascaded(element, 'margin-top'))
  const first = element.firstElementChild
  const sealed = px(cascaded(element, 'padding-top')) > 0 || px(cascaded(element, 'border-top-width')) > 0
    || !['block', 'list-item'].includes(display(element))
  return first === null || sealed ? own : Math.max(own, topMargin(first))
}

/** The space between `heading` and the block after it, as the layout around them lays it out. */
function spaceBelow(heading: Element): number {
  const next = nextBlock(heading)
  if (next === null) throw new Error('nothing follows the heading')
  const own = px(cascaded(heading, 'margin-bottom'))
  const around = display(boxParent(heading))
  if (/flex|grid/.test(around)) return own + px(cascaded(next, 'margin-top')) + px(cascaded(boxParent(heading), 'row-gap'))
  return Math.max(own, topMargin(next))
}

beforeAll(() => {
  let offset = 0
  rules = SHEETS.flatMap((path) => {
    const parsed = parse(readFileSync(join(RENDERER, path), 'utf8'), offset)
    offset += parsed.length
    return parsed
  })
  for (const rule of rules.filter((held) => held.selectors.includes(':root'))) {
    for (const [name, value] of rule.declarations) if (name.startsWith('--')) tokens.set(name, value)
  }
})

const heading = (html: string): Element => {
  document.body.innerHTML = html
  return document.querySelector('#heading')!
}

/** The markup FeedRows renders for two days (its test holds it to this shape), inside the feed's stream. */
const FEED = '<div class="desk feedcol"><div class="desk-body"><div class="msgs"><div class="page-toolbar mwrap"></div>'
  + '<div class="feed-days"><div class="grouped-list">'
  + '<div class="section-heading section-heading--group">今天</div><div class="msgs"><div class="mwrap"><div class="msg"></div></div></div>'
  + '<div class="section-heading section-heading--group">昨天</div><div class="msgs"><div class="mwrap"><div class="msg"></div></div>'
  + '<div class="mwrap"><div class="msg"></div></div></div>'
  + '</div></div></div></div></div>'

describe('标题下面的空隙只归标题', () => {
  it('小节标题下面是 10，分组标题下面是 8，后面跟着的是列表时', () => {
    expect(spaceBelow(heading('<div class="desk-body"><p></p><div class="section-heading" id="heading">需要注意</div><div class="list"></div></div>'))).toBe(10)
    expect(spaceBelow(heading(
      '<div class="desk-body"><div class="grouped-list"><div class="section-heading section-heading--group" id="heading">进行中 · 3</div><div class="list"></div></div></div>',
    ))).toBe(8)
  })

  it('卡片里的托盘、教程步骤和库位置这一行跟在分组标题后面时不再叠上自己的上边距', () => {
    expect(spaceBelow(heading(
      '<section class="extension-entry"><div class="section-heading section-heading--group" id="heading">Codex</div><div class="card-tray card-tray--tray"></div></section>',
    )), '托盘').toBe(8)
    expect(spaceBelow(heading(
      '<section class="card-surface extension-tutorial"><div class="section-heading section-heading--group" id="heading">在 Coding Agent 中使用 Meridian</div><ol class="extension-tutorial-steps"></ol></section>',
    )), '教程步骤').toBe(8)
    expect(spaceBelow(heading(
      '<div class="card-surface storage-card"><div class="section-heading section-heading--group" id="heading">论文库</div><label class="storage-root"></label></div>',
    )), '库位置').toBe(8)
  })

  it('小节标题下面的 Markdown 不再叠上它第一个标题的上边距', () => {
    expect(spaceBelow(heading(
      '<div class="wkpage"><div class="wkmain"><p></p><div class="section-heading" id="heading">项目随笔</div><div class="md memo"><h3>动机</h3><p>正文</p></div></div></div>',
    ))).toBe(10)
  })

  it('动态按天分组时，天的标题下面是分组标题自己的 8，上一天的最后一条和它之间是分组标题的 20，不叠上条目之间的 20', () => {
    document.body.innerHTML = FEED
    const days = [...document.querySelectorAll('.section-heading--group')]
    expect(days.map((day) => day.textContent)).toEqual(['今天', '昨天'])
    expect(days.map(spaceBelow)).toEqual([8, 8])
    const second = days[1]!
    const above = px(cascaded(second, 'margin-top'))
      + (/flex|grid/.test(display(boxParent(second))) ? px(cascaded(boxParent(second), 'row-gap')) : 0)
    expect(above).toBe(20)
  })
})
