// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = { dispatchEvent(event: object): boolean; querySelector(selector: string): Node }
type Style = {
  width: string; height: string; opacity: string; cursor: string; boxShadow: string; transition: string
  color: string; backgroundColor: string; borderRadius: string
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
const ICON_BUTTON = join('components', 'IconButton.css')
const read = (path: string) => readFileSync(join(RENDERER, path), 'utf8')

/** Every stylesheet and component under the renderer, as paths relative to it. */
const FILES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
const STYLESHEETS = FILES.filter((path) => path.endsWith('.css'))

/** Rules as [selector, declarations] pairs, comments removed. */
const rulesOf = (css: string) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => [selector!.trim(), body!] as const)

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
 * The classes components put on an icon button besides its own, to place it or reveal it: from
 * `className` on an IconButton.
 */
const HOOKS = new Set(FILES.filter((path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx')).flatMap((path) => {
  const source = read(path)
  return [...source.matchAll(/<IconButton\b/g)]
    .map(({ index }) => openingTag(source, index))
    .flatMap((tag) => [.../className="([^"]+)"/.exec(tag)?.[1]?.split(/\s+/) ?? []])
}).filter((name) => !['sm', 'xs', 'danger'].includes(name)))

/**
 * Whether a selector list styles an element carrying one of `names` itself, not an ancestor or a
 * table cell around one: some selector's last compound, without the arguments of :has(), :not(),
 * :where() and :is(), holds the class and names no element other than a button.
 */
const styles = (selector: string, names: RegExp): boolean => selector.split(',').some((part) => {
  const subject = part.trim().split(/\s*[\s>+~]\s*(?![^(]*\))/).at(-1)!
  const own = subject.replace(/:(?:has|not|where|is)\((?:[^()]|\([^()]*\))*\)/g, '')
  return names.test(own) && !/^[a-z]/.test(own.replace(/^button\b/, ''))
})

/** Declarations that decide how an icon button looks, as opposed to where it sits or whether it shows. */
const LOOK = /(?:^|;)\s*(?:width|height|min-width|padding[\w-]*|font[\w-]*|border[\w-]*|background[\w-]*|color|cursor|box-shadow|display|place-items)\s*:/

const SIZES = { default: 'icbtn', nested: 'icbtn sm', inline: 'icbtn xs' }

/** The box and glyph size in px that each size rule of IconButton.css sets. */
const SIZE_RULES: Record<string, number[]> = Object.fromEntries(rulesOf(read(ICON_BUTTON))
  .filter(([selector]) => /^\.icbtn(\.sm|\.xs)?$/.test(selector))
  .map(([selector, body]) => [selector, [/--icbtn-box:(\d+)px/, /--icbtn-glyph:(\d+)px/].map((pattern) => Number(pattern.exec(body)?.[1]))]))

/** `read` of an icon button of each size holding one glyph, given `attributes` and after `act` ran on it. */
const each = (readStyle: (button: Style, glyph: Style) => string, attributes = '', act: (button: Node) => void = () => undefined) =>
  Object.fromEntries(Object.entries(SIZES).map(([size, classes]) => {
    document.body.innerHTML = `<button type="button" class="${classes}" ${attributes}><svg viewBox="0 0 24 24"></svg></button>`
    const button = document.querySelector('button')
    act(button)
    return [size, readStyle(getComputedStyle(button), getComputedStyle(button.querySelector('svg')))]
  }))

