// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Style = {
  backgroundColor: string; backgroundImage: string; color: string; boxShadow: string; opacity: string
  getPropertyValue(name: string): string
}
type Rule = { selectorText?: string; style: { getPropertyValue(name: string): string } }
type Element = { dispatchEvent(event: object): boolean; matches(selector: string): boolean }
type Window = {
  document: {
    head: { innerHTML: string }
    body: { innerHTML: string }
    querySelector(selector: string): Element
    styleSheets: Iterable<{ cssRules: Iterable<Rule> }>
  }
  MouseEvent: new (type: string, init: { bubbles: boolean }) => object
  getComputedStyle(element: Element): Style
}
const { document, MouseEvent, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')

const SHEETS = ['shell/tokens.css', 'components/Item.css', 'components/List.css']
  .map((path) => readFileSync(join(RENDERER, path), 'utf8'))

/** The root tokens of tokens.css, so a length written through var() and calc() can be added up. */
const TOKENS = new Map([...SHEETS[0]!.slice(0, SHEETS[0]!.indexOf('}')).matchAll(/(--[\w-]+):([^;]+);/g)]
  .map((match) => [match[1]!, match[2]!.trim()]))

/** A length in px from a value of px, var() and calc() sums. */
function px(value: string): number {
  let text = value
  for (let depth = 0; depth < 8 && text.includes('var('); depth += 1) {
    text = text.replace(/var\((--[\w-]+)\)/g, (_, name: string) => TOKENS.get(name) ?? '0px')
  }
  return [...text.replace(/calc\(|\)/g, '').matchAll(/([+-]?)\s*([\d.]+)px/g)]
    .reduce((sum, [, sign, number]) => sum + (sign === '-' ? -1 : 1) * Number(number), 0)
}

describe('行和卡片的内缩与样子', () => {
  const styleOf = (markup: string, shown: string, hovered?: string): Style => {
    document.body.innerHTML = markup
    if (hovered !== undefined) document.querySelector(hovered).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    return getComputedStyle(document.querySelector(shown))
  }

  beforeEach(() => {
    document.head.innerHTML = SHEETS.map((css) => `<style>${css}</style>`).join('')
  })

  it('卡片、外框列表里的行和嵌入列表里的行，内容都从外沿往里同一个距离开始，混排时对齐', () => {
    // jsdom drops a shorthand that holds var() from the computed style, so the declared edge and
    // padding are read from the rules, later rules winning.
    const left = (selector: string) => {
      const element = document.querySelector(selector)
      const parts = (value: string) => value.trim().split(/\s+(?![^(]*\))/)
      let edge = '0px'
      let pad = '0px'
      for (const rule of [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules])) {
        if (rule.selectorText === undefined || !element.matches(rule.selectorText)) continue
        const { style } = rule
        if (style.getPropertyValue('border') !== '') edge = parts(style.getPropertyValue('border'))[0]!
        if (style.getPropertyValue('padding') !== '') {
          const sides = parts(style.getPropertyValue('padding'))
          pad = sides[3] ?? sides[1] ?? sides[0]!
        }
        if (style.getPropertyValue('padding-inline') !== '') pad = parts(style.getPropertyValue('padding-inline'))[0]!
      }
      return px(edge) + px(pad)
    }
    const start = (markup: string, item: string, outer?: string) => {
      document.body.innerHTML = markup
      return (outer === undefined ? 0 : left(outer)) + left(item)
    }
    const card = start('<article class="item item--card">卡片</article>', '.item')
    expect(card).toBe(px('var(--item-inset)') + 1)
    expect([
      start('<div class="list"><div class="item item--row">外框里的行</div></div>', '.item', '.list'),
      start('<div class="list list--embedded"><div class="item item--row">嵌入的行</div></div>', '.item', '.list'),
      start('<div class="item item--row">单独的行</div>', '.item'),
    ]).toEqual([card, card, card])
  })

  it('嵌在卡片正文或提示框里的列表，行从那块内容的边开始；标了颜色的卡片换上颜色的前沿，内容仍在同一处开始', () => {
    const left = (markup: string, selector: string) => {
      document.body.innerHTML = markup
      const element = document.querySelector(selector)
      let edge = '0px'
      let pad = '0px'
      for (const rule of [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules])) {
        if (rule.selectorText === undefined || !element.matches(rule.selectorText)) continue
        const { style } = rule
        const parts = (value: string) => value.trim().split(/\s+(?![^(]*\))/)
        if (style.getPropertyValue('border') !== '') edge = parts(style.getPropertyValue('border'))[0]!
        if (style.getPropertyValue('border-left') !== '') edge = parts(style.getPropertyValue('border-left'))[0]!
        if (style.getPropertyValue('padding') !== '') { const sides = parts(style.getPropertyValue('padding')); pad = sides[3] ?? sides[1] ?? sides[0]! }
        if (style.getPropertyValue('padding-inline') !== '') pad = parts(style.getPropertyValue('padding-inline'))[0]!
        if (style.getPropertyValue('padding-left') !== '') pad = style.getPropertyValue('padding-left')
      }
      return px(edge) + px(pad)
    }
    expect(left('<div class="list list--embedded list--nested"><div class="item item--row">发现</div></div>', '.item')).toBe(0)
    expect(left('<article class="item item--card item--marked">高亮</article>', '.item'))
      .toBe(left('<article class="item item--card">笔记</article>', '.item'))
  })

  it('格子铺在列表的列上的行，带着槽也按列表的列距隔开格子，不用槽的间距', () => {
    // A subgrid's normal gap is its parent grid's, so the row's cells stand the list's column gap apart.
    const row = styleOf('<div class="item item--row item--slotted item--subgrid"><span class="item-actions"></span></div>', '.item')
    expect([row.getPropertyValue('display'), row.getPropertyValue('gap')]).toEqual(['grid', 'normal'])
  })

  it('离开列表的项淡出并滑开；关掉的行字变淡', () => {
    const leaving = styleOf('<article class="item item--card item--leaving">论文</article>', '.item')
    expect([leaving.opacity, leaving.getPropertyValue('transform')]).toEqual(['0', 'translateX(var(--sp-24))'])
    expect(styleOf('<div class="item item--row item--slotted item--muted"><span class="item-main">方向</span></div>', '.item-main').opacity)
      .toBe('0.52')
  })

  it('能打开的行和卡片悬停时盖同一层悬停色，不能打开的行不盖；选中的行和卡片都是浅强调底配强调色的字', () => {
    const HOVER = 'linear-gradient(var(--hover),var(--hover))'
    expect([
      styleOf('<button class="item item--row item--actionable">行</button>', '.item', '.item').backgroundImage,
      styleOf('<article class="item item--card item--actionable">卡片</article>', '.item', '.item').backgroundImage,
      styleOf('<div class="item item--row">行</div>', '.item', '.item').backgroundImage,
    ]).toEqual([HOVER, HOVER, 'none'])
    for (const markup of ['<div class="item item--row item--selected">行</div>', '<article class="item item--card item--selected">卡片</article>']) {
      const look = styleOf(markup, '.item')
      expect([look.backgroundColor, look.color], markup).toEqual(['var(--accent-soft)', 'var(--accent-text)'])
    }
  })

  it('拖动时行和卡片都用同一种落点线和同一种变淡', () => {
    const looks = ['item--row', 'item--card'].map((density) => [
      styleOf(`<div class="item ${density} drag-over-before" data-reorder-item="a" data-reorder-axis="y">落点</div>`, '.item').boxShadow,
      styleOf(`<div class="item ${density} drag-over-after" data-reorder-item="a" data-reorder-axis="y">落点</div>`, '.item').boxShadow,
      styleOf(`<div class="item ${density} dragging" data-reorder-item="a" data-reorder-axis="y">拿起</div>`, '.item').opacity,
    ])
    expect(looks).toEqual([
      ['0 -2px 0 0 var(--ink)', '0 2px 0 0 var(--ink)', '0.4'],
      ['0 -2px 0 0 var(--ink)', '0 2px 0 0 var(--ink)', '0.4'],
    ])
  })
})

describe('在自己里面滚动的列表', () => {
  it('封顶的、铺满容器的列表和一栏列表都从一开始就留出滚动条的位置，开始滚动时行尾的槽不挪', () => {
    const list = SHEETS[2]!.replace(/\/\*[\s\S]*?\*\//g, '')
    const gutter = (selector: string) => [...list.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selectors]) => selectors!.split(',').map((part) => part.trim()).includes(selector))
      .map(([, , body]) => /scrollbar-gutter:([^;]+)/.exec(body!)?.[1] ?? '').find((value) => value !== '') ?? 'none'
    expect(Object.fromEntries(['.list--scrollable', '.list--fill', '.list-column'].map((selector) => [selector, gutter(selector)])))
      .toEqual({ '.list--scrollable': 'stable', '.list--fill': 'stable', '.list-column': 'stable' })
  })
})
