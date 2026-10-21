// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = object
type Style = {
  transition: string; animation: string; position: string; transform: string; cursor: string
  boxShadow: string; display: string
}
type Rule = { constructor: { name: string }; name?: string; cssText: string }
type Window = {
  document: {
    head: { innerHTML: string }
    body: { innerHTML: string }
    querySelector(selector: string): Node
    styleSheets: Iterable<{ cssRules: Iterable<Rule> }>
  }
  getComputedStyle(element: Node): Style
}
const { document, getComputedStyle } = globalThis as unknown as Window

const stylesheet = (path: string) => readFileSync(join(import.meta.dirname, '..', 'renderer', path), 'utf8')
const STYLES = [
  'shell/AppShell.css', 'routes/Reader.css', 'components/DetailPanel.css', 'routes/ProjectDetail.css',
  'components/paper-table/PaperTable.css', 'components/CollapsibleGroup.css', 'components/timeline/TimelineBoard.css',
]

/** Properties whose change moves the content beside a panel on every frame of a transition. */
const LAYOUT = /^(width|min-width|max-width|height|flex|flex-basis|margin(-\w+)?|padding(-\w+)?|gap|inset|left|right)$/

/** The properties the element `selector` inside `markup` transitions. */
const transitioned = (markup: string, selector: string): string[] => {
  document.body.innerHTML = markup
  return getComputedStyle(document.querySelector(selector)).transition
    .split(/,(?![^(]*\))/).map((part) => part.trim().split(/\s+/)[0]!).filter(Boolean)
}

/** The text of the keyframes the element `selector` in the current body animates with, or undefined when it has none. */
const keyframesOf = (selector: string): string | undefined => {
  const name = /^\s*([\w-]+)/.exec(getComputedStyle(document.querySelector(selector)).animation)?.[1]
  return [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules])
    .find((rule) => rule.constructor.name === 'CSSKeyframesRule' && rule.name === name)?.cssText
}

describe('面板的动效', () => {
  beforeEach(() => {
    document.head.innerHTML = STYLES.map((path) => `<style>${stylesheet(path)}</style>`).join('')
  })

  it('侧栏和论文对话收起时立刻让出位置，只用位移和透明度滑走', () => {
    for (const [markup, pane] of [
      ['<div class="main sbhide"><div class="sidebar"></div></div>', '.sidebar'],
      ['<div class="main reading sbhide"><aside class="paper-chat stream"></aside></div>', '.paper-chat'],
    ] as const) {
      expect(transitioned(markup, pane), pane).toEqual(['transform', 'opacity'])
      const hidden = getComputedStyle(document.querySelector(pane))
      expect([hidden.position, hidden.transform], pane).toEqual(['absolute', 'translateX(-100%)'])
    }
  })

  it('详情面板、表格的详情和阅读器侧栏一下子定好宽度，不逐帧挤动旁边的内容', () => {
    for (const [markup, selector] of [
      ['<div class="detail-panel detail-panel--inline is-open"></div>', '.detail-panel'],
      ['<div class="detail-panel detail-panel--resize is-open"></div>', '.detail-panel'],
      ['<div class="wkpage project-detail-page"></div>', '.project-detail-page'],
      ['<div class="desk-body libview withdetail"></div>', '.desk-body'],
      ['<div class="desk-foot withdetail"></div>', '.desk-foot'],
      ['<div class="reader"><aside class="reader-side"></aside></div>', '.reader-side'],
    ] as const) {
      expect(transitioned(markup, selector).filter((property) => LAYOUT.test(property)), markup).toEqual([])
    }
  })

  it('收件分组展开时高度经网格行长出来，和 CardTray 一样', () => {
    document.body.innerHTML = '<section class="collapsible-group"><div class="collapsible-group-body is-opening"><div class="collapsible-group-content"></div></div></section>'
    expect(getComputedStyle(document.querySelector('.collapsible-group-body')).display).toBe('grid')
    expect(keyframesOf('.collapsible-group-body')).toMatch(/0% \{ grid-template-rows: 0fr; \}[\s\S]*100% \{ grid-template-rows: 1fr; \}/)
    expect(keyframesOf('.collapsible-group-content')).toMatch(/overflow: hidden/)
  })

  it('列表出现时开着的分组整组显示，不从 0fr 长出来，内容也不被裁切', () => {
    document.body.innerHTML = '<section class="collapsible-group"><div class="collapsible-group-body"><div class="collapsible-group-content"></div></div></section>'
    for (const selector of ['.collapsible-group-body', '.collapsible-group-content']) {
      expect(keyframesOf(selector), selector).toBeUndefined()
    }
  })

  it('表格里 +N 展开的标签一齐出现，不错开', () => {
    expect(stylesheet('components/paper-table/PaperTable.css')).not.toMatch(/animation-delay/)
  })

  it('科研图的当前路径和想法关联节点是静态的，没有循环的动画', () => {
    expect(stylesheet('components/project/ResearchGraph.css')).not.toMatch(/infinite/)
  })

  it('甘特图的任务条显示可抓取，拖动中的条和菱形抬起来', () => {
    document.body.innerHTML = '<div class="grow"><div class="gbar"></div></div>'
    expect(getComputedStyle(document.querySelector('.gbar')).cursor).toBe('grab')
    for (const markup of ['<div class="grow"><div class="gbar dragging"></div></div>', '<div class="grow msrow"><span class="gddl dragging"></span></div>']) {
      document.body.innerHTML = markup
      const lifted = getComputedStyle(document.querySelector('.dragging'))
      expect([lifted.cursor, lifted.boxShadow], markup).toEqual(['grabbing', 'var(--sh-2)'])
    }
  })
})
