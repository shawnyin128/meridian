// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Element = { dispatchEvent(event: object): boolean }
type Style = {
  backgroundColor: string; color: string; borderRadius: string; borderTopStyle: string; boxShadow: string
  opacity: string; cursor: string; height: string; width: string; transition: string
}
type Window = {
  document: {
    head: { innerHTML: string }
    body: { innerHTML: string }
    querySelector(selector: string): Element
  }
  MouseEvent: new (type: string, init: { bubbles: boolean }) => object
  getComputedStyle(element: Element): Style
}
const { document, MouseEvent, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')
const ADD_ACTION = join('components', 'AddAction.tsx')
/** The stylesheets that draw AddAction: its own, and the button set that draws its labelled form. */
const OWN_SHEETS = new Set([join('components', 'AddAction.css'), join('components', 'Button.css')])

const SOURCES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx'))
const STYLESHEETS = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.css'))

type Node = { type: string; [key: string]: unknown }

/** Every JSX element in `node` with the JSX element that holds it, outermost first. */
function elements(node: unknown, parent: Node | null = null, found: { element: Node; parent: Node | null }[] = []) {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const item of node) elements(item, parent, found)
    return found
  }
  const held = node as Node
  if (held.type === 'JSXElement') found.push({ element: held, parent })
  for (const [key, value] of Object.entries(held)) {
    if (key !== 'loc' && key !== 'start' && key !== 'end') elements(value, held.type === 'JSXElement' ? held : parent, found)
  }
  return found
}

const nameOf = (element: Node | null): string => {
  const name = (element?.openingElement as Node | undefined)?.name as Node | undefined
  return name?.type === 'JSXIdentifier' ? name.name as string : ''
}

/** The JSX attribute `name` of `element`, if it has one. */
const attribute = (element: Node, name: string): Node | undefined =>
  ((element.openingElement as Node).attributes as Node[])
    .find((attr) => attr.type === 'JSXAttribute' && (attr.name as Node).name === name)

/** Every string literal inside `node`: class names written as literals or picked by a ternary. */
const strings = (node: unknown): string[] => {
  if (node === null || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(strings)
  const held = node as Node
  if (held.type === 'StringLiteral') return [held.value as string]
  if (held.type === 'TemplateElement') return [(held.value as { raw: string }).raw]
  return Object.entries(held).filter(([key]) => key !== 'loc').flatMap(([, value]) => strings(value))
}

const classWords = (element: Node) => strings(attribute(element, 'className')).flatMap((value) => value.split(/\s+/)).filter(Boolean)

const READ = SOURCES.map((path) => ({
  path,
  found: elements(parse(readFileSync(join(RENDERER, path), 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] }).program),
}))

/**
 * The classes only an AddAction carries: its own `add-action` classes, and those a call site passes
 * it that no other element writes.
 */
const ADD_CLASSES = (() => {
  const passed = new Set<string>()
  const elsewhere = new Set<string>()
  for (const { path, found } of READ) {
    for (const { element } of found) {
      const words = classWords(element)
      if (nameOf(element) === 'AddAction') words.forEach((word) => passed.add(word))
      else if (path !== ADD_ACTION) words.forEach((word) => elsewhere.add(word))
    }
  }
  return new Set(['add-action', ...[...passed].filter((word) => !elsewhere.has(word))])
})()

/** Rules as [selector, declarations] pairs, comments removed. */
const rulesOf = (css: string) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => [selector!.trim(), body!] as const)

/** Declarations that decide how the control or its ＋ looks, as opposed to where it sits or whether it shows. */
const LOOK = /(?:^|;)\s*(?:(?:min-|max-)?(?:width|height)|padding[\w-]*|font[\w-]*|line-height|white-space|border[\w-]*|background[\w-]*|color|box-shadow)\s*:/