describe('图标按钮', () => {
  beforeEach(() => {
    document.head.innerHTML = [join('shell', 'tokens.css'), ICON_BUTTON].map((path) => `<style>${read(path)}</style>`).join('')
  })

  it('按尺寸给图标定宽高：页头 30/15，行里 24/13，chip 里 16/10', () => {
    expect(each((_, glyph) => `${glyph.width} ${glyph.height}`)).toEqual({
      default: 'var(--icbtn-glyph) var(--icbtn-glyph)',
      nested: 'var(--icbtn-glyph) var(--icbtn-glyph)',
      inline: 'var(--icbtn-glyph) var(--icbtn-glyph)',
    })
    expect(SIZE_RULES).toEqual({ '.icbtn': [30, 15], '.icbtn.sm': [24, 13], '.icbtn.xs': [16, 10] })
  })

  it('点得到的范围每种尺寸都至少 24px：16px 的按钮用 ::before 向外扩', () => {
    const before = rulesOf(read(ICON_BUTTON)).find(([selector]) => selector === '.icbtn.xs::before')?.[1] ?? ''
    expect(before).toMatch(/position:absolute/)
    const inset = Number(/inset:-(\d+)px/.exec(before)?.[1] ?? 0)
    const box = (selector: string) => SIZE_RULES[selector]![0]!
    expect([box('.icbtn'), box('.icbtn.sm'), box('.icbtn.xs') + 2 * inset]).toEqual([30, 24, 24])
  })

  it('悬停和按钮组一样盖一层悬停色，过渡时长相同', () => {
    const hover = (button: Node) => { button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) }
    expect(new Set(Object.values(each((button) => button.boxShadow, '', hover)))).toEqual(new Set(['inset 0 0 0 100vmax var(--hover)']))
    expect(new Set(Object.values(each((button) => button.transition)))).toEqual(new Set([
      'box-shadow var(--t-fast) var(--e-out),color var(--t-fast) var(--e-out),opacity var(--t-fast) var(--e-out)',
    ]))
  })

  it('禁用后变淡，下载中的按钮保持原色', () => {
    expect(new Set(Object.values(each((button) => `${button.opacity} ${button.cursor}`, 'disabled')))).toEqual(new Set(['0.45 default']))
    document.body.innerHTML = '<button type="button" class="icbtn busy" disabled><svg class="ring"></svg></button>'
    expect(getComputedStyle(document.querySelector('button')).opacity).toBe('1')
  })

  it('按下的开关是选中的样子：--selected 的底配 --on-selected 的图标', () => {
    expect(new Set(Object.values(each((button) => `${button.backgroundColor} ${button.color}`, 'aria-pressed="true"'))))
      .toEqual(new Set(['var(--selected) var(--on-selected)']))
  })

  it('圆形的图标按钮是中性底的圆，图标用正文色；按下时仍是选中的样子', () => {
    const round = (button: Node) => { (button as unknown as { classList: { add(name: string): void } }).classList.add('round') }
    expect(new Set(Object.values(each((button) => `${button.borderRadius} ${button.backgroundColor} ${button.color}`, '', round))))
      .toEqual(new Set(['var(--r-full) var(--chip) var(--ink)']))
    expect(new Set(Object.values(each((button) => button.backgroundColor, 'aria-pressed="true"', round))))
      .toEqual(new Set(['var(--selected)']))
  })

  it('别的样式表不改图标按钮的尺寸、颜色、边框或光标，只管放在哪里和显不显', () => {
    expect([...HOOKS]).toEqual(expect.arrayContaining([
      'back', 'rowx', 'busy', 'dots', 'rx', 'tagchip-edit', 'cmx', 'ax', 'row-delete', 'plan-rename',
      'tbtn', 'appbtn', 'upclose',
    ]))
    const names = new RegExp(`\\.(?:${['icbtn', ...HOOKS].join('|')})(?![\\w-])`)
    const offenders = STYLESHEETS.filter((path) => path !== ICON_BUTTON).flatMap((path) => rulesOf(read(path))
      .filter(([selector, body]) => styles(selector, names) && LOOK.test(body))
      .map(([selector]) => `${path}  ${selector}`))
    expect(offenders).toEqual([])
  })

  it('表头末格的加号和齿轮只在一处定义', () => {
    const defining = (name: string) => STYLESHEETS.filter((path) => rulesOf(read(path))
      .some(([selector]) => selector.split(',').some((part) => part.trim() === `.${name}`)))
    expect(defining('th-add')).toEqual([join('routes', 'shell.css')])
  })
})
