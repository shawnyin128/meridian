import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error The screen-stylesheet guard is plain JavaScript without type declarations.
import { rendererFiles, screenViolations } from '../../../../scripts/check-screen-css.mjs'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every selector of every renderer stylesheet with its rule body, as `path: selector`, comments removed. */
const SELECTORS = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.css'))
  .flatMap((path) => [...readFileSync(join(RENDERER, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .flatMap((match) => match[1]!.split(',').map((selector) => ({
      path, selector: selector.trim(), body: match[2]!,
    }))))

/** The declarations of every rule for `selector` in the stylesheet at `path`, as property: value. */
const declared = (path: string, selector: string) => Object.fromEntries(SELECTORS
  .filter((rule) => rule.path === path && rule.selector === selector)
  .flatMap((rule) => rule.body.split(';'))
  .map((declaration) => [declaration.slice(0, declaration.indexOf(':')).trim(), declaration.slice(declaration.indexOf(':') + 1).trim()])
  .filter(([property]) => property !== ''))

/**
 * The classes of the menu surface, its items, separator and input row and the filter menu's trigger,
 * and the classes screens hand a menu or popover surface, or the filter menu's trigger, to name it.
 */
const MENU_CLASSES = new Set(['ctxmenu', 'pickhits', 'mi', 'msep', 'mi-in', 'filter-menu',
  'sres', 'colpop', 'review-decline', 'selection-tools', 'paper-row-menu', 'read-state-filter'])

/** The classes of the menu anatomy and the class a shared component hands its popover's surface. */
const ANATOMY = /\.(ctxmenu|pickhits|mi|mi-in|msep|rh|rg|schedule-pop)(?![\w-])/
/** Declarations that draw: fill, colour, border, radius, shadow, padding, margin and type. */
const LOOK = /^(background|color|border|box-shadow|padding|margin|font|line-height)/

/** The first class of the element a selector selects, outside `:not()` and `:has()`. */
const subjectClass = (selector: string) => /\.(-?[_a-zA-Z][\w-]*)/
  .exec(selector.split(/\s*[\s>+~]\s*(?![^(]*\))/).at(-1)!.replace(/:(not|has)\((?:[^()]|\([^()]*\))*\)/g, ''))?.[1]

/** A selector that styles a row, a heading or a group label of a candidate list. */
const CANDIDATE = /\.rrow\b|\.pickhits li\b|\.(pickhits|sres|cres) \.r[hg]\b/

describe('菜单与候选列表的条目', () => {
  it('候选行只按当前行高亮,指针悬停不另画一行', () => {
    const hovered = SELECTORS
      .filter((rule) => CANDIDATE.test(rule.selector) && rule.selector.includes(':hover'))
      .map((rule) => `${rule.path}: ${rule.selector}`)
    expect(hovered).toEqual([])
  })

  it('候选行的高度、内边距、分隔线与高亮只来自共享的菜单条目规则', () => {
    const copies = SELECTORS
      .filter((rule) => rule.path !== join('components', 'ActionMenu.css') && CANDIDATE.test(rule.selector)
        && /(^|;)\s*(padding|height|min-height|border-bottom|border-radius|background)\s*:/.test(rule.body))
      .map((rule) => `${rule.path}: ${rule.selector}`)
    expect(copies).toEqual([])
  })

  it('菜单、右键菜单、弹层和候选列表是同一个面，画在 ActionMenu.css 里：浮层底色、菜单圆角、二级阴影和菜单内边距', () => {
    const sheet = join('components', 'ActionMenu.css')
    const surface = { background: 'var(--raised)', 'border-radius': 'var(--r-menu)', 'box-shadow': 'var(--sh-2)', padding: 'var(--pad-menu)' }
    expect([declared(sheet, '.ctxmenu'), declared(sheet, '.pickhits')]).toEqual([expect.objectContaining(surface), expect.objectContaining(surface)])
  })

  it('弹层按内容换面：编辑器贴着边，表单四周留 8px、至少 240px 宽，工具条和它的工具一样宽', () => {
    const sheet = join('components', 'ActionMenu.css')
    expect([declared(sheet, '.ctxmenu--editor'), declared(sheet, '.ctxmenu--form'), declared(sheet, '.ctxmenu--toolbar')]).toEqual([
      expect.objectContaining({ padding: '0', overflow: 'hidden', 'min-width': '210px' }),
      expect.objectContaining({ padding: 'var(--sp-8)', 'min-width': '240px' }),
      expect.objectContaining({ width: 'min-content', 'min-width': '0' }),
    ])
  })

  it('编辑器面画编辑器的各部分：标题下一道分隔、输入行留 8px、分隔线贴边、删除行落在菜单的内边距上', () => {
    const sheet = join('components', 'ActionMenu.css')
    expect([
      declared(sheet, '.ctxmenu--editor .rh'), declared(sheet, '.ctxmenu--editor .mi-in'),
      declared(sheet, '.ctxmenu--editor .msep'), declared(sheet, '.ctxmenu--editor .mi'),
    ]).toEqual([
      expect.objectContaining({ padding: 'var(--sp-8) var(--sp-12)', 'border-bottom': '1px solid var(--sep2)' }),
      expect.objectContaining({ display: 'flex', padding: 'var(--sp-8)' }),
      expect.objectContaining({ margin: '0 var(--sp-6)' }),
      expect.objectContaining({ margin: '0 var(--pad-menu) var(--pad-menu)' }),
    ])
  })

  it('别的共享组件不改菜单的面、条目、标题和输入行：文本编辑框和排期弹层的样子来自编辑器面和表单面', () => {
    const own = new Set([join('components', 'ActionMenu.css'), join('components', 'PickerPopover.css')])
    const restyled = SELECTORS
      .filter((rule) => /^components\/[^/]+\.css$/.test(rule.path.split('\\').join('/')) && !own.has(rule.path))
      .filter((rule) => ANATOMY.test(rule.selector.split(/\s*[\s>+~]\s*(?![^(]*\))/).at(-1)!))
      .filter((rule) => rule.body.split(';').some((declaration) => LOOK.test(declaration.trim())))
      .map((rule) => `${rule.path}: ${rule.selector}`)
    expect(restyled).toEqual([])
  })

  it('筛选按钮把名字和每个选项都叠在同一格里占位,只显出当前那个,所以换选项时宽度不变', () => {
    const sheet = join('components', 'FilterMenu.css')
    expect([declared(sheet, '.filter-menu-value'), declared(sheet, '.filter-menu-value>*'), declared(sheet, '.filter-menu-ghost'),
      declared(sheet, '.filter-menu-ghost::before')]).toEqual([
      expect.objectContaining({ display: 'grid' }),
      expect.objectContaining({ 'grid-area': '1/1' }),
      expect.objectContaining({ visibility: 'hidden' }),
      expect.objectContaining({ content: 'attr(data-label)' }),
    ])
  })

  it('候选列表和输入框一样宽、最高 240px；长列表最高 440px；全局搜索的结果比搜索框宽 270px、不限高，压在别的浮层下面', () => {
    const sheet = join('components', 'PickerPopover.css')
    expect([declared(sheet, '.pickhits'), declared(sheet, '.pickhits--tall'), declared(sheet, '.pickhits--wide')]).toEqual([
      expect.objectContaining({ width: 'var(--radix-popover-trigger-width)', 'min-width': '190px', 'max-height': '240px', overflow: 'auto' }),
      expect.objectContaining({ 'max-height': 'min(440px,55vh)', 'overflow-y': 'auto' }),
      expect.objectContaining({ width: 'calc(var(--radix-popover-trigger-width) + 270px)', 'max-height': 'none', 'z-index': '40' }),
    ])
  })

  it('屏幕样式表不改菜单、弹层和候选列表：面、条目、分隔线、输入行和筛选按钮只由它们的组件画', () => {
    const restyled = (screenViolations(rendererFiles()) as { file: string; line: number; selector: string; property: string }[])
      .filter((violation) => MENU_CLASSES.has(subjectClass(violation.selector) ?? ''))
      .map((violation) => `${violation.file}:${violation.line}: ${violation.selector} { ${violation.property} }`)
    expect(restyled).toEqual([])
  })
})
