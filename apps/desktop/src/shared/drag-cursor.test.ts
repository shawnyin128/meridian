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
  getComputedStyle(element: Node): { cursor: string }
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
  'components/paper-table/PaperTable.css', 'components/project/ProjectSections.css',
  'components/timeline/TimelineBoard.css', 'components/project/ResearchGraph.css',
].map(source)

/**
 * Every spot a drag starts from, as its component renders it: the markup, the element pressed, and
 * each way it shows it is held: `press`, the mouse button down on it, or a class its component adds.
 */
const SPOTS: Record<string, [markup: string, spot: string, held: string[]]> = {
  '列表的拖动把手': ['<span class="icbtn sm drag-handle" aria-hidden="true" draggable="true"></span>', '.drag-handle', ['press']],
  '论文表的列移动把手': ['<table class="ptable"><thead><tr><th><span class="thmove" draggable="true"></span></th></tr></thead></table>', '.thmove', ['press']],
  '关联 chip': ['<div class="wkrel"><span class="tag tag--chip tag--neutral tagchip" draggable="true"><button type="button" class="tagchip-open">链接</button></span></div>', '.tagchip', ['press']],
  '时间线的任务条': ['<div class="grow"><button type="button" class="gbar"></button></div>', '.gbar', ['press', 'dragging']],
  '时间线的里程碑菱形': ['<div class="grow msrow"><span class="gddl"></span></div>', '.gddl', ['press', 'dragging']],
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
    for (const [name, [markup, spot, held]] of Object.entries(SPOTS)) {
      expect(cursorOf(markup, spot), `${name} 悬停`).toBe('var(--cursor-draggable)')
      for (const state of held) expect(cursorOf(markup, spot, state), `${name} ${state}`).toBe('var(--cursor-dragging)')
    }
  })

  it('拖动中的光标只在按住或拖动中出现', () => {
    const atRest = RULES.filter((rule) => /var\(\s*--cursor-dragging\s*\)/.test(rule.body))
      .flatMap((rule) => rule.selector.split(/,(?![^(]*\))/).map((selector) => `${rule.path}: ${selector.trim()}`))
      .filter((selector) => !/:active|\.dragging\b|\.panning\b/.test(selector))
    expect(atRest).toEqual([])
  })
})