/** The classes of the element a selector part selects, or of the element around it when it selects the ＋ glyph. */
function subjectClasses(part: string): string[] {
  const compounds = part.replace(/:(?:not|has|is|where)\([^)]*\)/g, '').split(/\s*[\s>+~]\s*/).filter(Boolean)
  const classes = (compound: string | undefined) => [...(compound ?? '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1]!)
  const last = compounds.at(-1) ?? ''
  return /^svg\b/.test(last) ? classes(compounds.at(-2)) : classes(last)
}

/** Every look AddAction draws, by the classes it writes for each size (AddAction.test.tsx pins them). */
const FORMS = {
  regular: '<button type="button" class="btn add-action"><svg></svg><span>新建项目</span></button>',
  compact: '<button type="button" class="btn sm add-action"><svg></svg><span>任务</span></button>',
  icon: '<button type="button" class="add-action add-action-icon" aria-label="新对话"><svg></svg></button>',
  chip: '<button type="button" class="add-action add-action-icon add-action-chip" aria-label="添加主题"><svg></svg></button>',
}

/** `read` of the button and of its ＋ for every form, given `attributes` and after `act` ran on the button. */
const each = (read: (button: Style, glyph: Style) => string, attributes = '', act: (button: Element) => void = () => undefined) =>
  Object.fromEntries(Object.entries(FORMS).map(([form, markup]) => {
    document.body.innerHTML = markup.replace('<button ', `<button ${attributes} `)
    const button = document.querySelector('button')
    act(button)
    return [form, read(getComputedStyle(button), getComputedStyle(document.querySelector('svg')))]
  }))

describe('新建和添加的控件', () => {
  beforeEach(() => {
    document.head.innerHTML = STYLESHEETS.filter((path) => path === join('shell', 'tokens.css') || OWN_SHEETS.has(path))
      .map((path) => `<style>${readFileSync(join(RENDERER, path), 'utf8')}</style>`).join('')
  })

  it('新建和添加不画蓝色:AddAction 交给 Button 的总是次要按钮的样子', () => {
    const own = READ.find(({ path }) => path === ADD_ACTION)!.found.map(({ element }) => element)
    const buttons = own.filter((element) => nameOf(element) === 'Button')
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons.filter((button) => attribute(button, 'variant') !== undefined).map((button) => (button.loc as { start: { line: number } }).start.line))
      .toEqual([])
  })

  it('只有加号和带字的加号一个样子:同一块浅底、墨色加号、同样的圆角、悬停和禁用,只有尺寸跟着槽走', () => {
    expect(each((button, glyph) => `${button.backgroundColor} ${button.color} ${button.borderTopStyle} ${button.borderRadius} ${glyph.width}×${glyph.height}`)).toEqual({
      regular: 'var(--field) var(--ink) none var(--r-control) 12px×12px',
      compact: 'var(--field) var(--ink) none var(--r-control) 12px×12px',
      icon: 'var(--field) var(--ink) none var(--r-control) 12px×12px',
      chip: 'var(--field) var(--ink) none var(--r-control) 12px×12px',
    })
    const hover = (button: Element) => { button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) }
    expect(new Set(Object.values(each((button) => `${button.boxShadow} | ${button.transition}`, '', hover)))).toEqual(new Set([
      'inset 0 0 0 100vmax var(--hover) | box-shadow var(--t-fast) var(--e-out),color var(--t-fast) var(--e-out)',
    ]))
    expect(new Set(Object.values(each((button) => `${button.opacity} ${button.cursor} ${button.boxShadow}`, 'disabled', hover))))
      .toEqual(new Set(['0.45 default none']))
    const boxes = each((button) => `${button.width} × ${button.height}`)
    const [chipWidth, chipHeight] = boxes.chip!.split(' × ')
    expect([boxes.icon, chipWidth === chipHeight]).toEqual(['24px × 24px', true])
    expect(each((button) => button.height)).toMatchObject({ regular: '30px', compact: '24px', icon: '24px' })
  })

  it('屏幕不手搭加号:AddAction 之外的加号只用来放大,或者是候选列表里新建的那一行', () => {
    /** The ＋ glyphs that are no create or add control, by source and the element holding the glyph. */
    const OTHER_PLUSES = [
      { reason: 'the zoom-in of a zoom control, which adds nothing', keys: ['routes/Reader.tsx IconButton', 'components/project/ResearchGraph.tsx IconButton'] },
      { reason: 'the create row among a picker\'s candidates, an option of its list', keys: ['components/TagChips.tsx PickOption', 'components/paper-table/CellPicker.tsx PickOption'] },
    ]
    const allowed = new Set(OTHER_PLUSES.flatMap(({ keys }) => keys))
    const pluses = READ.flatMap(({ path, found }) => found
      .filter(({ element }) => nameOf(element) === 'IconPlus'
        || ((attribute(element, 'd')?.value as Node | undefined)?.expression as Node | undefined)?.name === 'PLUS_PATH')
      .map(({ parent }) => `${path.split('\\').join('/')} ${nameOf(parent)}`))
      .filter((key) => !key.startsWith('components/AddAction.tsx ') && !key.startsWith('components/icons.tsx '))
    expect(pluses.filter((key) => !allowed.has(key))).toEqual([])
  })

  it('样式表不给 AddAction 换样子:它自己和按钮组之外,没有规则改它的尺寸、底色、字色、边框、阴影、字或加号的大小', () => {
    expect(ADD_CLASSES.size).toBeGreaterThan(1)
    const offenders = STYLESHEETS.filter((path) => !OWN_SHEETS.has(path)).flatMap((path) => rulesOf(readFileSync(join(RENDERER, path), 'utf8'))
      .flatMap(([selector, body]) => selector.split(',')
        .filter((part) => LOOK.test(body) && subjectClasses(part.trim()).some((name) => ADD_CLASSES.has(name)))
        .map((part) => `${path.split('\\').join('/')}  ${part.trim()}`)))
    expect(offenders).toEqual([])
  })
})
