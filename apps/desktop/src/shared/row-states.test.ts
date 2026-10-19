// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = { dispatchEvent(event: object): boolean }
type Style = {
  backgroundColor: string; backgroundImage: string; borderColor: string; boxShadow: string; color: string
  fill: string; stroke: string; opacity: string; getPropertyValue(name: string): string
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

const STYLES = [
  'shell/tokens.css', 'components/StructuredList.css', 'shell/AppShell.css', 'components/paper-table/PaperTable.css',
  'components/ResearchObjectCard.css', 'components/project/ResearchGraph.css', 'routes/Settings.css',
  'components/timeline/TimelineBoard.css', 'routes/Ideas.css',
].map((path) => readFileSync(join(import.meta.dirname, '..', 'renderer', path), 'utf8'))

/** The style of `shown` inside fresh `markup`, after the pointer entered `hovered` when one is given. */
const styleOf = (markup: string, shown: string, hovered?: string): Style => {
  document.body.innerHTML = markup
  if (hovered !== undefined) document.querySelector(hovered).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  return getComputedStyle(document.querySelector(shown))
}

const HOVER = 'linear-gradient(var(--hover),var(--hover))'
const TABLE_ROW = (cls: string) => `<table class="ptable"><tbody><tr class="${cls}"><td class="trunc"><span class="ci"><span class="pt-title">EAGLE</span></span></td><td class="pt-dim">2024</td></tr></tbody></table>`

describe('选中的样子只有一种', () => {
  beforeEach(() => {
    document.head.innerHTML = STYLES.map((css) => `<style>${css}</style>`).join('')
  })

  it('选中的列表行、侧栏行、研究地图分组和卡片都铺选中色，字用选中色上的强调色', () => {
    const looks = {
      row: styleOf('<div class="structured-list"><button class="structured-row structured-row--selected">项目</button></div>', '.structured-row'),
      sidebar: styleOf('<button class="nav-row srow on"><span class="ic"></span>论文</button>', '.srow'),
      map: styleOf('<div class="research-map-groups structured-list"><button class="structured-row structured-row--selected research-map-group">KV cache</button></div>', '.research-map-group'),
      card: styleOf('<article class="research-object-card selected">想法</article>', '.research-object-card'),
    }
    expect(Object.fromEntries(Object.entries(looks).map(([host, style]) => [host, [style.backgroundColor, style.color, style.boxShadow]])))
      .toEqual({
        row: ['var(--selected)', 'var(--on-selected)', ''],
        sidebar: ['var(--selected)', 'var(--on-selected)', ''],
        map: ['var(--selected)', 'var(--on-selected)', ''],
        card: ['var(--selected)', 'var(--on-selected)', ''],
      })
    expect(looks.card.borderColor).not.toBe('var(--accent)')
  })

  it('选中的想法卡片，标题也用选中色上的强调色', () => {
    const card = '<article class="research-object-card selected idea-card"><div class="idea-card-title-row"><strong>草稿头共享浅层 KV</strong></div></article>'
    expect(styleOf(card, 'strong').color).toBe('var(--on-selected)')
  })

  it('选中的侧栏行图标跟着字用同一个颜色', () => {
    expect(styleOf('<button class="nav-row srow on"><span class="ic"></span>论文</button>', '.ic').color).toBe('var(--on-selected)')
  })

  it('选中的论文行铺选中色，标题用选中色上的强调色，左边不再画强调色竖条', () => {
    expect(styleOf(TABLE_ROW('selected'), 'tr').getPropertyValue('--row-bg')).toBe('var(--selected)')
    expect(styleOf(TABLE_ROW('selected'), '.pt-title').color).toBe('var(--on-selected)')
    expect(styleOf(TABLE_ROW('selected'), 'td').boxShadow).not.toContain('var(--accent)')
    expect(styleOf(TABLE_ROW('selected'), '.ci', 'td').boxShadow).not.toContain('var(--accent)')
  })

  it('选中的科研图节点铺选中色，标签用选中色上的强调色，不再描一圈墨色粗边', () => {
    const node = '<svg><g class="rgn supported sel"><rect class="rgn-box"></rect><text>宽树</text></g></svg>'
    const box = styleOf(node, '.rgn-box')
    expect([box.fill, box.stroke]).toEqual(['var(--selected)', 'var(--sep)'])
    expect(styleOf(node, 'text').fill).toBe('var(--on-selected)')
  })

  it('选中的外观选项铺选中色，名字用选中色上的强调色，不再画强调色边框和光圈', () => {
    const choice = '<button class="appearance-choice" aria-checked="true"><span class="appearance-preview"></span><span class="appearance-label">浅色</span></button>'
    const preview = styleOf(choice, '.appearance-preview')
    expect(preview.backgroundColor).toBe('var(--selected)')
    expect(preview.borderColor).not.toBe('var(--accent)')
    expect(preview.boxShadow).not.toContain('var(--accent-soft)')
    expect(styleOf(choice, '.appearance-label').color).toBe('var(--on-selected)')
  })
})

describe('悬停的反馈不被任何状态盖掉', () => {
  beforeEach(() => {
    document.head.innerHTML = STYLES.map((css) => `<style>${css}</style>`).join('')
  })

  it('选中的列表行和侧栏行悬停时，选中色上再盖一层悬停色', () => {
    const row = styleOf('<div class="structured-list"><button class="structured-row structured-row--selected">项目</button></div>', '.structured-row', '.structured-row')
    expect([row.backgroundColor, row.backgroundImage]).toEqual(['var(--selected)', HOVER])
    const sidebar = styleOf('<button class="nav-row srow on">论文</button>', '.srow', '.srow')
    expect([sidebar.backgroundColor, sidebar.backgroundImage]).toEqual(['var(--selected)', HOVER])
  })

  it('选中的论文行悬停时，选中色和悬停色叠在一起', () => {
    const tr = styleOf(TABLE_ROW('selected'), 'tr', 'td')
    expect([tr.getPropertyValue('--row-bg'), tr.getPropertyValue('--row-over')]).toEqual(['var(--selected)', 'var(--hover)'])
    expect(styleOf(TABLE_ROW('selected'), 'td.pt-dim').backgroundImage).toContain('var(--row-over)')
  })

  it('进行中、逾期、P0 的时间条悬停时都盖上悬停色', () => {
    for (const state of ['active', 'active overdue priority-p0', 'plan priority-p1']) {
      const bar = styleOf(`<div class="gbar ${state}"><span class="gbar-label">实现动态树宽度</span></div>`, '.gbar', '.gbar')
      expect(bar.backgroundImage, state).toBe(HOVER)
    }
  })

  it('已完成的时间条悬停时不再变淡，悬停色看得见', () => {
    const rest = styleOf('<div class="gbar dim">补跑基线</div>', '.gbar')
    const hovered = styleOf('<div class="gbar dim">补跑基线</div>', '.gbar', '.gbar')
    expect([rest.opacity, hovered.opacity, hovered.backgroundImage]).toEqual(['0.45', '1', HOVER])
  })

  it('当前路径、进行中、关联想法和选中的科研图节点悬停时，都显出同一层悬停色', () => {
    for (const state of ['supported', 'supported active-path-node-graph', 'supported active-leaf', 'supported idea-related', 'supported sel']) {
      const node = `<svg><g class="rgn ${state}"><rect class="rgn-box"></rect><rect class="rgn-hover"></rect><text>宽树</text></g></svg>`
      const overlay = styleOf(node, '.rgn-hover', '.rgn')
      expect([overlay.fill, overlay.opacity], state).toEqual(['var(--hover)', '1'])
      expect(styleOf(node, '.rgn-hover').opacity, state).toBe('0')
    }
  })
})
