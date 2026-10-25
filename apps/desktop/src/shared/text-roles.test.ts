// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Style = {
  fontSize: string; fontWeight: string; color: string; textTransform: string; letterSpacing: string
  gridTemplateColumns: string
  length: number; [index: number]: string
  getPropertyValue(name: string): string
}
type Element = { matches(selector: string): boolean }
type Window = {
  document: {
    head: { innerHTML: string }; body: { innerHTML: string }; documentElement: Element
    querySelector(selector: string): Element | null
    styleSheets: Iterable<{ cssRules: Iterable<{ selectorText?: string; style?: Style }> }>
  }
  getComputedStyle(element: Element): Style
}
const { document, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')
const sheet = (path: string) => readFileSync(join(RENDERER, path), 'utf8')

/** Every stylesheet a title, a heading or a small label below takes its type from, in bundle order. */
const SHEETS = [
  'shell/tokens.css', 'routes/shell.css', 'components/PageShell.css', 'components/CollapsibleGroup.css',
  'components/ResearchObjectCard.css', 'components/paper/PaperCard.css', 'components/paper/PaperUnderstanding.css',
  'components/project/ProjectIdentity.css', 'components/project/ResearchGraph.css',
  'components/paper-table/PaperTable.css', 'shell/AppShell.css', 'routes/Wiki.css', 'routes/Projects.css',
  'routes/Ideas.css', 'routes/Watches.css', 'components/SidePanel.css',
]

/**
 * One sample of every title, heading and small label: the screen's page head and its sections, a group
 * inside a section or a card and a rail section, the inbox's and the review queue's foldable groups and
 * a quiet archive group, a detail panel's title, the paper detail's title, the cards' titles, a Wiki
 * body's Markdown headings, the sidebar's group label, and the labels inside the paper and project cards.
 */
const MARKUP = `
<div class="desk"><div class="desk-head"><span class="t" id="t">垃圾桶 · 5</span></div><div class="desk-body">
  <div class="section-heading section-heading--page" id="section">论文推送 · 1</div>
  <div class="section-heading section-heading--group" id="group">论文库</div>
  <div class="section-heading section-heading--rail" id="rail">属性</div>
  <section class="collapsible-group"><div class="collapsible-group-head"><button class="collapsible-group-toggle" id="fold">主题 · speculative decoding</button></div></section>
  <section class="collapsible-group collapsible-group--quiet"><div class="collapsible-group-head"><button class="collapsible-group-toggle" id="quiet">已归档 · 2</button></div></section>
  <header class="panel-head"><div class="panel-head-title" id="panel">基线：独立草稿模型</div></header>
  <header class="panel-head"><div class="panel-head-title" id="paper-detail"><button class="metadata-editable">QuIP#: Even Better LLM Quantization</button></div></header>
  <article class="paper-card"><div class="paper-card-heading"><h3 id="paper-card">Acceptance Is Not Speed</h3></div>
    <section class="paper-card-section"><div class="paper-card-label" id="card-label">摘要</div></section></article>
  <article class="research-object-card research-object-card--grid wkcard"><div class="wt"><button class="tt" id="wiki-card">KV cache 压缩</button></div></article>
  <span class="project-identity header"><span class="project-identity-name" id="project-card">MoE 路由分析</span></span>
  <div class="idea-card-title-row"><strong id="idea-card">蒸馏预算</strong></div>
  <span class="project-card-label" id="project-label">当前目标</span>
  <div class="paper-understanding-label" id="understanding-label">随笔</div>
  <div class="wkpage"><div class="wkmain">
    <div class="section-heading" id="body-heading">推测解码</div>
    <div class="md" id="md"><h2 id="h2-first">问题</h2><p>正文</p><h1 id="h1">一级</h1><h2 id="h2">怎么读这一页</h2><h3 id="h3">实验</h3><h4 id="h4">细节</h4></div>
    <div class="wkprops" id="props"><div class="pk">当前目标</div><div class="pv">x</div></div>
  </div></div>
</div></div>
<aside class="sidebar"><div class="sb-h" id="sidebar-label">收件</div></aside>`

beforeAll(() => {
  document.head.innerHTML = `<style>${SHEETS.map(sheet).join('\n')}</style>`
  document.body.innerHTML = MARKUP
})

/** A token's value at the root, following `var()` until it reaches a literal. */
function token(value: string): string {
  const named = /^var\((--[\w-]+)\)$/.exec(value.trim())
  if (named === null) return value.trim()
  return token(getComputedStyle(document.documentElement).getPropertyValue(named[1]!))
}

const style = (id: string): Style => {
  const element = document.querySelector(`#${id}`)
  if (element === null) throw new Error(`没有 #${id}`)
  return getComputedStyle(element)
}
/**
 * Every `property: value` that a loaded rule matching `#id` declares for a property starting with
 * `prefix`. jsdom drops a shorthand that holds a var() from the computed style; its rule keeps it.
 */
const declared = (id: string, prefix: string): string[] => {
  const element = document.querySelector(`#${id}`)!
  return [...document.styleSheets].flatMap((held) => [...held.cssRules]).flatMap(({ selectorText, style: rule }) => {
    if (selectorText === undefined || rule === undefined || !element.matches(selectorText)) return []
    return Array.from({ length: rule.length }, (_, index) => rule[index]!)
      .filter((property) => property.startsWith(prefix))
      .map((property) => `${selectorText} ${property}: ${rule.getPropertyValue(property)}`)
  })
}
const px = (id: string): number => Number.parseFloat(token(style(id).fontSize))
const weight = (id: string): string => token(style(id).fontWeight)

describe('文字角色', () => {
  it('页面标题比小节标题大一级，小节、分组、卡片标题依次往下一级', () => {
    expect(px('section'), '页面标题对小节').toBeLessThan(px('t'))
    expect(px('group'), '小节对分组').toBeLessThan(px('section'))
    expect(px('paper-card'), '分组对论文卡片的标题').toBeLessThan(px('group'))
    expect([px('wiki-card'), px('project-card'), px('idea-card')], '每种卡片的标题同一个字号')
      .toEqual([px('paper-card'), px('paper-card'), px('paper-card')])
  })

  it('标题只有一种字重：页面标题、小节、分组、侧栏、可折叠分组、详情面板、卡片和 Markdown 的标题都一样', () => {
    const titles = ['t', 'section', 'group', 'rail', 'fold', 'panel', 'paper-detail', 'paper-card', 'wiki-card',
      'project-card', 'idea-card', 'h1', 'h2', 'h3', 'h4']
    expect(Object.fromEntries(titles.map((id) => [id, weight(id)])))
      .toEqual(Object.fromEntries(titles.map((id) => [id, weight('section')])))
  })

  it('详情面板的标题和可折叠分组都是小节这一级', () => {
    expect([px('panel'), px('paper-detail'), px('fold')]).toEqual([px('section'), px('section'), px('section')])
  })

  it('Wiki 正文里的 Markdown 标题比小节低一级，不画小节的分隔线，也不往里缩', () => {
    expect([px('h1'), px('h2-first'), px('h2')], '一级和二级标题是分组这一级').toEqual([px('group'), px('group'), px('group')])
    expect([px('h3'), px('h4')], '三级和四级标题是卡片标题这一级').toEqual([px('paper-card'), px('paper-card')])
    expect(declared('h2', 'border'), '二级标题上面没有小节的分隔线').toEqual([])
    expect(declared('md', 'padding'), 'Markdown 容器不往里缩').toEqual([])
  })

  it('小标签只有一种：侧栏分组、卡片里的标签、项目卡片的标签、随笔和笔记的标签、归档分组都一样，不转大写也不加字距', () => {
    const labels = ['sidebar-label', 'card-label', 'project-label', 'understanding-label', 'quiet']
    const look = (id: string) => [px(id), weight(id), style(id).color, style(id).textTransform, style(id).letterSpacing]
    const first = look('sidebar-label')
    expect(Object.fromEntries(labels.map((id) => [id, look(id)])))
      .toEqual(Object.fromEntries(labels.map((id) => [id, first])))
    expect(first.slice(3), '不转大写，不加字距').toEqual(['none', 'normal'])
    expect(first[0], '小标签比次要文字小').toBeLessThan(px('paper-card'))
  })

  it('没有一张样式表给文字转大写或加字距：两者都会把中文标签拉开或改样子', () => {
    const offenders = readdirSync(RENDERER, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
      .map((entry) => relative(RENDERER, join(entry.parentPath, entry.name)))
      .flatMap((file) => {
        const css = sheet(file).replace(/\/\*[\s\S]*?\*\//g, '')
        return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selector, body]) => body!.split(';')
          .map((declaration) => declaration.trim())
          .filter((declaration) => /^(text-transform:(?!inherit|none)|letter-spacing:(?!inherit|normal))/.test(declaration))
          // An API key's dots and its last characters are spaced so they can be told apart; no word is spaced.
          .filter(() => !/\.service-key-(mask|tail)$/.test(selector!.trim()))
          .map((declaration) => `${file}: ${selector!.trim()} { ${declaration} }`))
      })
    expect(offenders).toEqual([])
  })

  it('属性栏的标签列和最长的标签一样宽', () => {
    expect(style('props').gridTemplateColumns).toMatch(/^max-content /)
  })
})
