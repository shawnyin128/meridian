// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = { dispatchEvent(event: object): boolean; querySelector(selector: string): Node }
type Style = { background: string; backgroundImage: string; boxShadow: string; color: string; transition: string }
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
  'shell/tokens.css', 'components/Tag.css', 'routes/shell.css', 'components/paper-table/PaperTable.css', 'components/PaperMetadata.css',
  'components/CollapsibleGroup.css', 'components/chat/Chat.css', 'components/ActionMenu.css', 'components/ShortTextEditor.css',
].map((path) => readFileSync(join(import.meta.dirname, '..', 'renderer', path), 'utf8'))

/**
 * The style of the element `shown` inside `markup`, at rest and once the pointer entered the element
 * `hovered`, as `read` reports it.
 */
const restAndHover = (markup: string, hovered: string, shown: string, read: (style: Style) => string) => {
  document.body.innerHTML = markup
  const rest = read(getComputedStyle(document.querySelector(shown)))
  // jsdom keeps a computed style until the DOM changes, so the hovered reading starts from fresh markup.
  document.body.innerHTML = markup
  document.querySelector(hovered).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  return [rest, read(getComputedStyle(document.querySelector(shown)))]
}

describe('没有悬停反馈的控件', () => {
  beforeEach(() => {
    document.head.innerHTML = STYLES.map((css) => `<style>${css}</style>`).join('')
  })

  it('阅读状态 chip 悬停时盖上和按钮一样的悬停色', () => {
    const chip = '<table class="ptable"><tbody><tr><td><button type="button" class="tag tag--chip tag--neutral stchip">在读</button></td></tr></tbody></table>'
    expect(restAndHover(chip, '.stchip', '.stchip', (style) => style.backgroundImage))
      .toEqual(['none', 'linear-gradient(var(--hover),var(--hover))'])
  })

  it('没评上的星悬停时变深，评上的保持原色', () => {
    const stars = '<span class="rating-stars"><button type="button" class="rated">★</button><button type="button">★</button></span>'
    expect(restAndHover(stars, 'button:not(.rated)', 'button:not(.rated)', (style) => style.color))
      .toEqual(['var(--sep-strong)', 'var(--ter)'])
    expect(restAndHover(stars, '.rated', '.rated', (style) => style.color)).toEqual(['var(--star)', 'var(--star)'])
  })

  it('分组标题悬停时它的折叠箭头变深', () => {
    const group = '<div class="collapsible-group"><div class="collapsible-group-head"><button type="button" class="collapsible-group-toggle"><span class="collapsible-group-caret"></span><span class="collapsible-group-title">主题</span></button></div></div>'
    expect(restAndHover(group, '.collapsible-group-title', '.collapsible-group-caret', (style) => style.color))
      .toEqual(['var(--ter)', 'var(--ink)'])
  })

  it('里程碑编辑框的删除行悬停时铺上菜单项的那层悬停底', () => {
    const editor = '<div class="short-text-editor"><div class="msep"></div><button type="button" class="short-text-delete mi danger">删除</button></div>'
    expect(restAndHover(editor, '.short-text-delete', '.short-text-delete', (style) => style.background))
      .toEqual(['rgba(0, 0, 0, 0)', 'var(--hover)'])
  })

  it('发送钮悬停时盖上实心按钮的深色悬停层', () => {
    const send = '<button type="button" class="send"></button>'
    expect(restAndHover(send, '.send', '.send', (style) => style.boxShadow))
      .toEqual(['', 'inset 0 0 0 100vmax var(--hover-solid)'])
  })
})
