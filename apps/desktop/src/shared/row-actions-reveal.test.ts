// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = { dispatchEvent(event: object): boolean; focus(): void }
type Window = {
  document: {
    head: { innerHTML: string }
    body: { innerHTML: string }
    querySelector(selector: string): Node
  }
  MouseEvent: new (type: string, init: { bubbles: boolean }) => object
  getComputedStyle(element: Node): { opacity: string; pointerEvents: string }
}
const { document, MouseEvent, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every stylesheet under the renderer, as paths relative to it. */
const STYLESHEETS = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.css'))

/** The slot's stylesheet, the "More" button's, then the stylesheets of the rows that hold a slot. */
const STYLES = [
  'components/StructuredList.css', 'components/FieldPickers.css', 'components/IconButton.css', 'shell/AppShell.css',
  'components/ResearchObjectCard.css', 'routes/Projects.css', 'routes/ProjectDetail.css', 'components/wiki/WikiClaims.css',
].map((path) => readFileSync(join(RENDERER, path), 'utf8'))

const SLOT = '<span class="row-actions"><button type="button" class="icbtn sm dots"></button></span>'

// The markup of a sidebar chat row, a project card, a shelved project row, the project detail's
// directory field and a Wiki claim, each with the "More" button in its row-actions slot. `point` is a
// part of the row away from the slot.
const ROWS = {
  chat: `<div class="srow chat-row" data-row-actions=""><span class="ct-t" data-point>对话</span>${SLOT}</div>`,
  card: `<article class="research-object-card projpanel" data-actionable="" data-row-actions=""><div class="pp-h"><button type="button" data-focus>MoE 路由分析</button><span class="dd" data-point>没有里程碑</span>${SLOT}</div></article>`,
  project: `<div class="structured-row prow" data-row-actions=""><span class="tp" data-point>投机解码</span>${SLOT}</div>`,
  workspace: `<div class="pv workspace-field" data-row-actions=""><button class="workspace-root" data-point data-focus>meridian</button>${SLOT}</div>`,
  claim: `<div class="structured-row wkclaim" data-row-actions=""><div class="wkclaim-head"><span class="wkclaim-text">拐点在宽度 6</span>${SLOT}</div><div class="wkclaim-meta" data-point>v2</div><button class="wkclaim-history" data-focus>版本史</button></div>`,
}

/** The slot's opacity and pointer-events in each row, after `act` ran on that row. */
const slotIn = (act: (row: string) => void) => Object.fromEntries(Object.entries(ROWS).map(([row, markup]) => {
  document.body.innerHTML = markup
  act(row)
  const style = getComputedStyle(document.querySelector('.row-actions'))
  return [row, `${style.opacity} ${style.pointerEvents}`]
}))

describe('行尾操作槽', () => {
  beforeEach(() => {
    document.head.innerHTML = STYLES.map((css) => `<style>${css}</style>`).join('')
  })

  it('平时藏起来，也点不到', () => {
    expect(slotIn(() => undefined)).toEqual({
      chat: '0 none', card: '0 none', project: '0 none', workspace: '0 none', claim: '0 none',
    })
  })

  it('悬停行里任何一处，槽都显出来，也点得到', () => {
    const hover = () => document.querySelector('[data-point]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(slotIn(hover)).toEqual({
      chat: '1 auto', card: '1 auto', project: '1 auto', workspace: '1 auto', claim: '1 auto',
    })
  })

  it('焦点落在行里别的控件上，槽也显出来，也点得到', () => {
    const focusable = Object.keys(ROWS).filter((row) => ROWS[row as keyof typeof ROWS].includes('data-focus'))
    const shown = slotIn((row) => { if (focusable.includes(row)) document.querySelector('[data-focus]').focus() })
    expect(Object.fromEntries(focusable.map((row) => [row, shown[row]]))).toEqual({
      card: '1 auto', workspace: '1 auto', claim: '1 auto',
    })
  })

  it('槽里的菜单开着时，指针离开行，槽也不收起', () => {
    const open = (markup: string) => markup.replace('class="icbtn sm dots"', 'class="icbtn sm dots" data-state="open"')
    const shown = Object.fromEntries(Object.entries(ROWS).map(([row, markup]) => {
      document.body.innerHTML = open(markup)
      const style = getComputedStyle(document.querySelector('.row-actions'))
      return [row, `${style.opacity} ${style.pointerEvents}`]
    }))
    expect(shown).toEqual({
      chat: '1 auto', card: '1 auto', project: '1 auto', workspace: '1 auto', claim: '1 auto',
    })
  })

  it('只有 StructuredList.css 决定槽和「更多」按钮显不显、点不点得到，各行不另写一份', () => {
    const offenders = STYLESHEETS
      .filter((path) => path !== join('components', 'StructuredList.css'))
      .flatMap((path) => [...readFileSync(join(RENDERER, path), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, selector, body]) => /\.(?:dots|row-actions)(?![\w-])/.test(selector!) && /(?:^|;)\s*(?:opacity|pointer-events)\s*:/.test(body!))
        .map(([, selector]) => `${path}  ${selector!.trim()}`))
    expect(offenders).toEqual([])
  })
})
