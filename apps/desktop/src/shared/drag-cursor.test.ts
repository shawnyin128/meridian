// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = { dispatchEvent(event: object): boolean; classList: { add(name: string): void } }
type Window = {
  document: {
    head: { innerHTML: string }
    body: { innerHTML: string }
    querySelector(selector: string): Node
  }
  MouseEvent: new (type: string, init: { bubbles: boolean; buttons: number }) => object
  getComputedStyle(element: Node): { cursor: string; opacity: string; boxShadow: string }
}
const { document, MouseEvent, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')
const source = (path: string) => readFileSync(join(RENDERER, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Every stylesheet under the renderer, as paths relative to it. */
const STYLESHEETS = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.css'))

/** Each rule of every stylesheet as its file, its selector list and its body. */
const RULES = STYLESHEETS.flatMap((path) => [...source(path).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({ path, selector: selector!.trim().replace(/\s+/g, ' '), body: body! })))

const STYLES = [
  'shell/tokens.css', 'routes/shell.css', 'components/IconButton.css', 'components/Tag.css', 'components/DragHandle.css',
  'components/StructuredList.css', 'components/ChipList.css', 'components/paper-table/PaperTable.css', 'components/project/ProjectSections.css',
  'components/project/ProjectPlan.css', 'components/timeline/TimelineBoard.css', 'components/project/ResearchGraph.css',
].map(source)

/**
 * Every spot a drag starts from, as its component renders it: the markup, the element pressed, and
 * each way it shows it is held: `press`, the mouse button down on it, or a class its component adds.
 */
const SPOTS: Record<string, [markup: string, spot: string, held: string[]]> = {
  '列表的拖动把手': ['<span class="icbtn sm drag-handle" aria-hidden="true" draggable="true"></span>', '.drag-handle', ['press']],
  '论文表的列移动把手': ['<table class="ptable"><thead><tr><th data-reorder-item="short" data-reorder-axis="x"><span class="icbtn xs drag-handle" aria-hidden="true" draggable="true"></span></th></tr></thead></table>', '.drag-handle', ['press']],
  '关联 chip': ['<div class="wkrel"><span class="tag tag--chip tag--neutral tagchip" data-row-actions="" data-actionable="" data-reorder-item="r1" data-reorder-axis="x" draggable="true"><button type="button" class="tagchip-open">链接</button></span></div>', '.tagchip', ['press', 'dragging']],
  '时间线的任务条': ['<div class="grow"><button type="button" class="gbar"></button></div>', '.gbar', ['press', 'dragging']],
  '时间线的里程碑菱形': ['<div class="grow msrow"><span class="gddl"></span></div>', '.gddl', ['press', 'dragging']],
  '计划的任务行': ['<div class="project-plan"><div id="taskList"><div class="structured-row structured-row--composite ddlrow task-row" data-row-actions="" draggable="true" data-reorder-item="t1" data-reorder-axis="y"></div></div></div>', '.task-row', ['press', 'dragging']],
  '时间线的任务标签行': ['<div class="glabels"><div class="glrow timeline-label-row" draggable="true" data-reorder-item="t1" data-reorder-axis="y"><button type="button" class="timeline-label-open">任务</button></div></div>', '.glrow', ['press', 'dragging']],
  // ResearchGraph adds `panning` as the pointer goes down on the background.
  '科研图的背景': ['<div class="rgraph"><div class="rgraph-viewport"><svg></svg></div></div>', '.rgraph-viewport', ['panning']],
}

/** The cursor of `spot` in fresh `markup` under the pointer, held as `held` says when given. */
const cursorOf = (markup: string, spot: string, held?: string) => {
  document.body.innerHTML = markup
  const element = document.querySelector(spot)
  if (held !== undefined && held !== 'press') element.classList.add(held)
  const type = held === 'press' ? 'mousedown' : 'mouseover'
  element.dispatchEvent(new MouseEvent(type, { bubbles: true, buttons: held === 'press' ? 1 : 0 }))
  return getComputedStyle(element).cursor
}

/** The value shell/tokens.css gives `name` in its `:root` block, the only one that sets it. */
const token = (name: string) => new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;}]+)`).exec(source('shell/tokens.css'))?.[1]!.trim()

describe('拖动处的光标', () => {
  beforeEach(() => {
    document.head.innerHTML = STYLES.map((css) => `<style>${css}</style>`).join('')
  })

  it('没有样式表自己写张开的手或握拳，拖动的光标只来自共用的令牌', () => {
    const literal = RULES.filter((rule) => /(?:^|;)\s*cursor\s*:\s*grab(?:bing)?\b/.test(rule.body))
      .map((rule) => `${rule.path}: ${rule.selector}`)
    expect(literal).toEqual([])
  })

  it('可拖的令牌是和按钮一样的手指，拖动中的令牌是握拳', () => {
    expect([token('--cursor-draggable'), token('--cursor-dragging')]).toEqual(['pointer', 'grabbing'])
  })

  it('每个拖动处悬停时显示可拖的光标，按住时显示拖动中的光标', () => {
    const spots = Object.entries(SPOTS)
    expect(Object.fromEntries(spots.map(([name, [markup, spot, held]]) =>
      [name, [cursorOf(markup, spot), ...held.map((state) => cursorOf(markup, spot, state))]])))
      .toEqual(Object.fromEntries(spots.map(([name, [, , held]]) =>
        [name, ['var(--cursor-draggable)', ...held.map(() => 'var(--cursor-dragging)')]])))
  })

  it('拖动中的光标只在按住或拖动中出现', () => {
    const atRest = RULES.filter((rule) => /var\(\s*--cursor-dragging\s*\)/.test(rule.body))
      .flatMap((rule) => rule.selector.split(/,(?![^(]*\))/).map((selector) => `${rule.path}: ${selector.trim()}`))
      .filter((selector) => !/:active|\.dragging\b|\.panning\b/.test(selector))
    expect(atRest).toEqual([])
  })
})

describe('拖动中的条目和落点', () => {
  /** Each reorderable item: the stylesheets that draw it and its markup as its component renders it with useDragReorder's attributes. */
  const ITEMS: Record<string, [sheets: string[], markup: string]> = {
    '项目行': [['components/StructuredList.css', 'routes/Projects.css'], '<div class="structured-row structured-row--composite prow" data-reorder-item="p1" data-reorder-axis="y"></div>'],
    '项目卡片': [['components/ResearchObjectCard.css', 'routes/Projects.css'], '<article class="research-object-card projpanel" data-row-actions="" data-reorder-item="p1" data-reorder-axis="y"></article>'],
    '想法行': [['components/StructuredList.css', 'routes/Ideas.css'], '<div class="structured-row structured-row--composite idea-row" data-reorder-item="i1" data-reorder-axis="y"></div>'],
    '想法卡片': [['components/ResearchObjectCard.css', 'routes/Ideas.css'], '<article class="research-object-card idea-card" data-row-actions="" data-reorder-item="i1" data-reorder-axis="y"></article>'],
    '计划的任务行': [['components/StructuredList.css', 'components/project/ProjectPlan.css'], '<div class="project-plan"><div class="structured-row structured-row--composite ddlrow task-row" draggable="true" data-reorder-item="t1" data-reorder-axis="y"></div></div>'],
    '时间线的任务标签行': [['components/timeline/TimelineBoard.css'], '<div class="glabels"><div class="glrow timeline-label-row" draggable="true" data-reorder-item="t1" data-reorder-axis="y"></div></div>'],
    '关联 chip': [['components/Tag.css', 'components/ChipList.css', 'components/project/ProjectSections.css'], '<div class="wkrel"><span class="tag tag--chip tag--neutral tagchip" draggable="true" data-reorder-item="r1" data-reorder-axis="x"></span></div>'],
    '论文表的列': [['routes/shell.css', 'components/paper-table/PaperTable.css'], '<div class="tblwrap"><table class="ptable"><thead><tr><th data-reorder-item="short" data-reorder-axis="x"></th></tr></thead></table></div>'],
  }
  /** The opacity and box shadow of the item in `markup` under `sheets`, held, then with the drop line before and after it. */
  const feedback = (sheets: string[], markup: string) => ['dragging', 'drag-over-before', 'drag-over-after'].map((state) => {
    document.head.innerHTML = sheets.map(source).map((css) => `<style>${css}</style>`).join('')
    document.body.innerHTML = markup
    const item = document.querySelector('[data-reorder-item]')
    item.classList.add(state)
    const style = getComputedStyle(item)
    return [style.opacity, style.boxShadow]
  })
  /** The one drop look: the held item dims and a 2px ink line marks the side it lands on. */
  const LOOK = {
    y: [['0.4', ''], ['1', '0 -2px 0 0 var(--ink)'], ['1', '0 2px 0 0 var(--ink)']],
    x: [['0.4', ''], ['1', '-2px 0 0 0 var(--ink)'], ['1', '2px 0 0 0 var(--ink)']],
    // A header cell's neighbours paint over its edges, so its line lies just inside them.
    header: [['0.4', ''], ['1', 'inset 2px 0 0 0 var(--ink)'], ['1', 'inset -2px 0 0 0 var(--ink)']],
  }

  it('每个可拖动排序的条目拖动时变淡、落点画一条 2px 的线,都只来自共享的拖动样式,竖排画在上下,横排画在左右', () => {
    const items = Object.entries(ITEMS)
    expect(Object.fromEntries(items.map(([name, [sheets, markup]]) => [name, [
      feedback(sheets, markup),
      feedback([...sheets, 'components/DragHandle.css'], markup),
    ]]))).toEqual(Object.fromEntries(items.map(([name, [, markup]]) => [name, [
      [['1', ''], ['1', ''], ['1', '']],
      markup.includes('<th ') ? LOOK.header : markup.includes('data-reorder-axis="x"') ? LOOK.x : LOOK.y,
    ]])))
  })

  it('落点只有共享的一套标记:别的样式表不写 drag-over-*,也不另起 drop-before、column-drop、column-moving 之类的落点类', () => {
    const own = RULES.filter((rule) => rule.path !== 'components/DragHandle.css'
      && /\.(drag-over-(before|after)|drop-(before|after)|column-drop-(before|after)|column-moving)\b/.test(rule.selector))
      .map((rule) => `${rule.path}: ${rule.selector}`)
    expect(own).toEqual([])
  })
})
