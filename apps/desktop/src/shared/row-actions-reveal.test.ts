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
  getComputedStyle(element: Node): { opacity: string; pointerEvents: string; position: string; right: string }
}
const { document, MouseEvent, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every stylesheet under the renderer, as paths relative to it. */
const STYLESHEETS = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.css'))

/** The slot's stylesheet, the "More" button's, then the stylesheets of the rows that hold a slot. */
const STYLES = [
  'components/Item.css', 'components/List.css', 'components/FieldPickers.css', 'components/IconButton.css', 'components/NavRow.css',
  'routes/Projects.css', 'routes/ProjectDetail.css', 'components/wiki/WikiClaims.css',
  'components/paper-table/PaperTable.css', 'components/project/ProjectPlan.css', 'routes/shell.css',
].map((path) => readFileSync(join(RENDERER, path), 'utf8'))

const SLOT = '<span class="row-actions"><button type="button" class="icbtn sm dots"></button></span>'

// The markup of a sidebar chat row, a project card, a shelved project row, the project detail's
// directory field, a Wiki claim, a plan task row with its rename slot, the paper table's header row and
// a column-menu row, each with the "More" button in its row-actions slot. `point` is a part of the row
// away from the slot.
const ROWS = {
  chat: `<div class="nav-row nav-row--actions chat-row" data-row-actions=""><span class="fade-text" data-point>对话</span>${SLOT}</div>`,
  card: `<article class="item item--card item--slotted item--actionable projpanel" data-row-actions=""><div class="item-head"><span class="item-main"><span class="item-title"><button type="button" class="item-open" data-focus>MoE 路由分析</button></span></span><span class="item-trailing" data-point>没有里程碑</span>${SLOT}</div></article>`,
  project: `<div class="item item--row item--slotted item--actionable prow" data-row-actions=""><span class="item-main"><span class="item-meta" data-point>投机解码</span></span>${SLOT}</div>`,
  workspace: `<div class="pv workspace-field" data-row-actions=""><button class="workspace-root" data-point data-focus>meridian</button>${SLOT}</div>`,
  claim: `<div class="item item--row wkclaim" data-row-actions=""><div class="wkclaim-head"><span class="wkclaim-text">拐点在宽度 6</span>${SLOT}</div><div class="wkclaim-meta" data-point>v2</div><button class="wkclaim-history" data-focus>版本史</button></div>`,
  plan: `<section class="project-plan"><div class="item item--row item--actionable ddlrow task-row" data-row-actions=""><span class="plan-name-cell"><button class="plan-cell plan-name plan-open" data-focus>校准批次</button>${SLOT}</span><span class="dleft" data-point>进行中</span></div></section>`,
  header: `<table class="ptable"><thead><tr data-row-actions=""><th data-point>标题</th><th class="th-add">${SLOT}</th></tr></thead></table>`,
  column: `<div class="mi colrow" data-row-actions=""><span class="ck"></span><span class="cl" data-point>读法</span><button type="button" class="icbtn xs fold-toggle" data-focus></button>${SLOT}</div>`,
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
      plan: '0 none', header: '0 none', column: '0 none',
    })
  })

  it('悬停行里任何一处，槽都显出来，也点得到', () => {
    const hover = () => document.querySelector('[data-point]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(slotIn(hover)).toEqual({
      chat: '1 auto', card: '1 auto', project: '1 auto', workspace: '1 auto', claim: '1 auto',
      plan: '1 auto', header: '1 auto', column: '1 auto',
    })
  })

  it('焦点落在行里别的控件上，槽也显出来，也点得到', () => {
    const focusable = Object.keys(ROWS).filter((row) => ROWS[row as keyof typeof ROWS].includes('data-focus'))
    const shown = slotIn((row) => { if (focusable.includes(row)) document.querySelector('[data-focus]').focus() })
    expect(Object.fromEntries(focusable.map((row) => [row, shown[row]]))).toEqual({
      card: '1 auto', workspace: '1 auto', claim: '1 auto', plan: '1 auto', column: '1 auto',
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
      plan: '1 auto', header: '1 auto', column: '1 auto',
    })
  })

  it('槽里的按钮展开着它管的那一块时（列菜单的改类型），指针离开行，槽也不收起', () => {
    const shown = (expanded: string) => {
      document.body.innerHTML = ROWS.column.replace('class="icbtn sm dots"', `class="icbtn sm dots" aria-expanded="${expanded}"`)
      const style = getComputedStyle(document.querySelector('.row-actions'))
      return `${style.opacity} ${style.pointerEvents}`
    }
    expect([shown('true'), shown('false')]).toEqual(['1 auto', '0 none'])
  })

  it('槽里有正在下载或已按下的按钮时，槽一直显示：它显示的是状态', () => {
    const shown = (button: string) => {
      document.body.innerHTML = `<article class="paper-card" data-row-actions=""><span class="row-actions">${button}<button type="button" class="icbtn"></button></span></article>`
      const style = getComputedStyle(document.querySelector('.row-actions'))
      return `${style.opacity} ${style.pointerEvents}`
    }
    expect(shown('<button type="button" class="icbtn busy" disabled></button>')).toBe('1 auto')
    expect(shown('<button type="button" class="icbtn" aria-pressed="true"></button>')).toBe('1 auto')
    expect(shown('<button type="button" class="icbtn" aria-pressed="false"></button>')).toBe('0 none')
  })

  it('论文行尾放操作槽的那一格贴在表格右边，表格横向滚动时也看得见', () => {
    document.body.innerHTML = '<div class="tblwrap"><table class="ptable"><thead><tr><th>标题</th><th class="th-add"></th></tr></thead><tbody><tr data-row-actions=""><td class="pt-title">EAGLE</td><td class="row-actions-cell"><span class="row-actions"></span></td></tr></tbody></table></div>'
    for (const cell of ['td.row-actions-cell', 'th.th-add']) {
      const style = getComputedStyle(document.querySelector(cell))
      expect([style.position, style.right], cell).toEqual(['sticky', '0px'])
    }
  })

  it('只有 Item.css 写悬停才显出来的按钮：别处不用 opacity:0 加 pointer-events:none 藏起、再在悬停或聚焦时放出来', () => {
    const rules = STYLESHEETS
      .filter((path) => path !== join('components', 'Item.css'))
      .flatMap((path) => [...readFileSync(join(RENDERER, path), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .map(([, selector, body]) => ({ path, selector: selector!.trim(), body: body! })))
    const sets = (body: string, property: string, value: string) =>
      new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*${value}\\s*(?:;|$)`).test(body)
    // The class each selector of a rule finally names, the element the rule styles.
    const subjects = (selector: string) => selector.split(',')
      .map((part) => /\.([\w-]+)[^\s.>+~]*$/.exec(part.trim().replace(/:not\([^)]*\)/g, ''))?.[1])
      .filter((name): name is string => name !== undefined)
    const hidden = new Set(rules
      .filter(({ body }) => sets(body, 'opacity', '0') && sets(body, 'pointer-events', 'none'))
      .flatMap(({ selector }) => subjects(selector)))
    const reveals = rules
      .filter(({ selector, body }) => /:(?:hover|focus-visible|focus-within)\b/.test(selector)
        && sets(body, 'pointer-events', 'auto') && subjects(selector).some((name) => hidden.has(name)))
      .map(({ path, selector }) => `${path}  ${selector.replace(/\s+/g, ' ')}`)
    // The paper table's chip + and chip ×, which the shared chip list of #474 takes over.
    expect(reveals).toEqual([
      'components/paper-table/PaperTable.css  .ptable tr:hover .tagadd,.tagchip.tagadd:focus-visible',
      'components/paper-table/PaperTable.css  .ptable tr:hover .tagchip .rx,.ptable .tagchip .rx:focus-visible',
    ])
  })

  it('只有 Item.css 决定槽和「更多」按钮显不显、点不点得到，各行不另写一份', () => {
    const offenders = STYLESHEETS
      .filter((path) => path !== join('components', 'Item.css'))
      .flatMap((path) => [...readFileSync(join(RENDERER, path), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, selector, body]) => /\.(?:dots|row-actions)(?![\w-])/.test(selector!.replace(/:not\([^)]*\)/g, ''))
          && /(?:^|;)\s*(?:opacity|pointer-events)\s*:/.test(body!))
        .map(([, selector]) => `${path}  ${selector!.trim()}`))
    expect(offenders).toEqual([])
  })
})
