// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = { dispatchEvent(event: object): boolean }
type Style = {
  opacity: string; cursor: string; height: string; borderTopWidth: string; borderTopStyle: string
  boxShadow: string; transition: string; backgroundColor: string; color: string; background: string
}
type Window = {
  document: {
    head: { innerHTML: string }
    body: { innerHTML: string }
    querySelector(selector: string): Node
  }
  MouseEvent: new (type: string, init: { bubbles: boolean }) => object
  getComputedStyle(element: Node): Style
}
const { document, MouseEvent, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every stylesheet under the renderer, as paths relative to it. */
const STYLESHEETS = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.css'))

/**
 * Classes written next to `btn` that the set does not judge: its own variant, size and state
 * classes, and the read-state filter, a menu trigger whose applied state takes the selected tint.
 */
const SET_CLASSES = new Set(['btn', 'pri', 'ghost', 'danger', 'sm', 'on', 'read-state-filter'])

/** The JSX opening tag that starts at `from`, up to its `>` outside any `{}` expression. */
const openingTag = (source: string, from: number): string => {
  let depth = 0
  for (let at = from; at < source.length; at++) {
    if (source[at] === '{') depth++
    else if (source[at] === '}') depth--
    else if (source[at] === '>' && depth === 0) return source.slice(from, at + 1)
  }
  throw new Error(`没有闭合的标签：${source.slice(from, from + 40)}`)
}

/**
 * Every class a component writes on a set button besides the set's own: next to `btn` in one class
 * string, or on an AddAction of the page or section variant.
 */
const PAIRED = new Set(readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx'))
  .flatMap((path) => {
    const source = readFileSync(join(RENDERER, path), 'utf8')
    const strings = [...source.matchAll(/['"]((?:[a-z][\w-]* )*btn(?: [a-z][\w-]*)*)['"]/g)].map(([, classes]) => classes!)
    const adds = [...source.matchAll(/<AddAction\b/g)].map(({ index }) => openingTag(source, index))
      .filter((tag) => !/variant="(?:icon|chip)"/.test(tag))
      .flatMap((tag) => [.../className="([^"]+)"/.exec(tag)?.slice(1) ?? []])
    return [...strings, ...adds].flatMap((classes) => classes.split(/\s+/))
  })
  .filter((name) => /^[a-z][\w-]*$/.test(name) && !SET_CLASSES.has(name)))

/** The stylesheet that owns the button set. */
const BUTTON_SET = join('routes', 'shell.css')

const STYLES = [join('shell', 'tokens.css'), BUTTON_SET].map((path) => readFileSync(join(RENDERER, path), 'utf8'))

/** Every variant and size of the set, by the classes a call site writes. */
const VARIANTS = {
  secondary: 'btn',
  primary: 'btn pri',
  ghost: 'btn ghost',
  danger: 'btn danger',
  solidDanger: 'btn pri danger',
  ghostDanger: 'btn ghost danger',
  nested: 'btn sm',
}

/** `read` of a button of each variant, given `attributes` and after `act` ran on it. */
const each = (read: (style: Style) => string, attributes = '', act: (button: Node) => void = () => undefined) =>
  Object.fromEntries(Object.entries(VARIANTS).map(([variant, classes]) => {
    document.body.innerHTML = `<button type="button" class="${classes}" ${attributes}>保存</button>`
    const button = document.querySelector('button')
    act(button)
    return [variant, read(getComputedStyle(button))]
  }))

/** Rules as [selector, declarations] pairs, comments removed. */
const rulesOf = (css: string) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => [selector!.trim(), body!] as const)

/** How jsdom reports `transparent`. */
const TRANSPARENT = 'rgba(0, 0, 0, 0)'

/** Declarations that decide how a button looks, as opposed to where it sits. */
const LOOK = /(?:^|;)\s*(?:height|min-height|padding[\w-]*|font[\w-]*|line-height|border[\w-]*|background[\w-]*|color|opacity|cursor|box-shadow)\s*:/

describe('按钮组', () => {
  beforeEach(() => {
    document.head.innerHTML = STYLES.map((css) => `<style>${css}</style>`).join('')
  })

  it('每种按钮禁用后都变淡，也不再显示手形光标', () => {
    expect(each((style) => `${style.opacity} ${style.cursor}`, 'disabled')).toEqual({
      secondary: '0.45 default', primary: '0.45 default', ghost: '0.45 default', danger: '0.45 default',
      solidDanger: '0.45 default', ghostDanger: '0.45 default', nested: '0.45 default',
    })
  })

  it('每种按钮悬停时都盖上一层悬停色，实心按钮盖深色的一层，过渡时长都一样', () => {
    const hover = (button: Node) => { button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) }
    expect(each((style) => style.boxShadow, '', hover)).toEqual({
      secondary: 'inset 0 0 0 100vmax var(--hover)',
      primary: 'inset 0 0 0 100vmax var(--hover-solid)',
      ghost: 'inset 0 0 0 100vmax var(--hover)',
      danger: 'inset 0 0 0 100vmax var(--hover)',
      solidDanger: 'inset 0 0 0 100vmax var(--hover-solid)',
      ghostDanger: 'inset 0 0 0 100vmax var(--hover)',
      nested: 'inset 0 0 0 100vmax var(--hover)',
    })
    expect(new Set(Object.values(each((style) => style.transition)))).toEqual(new Set([
      'box-shadow var(--t-fast) var(--e-out),color var(--t-fast) var(--e-out)',
    ]))
  })

  it('禁用的按钮悬停时不再变色', () => {
    const hover = (button: Node) => { button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) }
    expect(new Set(Object.values(each((style) => style.boxShadow, 'disabled', hover)))).toEqual(new Set(['none']))
  })

  it('菜单里禁用的条目与禁用的按钮是同一个样子：变淡、没有手形光标，悬停也不亮', () => {
    /** Opacity, cursor and fill of the `.mi` in `markup`, hovered first when `hover`. */
    const look = (markup: string, hover = false) => {
      document.body.innerHTML = markup
      const item = document.querySelector('.mi')
      if (hover) item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      const style = getComputedStyle(item)
      return `${style.opacity} ${style.cursor} ${style.background}`
    }
    const [disabled] = Object.values(each((style) => `${style.opacity} ${style.cursor}`, 'disabled'))
    expect([
      look('<div role="menuitem" class="mi" data-disabled="">取消归档</div>'),
      look('<button type="button" class="mi" disabled>发表</button>', true),
    ]).toEqual([`${disabled} ${TRANSPARENT}`, `${disabled} ${TRANSPARENT}`])
  })

  it('按钮不画边框，次要按钮是一块浅底，幽灵按钮没有底', () => {
    expect(each((style) => style.borderTopStyle)).toEqual({
      secondary: 'none', primary: 'none', ghost: 'none', danger: 'none',
      solidDanger: 'none', ghostDanger: 'none', nested: 'none',
    })
    expect(each((style) => style.backgroundColor)).toEqual({
      secondary: 'var(--field)', primary: 'var(--accent-solid)', ghost: TRANSPARENT, danger: 'var(--tint-bad)',
      solidDanger: 'var(--bad-solid)', ghostDanger: TRANSPARENT, nested: 'var(--field)',
    })
  })

  it('只有两种高度：默认 30px，嵌在行里和卡片里的 24px', () => {
    expect(each((style) => style.height)).toEqual({
      secondary: '30px', primary: '30px', ghost: '30px', danger: '30px',
      solidDanger: '30px', ghostDanger: '30px', nested: '24px',
    })
  })

  it('默认按钮和它旁边带框的输入框、选择框一样高', () => {
    document.head.innerHTML += `<style>${readFileSync(join(RENDERER, 'components', 'FormControls.css'), 'utf8')}</style>`
    document.body.innerHTML = '<button type="button" class="btn">保存</button>'
      + '<input class="form-control form-input form-control-field" />'
      + '<select class="form-control form-select form-control-field"></select>'
      + '<button type="button" class="form-control form-button form-control-field">选择</button>'
    const heights = ['.btn', '.form-input', '.form-select', '.form-button']
      .map((selector) => getComputedStyle(document.querySelector(selector)).height)
    expect(new Set(heights)).toEqual(new Set(['30px']))
  })

  it('按下的开关按钮是选中的样子：--selected 的底配 --on-selected 的字', () => {
    document.body.innerHTML = '<button type="button" class="btn ghost sm" aria-pressed="true">历史项目</button><button type="button" class="btn ghost sm" aria-pressed="false">历史项目</button>'
    const [on, off] = ['[aria-pressed="true"]', '[aria-pressed="false"]'].map((selector) => {
      const style = getComputedStyle(document.querySelector(selector))
      return `${style.backgroundColor} ${style.color}`
    })
    expect([on, off]).toEqual(['var(--selected) var(--on-selected)', `${TRANSPARENT} var(--sec)`])
  })

  it('别的样式表和别的规则不改按钮的尺寸、字号、底色、边框、光标或禁用样式', () => {
    const names = new RegExp(`\\.(?:${['btn', ...PAIRED].join('|')})(?![\\w-])`)
    const offenders = STYLESHEETS.flatMap((path) => rulesOf(readFileSync(join(RENDERER, path), 'utf8'))
      .filter(([selector, body]) => names.test(selector) && LOOK.test(body))
      .filter(([selector]) => path !== BUTTON_SET
        || !selector.split(',').every((part) => /^(?::where\()?\.btn(?![\w-])/.test(part.trim())))
      .map(([selector]) => `${path}  ${selector}`))
    expect(offenders).toEqual([])
  })
})
