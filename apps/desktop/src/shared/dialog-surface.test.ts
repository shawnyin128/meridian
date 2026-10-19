import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

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

/**
 * Class names a dialog's own stylesheet could give its surface or its title. Only ModalDialog.css
 * styles the surface and the title role; a dialog's stylesheet only lays things out inside them.
 */
const SURFACES = ['setdlg', 'wiki-form', 'idea-dialog', 'idea-graph-dialog', 'workspace-dialog', 'about-pop', 'cfpop', 'dlg']
const TITLES = ['set-t', 'dlg-t', 'wiki-form-title', 'idea-dialog-title', 'idea-graph-dialog-title', 'workspace-dialog-title', 'about-name']

/** Whether the last compound of `selector`, the element it styles, carries one of `classes`. */
const styles = (selector: string, classes: string[]): boolean => {
  const subject = selector.split(/[\s>+~]+/).at(-1)!
  return classes.some((name) => new RegExp(`\\.${name}(?![\\w-])`).test(subject))
}

const declares = (body: string, properties: string[]): boolean =>
  properties.some((property) => new RegExp(`(^|;)\\s*${property}\\s*:`).test(body))

/** The declared value of `property` in `body`, or undefined. */
const value = (body: string, property: string): string | undefined =>
  new RegExp(`(?:^|;)\\s*${property}\\s*:([^;]+)`).exec(body)?.[1]?.trim()

/** The rules of ModalDialog.css whose whole selector is `selector`. */
const ruleOf = (selector: string): string => SELECTORS
  .filter((rule) => rule.path === join('components', 'ModalDialog.css') && rule.selector === selector)
  .map((rule) => rule.body).join(';')

describe('对话框的面', () => {
  it('遮罩与每个对话框的面同在一层:后打开的对话框排在后面,它的遮罩就盖住打开它的那个', () => {
    const layers = SELECTORS
      .filter((rule) => styles(rule.selector, ['scrim', 'modal', ...SURFACES]) && value(rule.body, 'z-index') !== undefined)
      .map((rule) => `${rule.path}: ${rule.selector} ${value(rule.body, 'z-index')}`)
    expect(new Set(layers.map((layer) => layer.split(' ').at(-1))).size, layers.join('\n')).toBe(1)
  })

  it('是最上一阶的 --raised,带对话框的圆角与阴影', () => {
    expect([value(ruleOf('.modal'), 'background'), value(ruleOf('.modal'), 'border-radius'), value(ruleOf('.modal'), 'box-shadow')])
      .toEqual(['var(--raised)', 'var(--r-dialog)', 'var(--sh-3)'])
  })

  it('有高度上限:正文在标题与按钮之间滚动,按钮钉在下面', () => {
    expect(value(ruleOf('.modal'), 'max-height')).toMatch(/^calc\(100vh - /)
    expect([value(ruleOf('.modal'), 'display'), value(ruleOf('.modal'), 'flex-direction')]).toEqual(['flex', 'column'])
    expect([value(ruleOf('.modal-body'), 'overflow'), value(ruleOf('.modal-body'), 'min-height')]).toEqual(['auto', '0'])
    expect(value(ruleOf('.modal-actions'), 'flex')).toBe('none')
  })

  it('只由 ModalDialog 画:各个对话框不再自定底色、圆角、阴影、宽度、层级或位置', () => {
    const copies = SELECTORS
      .filter((rule) => styles(rule.selector, SURFACES) && declares(rule.body, [
        'background', 'background-color', 'border-radius', 'box-shadow', 'width', 'min-width', 'max-width',
        'z-index', 'position', 'left', 'top', 'transform', 'inset',
      ]))
      .map((rule) => `${rule.path}: ${rule.selector}`)
    expect(copies).toEqual([])
  })

  it('标题只有一个字号与字重,各个对话框的标题不再自定', () => {
    const copies = SELECTORS
      .filter((rule) => styles(rule.selector, TITLES) && declares(rule.body, ['font-size', 'font-weight']))
      .map((rule) => `${rule.path}: ${rule.selector}`)
    expect(copies).toEqual([])
  })
})
