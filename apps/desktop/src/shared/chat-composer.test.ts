// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Element = { matches(selector: string): boolean; closest(selector: string): Element | null }
type Style = { opacity: string; cursor: string; flexWrap: string; maxWidth: string }
type Window = {
  document: {
    head: { innerHTML: string }
    body: { innerHTML: string }
    querySelector(selector: string): Element
    querySelectorAll(selector: string): Iterable<Element>
  }
  getComputedStyle(element: Element): Style
}
const { document, getComputedStyle } = globalThis as unknown as Window

/** The stylesheets of the message stream and both composers, in the order the App bundles them. */
const STYLES = [
  'shell/tokens.css', 'components/Tag.css', 'routes/shell.css', 'components/GenerationControl.css',
  'components/chat/Chat.css', 'routes/Reader.css',
].map((path) => readFileSync(join(import.meta.dirname, '..', 'renderer', path), 'utf8'))

/** Every rule as [selector, declarations], one entry per selector of a list; commas inside parentheses stay. */
const RULES = STYLES
  .flatMap((css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@]+)\{([^{}]*)\}/g)])
  .flatMap(([, selectors, body]) => selectors!.split(/,(?![^()]*\))/).map((selector) => [selector.trim(), body!] as const))

/** A declaration that draws a fill, a border or a shadow. */
const BOX = /^\s*(background(-color)?|border(-(top|right|bottom|left))?|box-shadow)\s*:\s*(?!(0|none|transparent)\s*$)/
/** A declaration that draws a border. */
const BORDER = /^\s*border(-(top|right|bottom|left))?\s*:\s*(?!(0|none)\s*$)/

/**
 * The selectors of the rules whose declarations match `drawn` on `element`, matched against the
 * markup: jsdom drops shorthands that hold var(), so computed styles cannot tell.
 */
const rulesDrawing = (drawn: RegExp) => (element: Element) => RULES
  .filter(([selector, body]) => element.matches(selector) && body.split(';').some((declaration) => drawn.test(declaration)))
  .map(([selector]) => selector)

/** An answer and a status line as ChatMessageView renders them, in the global chat and the paper chat. */
const STREAM = (text: string) => '<div class="mwrap"><div class="msg ai">'
  + '<span class="tag tag--label tag--neutral source-label msg-who"><span class="tag-text">agent</span></span>'
  + `<div class="answer">${text}</div></div></div>`
  + '<div class="mwrap"><div class="msg"><div class="event"><span class="event-icon" aria-hidden="true"><svg></svg></span>'
  + `<span>${text}</span></div></div></div>`

describe('对话流和输入区', () => {
  beforeEach(() => {
    document.head.innerHTML = STYLES.map((css) => `<style>${css}</style>`).join('')
  })

  it('回答和状态行都不套卡片，只有回答上方的身份标签有底色', () => {
    document.body.innerHTML = `<div class="stream"><div class="msgs">${STREAM('全局对话')}</div></div>`
      + `<aside class="paper-chat stream"><div class="msgs">${STREAM('论文对话')}</div></aside>`
    const unlabelled = [...document.querySelectorAll('.msgs *')].filter((element) => element.closest('.source-label') === null)
    expect(unlabelled.flatMap(rulesDrawing(BOX))).toEqual([])
  })

  it('两个输入区的发送钮不可点时都变淡，也不显示手形', () => {
    document.body.innerHTML = '<div class="composer"><button type="button" class="generation-control send" disabled></button></div>'
      + '<aside class="paper-chat"><div class="composer"><button type="button" class="generation-control send" disabled></button></div></aside>'
    expect([...document.querySelectorAll('.send')].map((send) => {
      const style = getComputedStyle(send)
      return `${style.opacity} ${style.cursor}`
    })).toEqual(['0.45 default', '0.45 default'])
  })

  it('输入框上方的工具栏只占一行，快捷引用有最大宽度', () => {
    document.body.innerHTML = '<div class="qacts"><span id="qmChips"><button type="button" class="btn ghost sm qm">@项目</button></span>'
      + '<button type="button" class="btn ghost sm save-idea">保存为想法</button></div>'
    expect(getComputedStyle(document.querySelector('.qacts')).flexWrap).toBe('nowrap')
    expect(getComputedStyle(document.querySelector('#qmChips')).flexWrap).toBe('nowrap')
    expect(getComputedStyle(document.querySelector('.qm')).maxWidth).toMatch(/^\d+px$/)
  })

  it('输入区顶上不画横贯页面的分隔线', () => {
    document.body.innerHTML = '<div class="desk-foot bare"><div class="composer"></div></div>'
      + '<aside class="paper-chat"><div class="composer paper-chat-composer"></div></aside>'
    expect([...document.querySelectorAll('.composer')].flatMap(rulesDrawing(BORDER))).toEqual([])
  })
})
