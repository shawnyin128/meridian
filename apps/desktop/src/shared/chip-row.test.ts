// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error The screen-stylesheet guard is plain JavaScript without type declarations.
import { rendererFiles, screenViolations } from '../../../../scripts/check-screen-css.mjs'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): object }
  getComputedStyle(element: object): {
    cursor: string; marginRight: string; display: string; flexWrap: string; paddingLeft: string; verticalAlign: string
  }
}
const { document, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** The token layer and every shared component's stylesheet: what a chip looks like with no screen's rules. */
const SHARED = ['shell/tokens.css', ...readdirSync(join(RENDERER, 'components')).filter((name) => name.endsWith('.css')).map((name) => `components/${name}`)]
  .map((path) => readFileSync(join(RENDERER, path), 'utf8'))

/** The first class of the element a selector selects, outside `:not()` and `:has()`. */
const subjectClass = (selector: string) => /\.(-?[_a-zA-Z][\w-]*)/
  .exec(selector.split(/\s*[\s>+~]\s*(?![^(]*\))/).at(-1)!.replace(/:(not|has)\((?:[^()]|\([^()]*\))*\)/g, ''))?.[1]

describe('chip 行', () => {
  beforeEach(() => {
    document.head.innerHTML = SHARED.map((css) => `<style>${css}</style>`).join('')
  })

  it('关联行把标签和 chip 排成一行,放不下就换行', () => {
    document.body.innerHTML = '<div class="wkrel"><span class="rl">Wiki</span><span class="tag tag--chip tag--neutral tagchip">KV 量化</span></div>'
    const row = getComputedStyle(document.querySelector('.wkrel'))
    expect([row.display, row.flexWrap]).toEqual(['flex', 'wrap'])
  })

  it('关联行里的 chip 只有能打开东西时才是手指:链到 Wiki 页或网址的 chip 和按钮 chip 是,别的是默认箭头', () => {
    document.body.innerHTML = '<div class="wkrel">'
      + '<span class="tag tag--chip tag--neutral tagchip plain" data-row-actions=""><span class="fade-text tagchip-text">笔记</span></span>'
      + '<span class="tag tag--chip tag--neutral tagchip page" data-row-actions="" data-actionable="" data-wk="topics/kv"><button type="button" class="tagchip-open">KV 量化</button></span>'
      + '<span class="tag tag--chip tag--neutral tagchip url" data-row-actions="" data-actionable="" data-url="https://arxiv.org"><button type="button" class="tagchip-open">arXiv</button></span>'
      + '<button type="button" class="tag tag--chip tag--neutral tagchip link">推测解码</button></div>'
    expect(['plain', 'page', 'url', 'link'].map((name) => getComputedStyle(document.querySelector(`.${name}`)).cursor))
      .toEqual(['default', 'pointer', 'pointer', 'pointer'])
  })

  it('散排的 chip 后面的 ＋ 和 chip 顶对顶排在一行:它没有字,不拿加号的底边去对 chip 里字的基线', () => {
    document.body.innerHTML = '<span class="metadata-field"><span class="tag tag--chip tag--neutral tagchip">KV 量化</span>'
      + '<button type="button" class="add-action add-action-icon add-action-chip tagchip tagadd" aria-label="添加领域"><svg></svg></button></span>'
    expect(getComputedStyle(document.querySelector('.tagadd')).verticalAlign).toBe('top')
  })

  it('chip 的名字是它的按钮,按钮自己不画边框、底色和内边距', () => {
    document.body.innerHTML = '<span class="tag tag--chip tag--neutral tagchip"><button type="button" class="tagchip-open">KV 量化</button></span>'
    const name = getComputedStyle(document.querySelector('.tagchip-open'))
    expect([name.display, name.paddingLeft]).toEqual(['flex', '0px'])
  })

  it('routes/shell.css 不再画 chip 和关联行,屏幕样式表也不改 chip 的外边距:散排的 chip 之间留 4px,关联行里的 chip 只靠行距隔开,都只来自 ChipList.css', () => {
    const offenders = (screenViolations(rendererFiles()) as { file: string; line: number; selector: string; property: string }[])
      .filter((violation) => (violation.file === 'routes/shell.css' && /\.(tagchip|tagchip-open|wkrel)(?![\w-])/.test(violation.selector))
        || (subjectClass(violation.selector) === 'tagchip' && /^margin/.test(violation.property)))
      .map((violation) => `${violation.file}:${violation.line}: ${violation.selector} { ${violation.property} }`)
    expect(offenders).toEqual([])
    const own = readFileSync(join(RENDERER, 'components/ChipList.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect([/(?:^|\})\s*\.tagchip\{margin:1px var\(--sp-4\) 1px 0\}/, /(?:^|\})\s*\.wkrel \.tagchip\{[^}]*\bmargin:0[;}]/].map((rule) => rule.test(own)))
      .toEqual([true, true])
  })
})
