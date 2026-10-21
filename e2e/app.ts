import { _electron as electron, expect, test as base } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const APP_DIR = resolve(import.meta.dirname, '../apps/desktop')

/**
 * The vault every case runs on: the fixture vault in this repository. In fixture mode Core serves
 * everything from the JSON fixtures and reads only the papers' source PDFs from this directory.
 * No environment variable can replace it, so a run never reaches a real vault.
 */
const VAULT = resolve(APP_DIR, 'src/core/fixtures/vault')

/** The parent environment without `MERIDIAN_VAULT_ROOT`, which would make Core open that vault instead of the fixture. */
const ENV = Object.fromEntries(Object.entries(process.env).filter(
  (e): e is [string, string] => e[1] !== undefined && e[0] !== 'MERIDIAN_VAULT_ROOT'))

/**
 * Each test case gets its own Electron instance: `app` is the main-process handle (used to resize the
 * window), `win` is its first window. The whole app is closed after the case finishes.
 * `showWindow` says whether the case needs a real window on screen. It defaults to false: one
 * regression round launches the app more than a hundred times, and windows grabbing focus again and
 * again make the computer hard to use. The cost is that an offscreen window gets no frames from the
 * compositor: rAF drops to once per second, so Playwright waits two seconds per actionability check
 * and one second per element screenshot, and menu accelerators reach only a window on screen. Cases
 * that hit either limit set `test.use({ showWindow: true })`; the rest leave it off.
 */
export const test = base.extend<{
  app: ElectronApplication; win: Page; showWindow: boolean; configHome: string
}>({
  showWindow: [false, { option: true }],
  // A fresh config home per case keeps the user's own ~/.meridian (keys, model settings) out of reach.
  configHome: async ({}, use) => {
    const configHome = mkdtempSync(join(tmpdir(), 'meridian-e2e-config-'))
    await use(configHome)
    rmSync(configHome, { recursive: true, force: true })
  },
  app: async ({ showWindow, configHome }, use) => {
    const app = await electron.launch({
      // The specs assert Chinese copy, so the app must not follow the host's language.
      args: [APP_DIR, '--lang=zh-CN'],
      env: {
        ...ENV,
        MERIDIAN_LIBRARY_ROOT: VAULT,
        MERIDIAN_CONFIG_HOME: configHome,
        // Write '0' explicitly: a case that did not ask for a window stays off screen even when the
        // outer shell sets this variable.
        MERIDIAN_SHOW_WINDOW: showWindow ? '1' : '0',
      },
    })
    await use(app)
    await app.close()
  },
  win: async ({ app }, use) => {
    const win = await app.firstWindow()
    // The profile outlives a run, so a language picked by an earlier spec is cleared before this one.
    const stale = await win.evaluate(() => {
      const had = window.localStorage.getItem('meridian.language') !== null
      window.localStorage.removeItem('meridian.language')
      return had
    })
    if (stale) await win.reload()
    await use(win)
  },
})

export { expect } from '@playwright/test'

/** The API preload exposes to the page; inside `page.evaluate` it calls Core by contract method, bypassing the UI. */
export type MeridianWindow = Window & {
  meridian: { call(method: string, params: unknown): Promise<unknown>; platform: NodeJS.Platform }
}

/**
 * Clicks the brand mark in the title bar to open the app menu, then "Settings…". Returns once the
 * Settings modal is on screen.
 */
export async function openSettings(_app: ElectronApplication, win: Page): Promise<void> {
  // Settings opens from the brand mark at the top left of the title bar, the entry point for
  // app-level configuration; the app draws no menu bar.
  await win.locator('.titlebar .appbtn').click()
  await win.locator('[data-appmenu] .mi', { hasText: '设置…' }).click()
  await win.locator('.setdlg').waitFor()
}

/**
 * Clicks "My library › Papers" in the sidebar to open the Papers screen. The app starts on the Feed
 * screen, so every test case on the paper table takes this step first.
 */
export async function gotoPapers(win: Page): Promise<void> {
  await win.locator('[data-desk="papers"]').click()
}

/** The distinct `offsetHeight` values of the elements, ascending; a single value means equal heights. */
export function uniqueHeights(rows: Locator): Promise<number[]> {
  return rows.evaluateAll((els) => [
    ...new Set(els.map((el) => (el as HTMLElement).offsetHeight)),
  ].sort((a, b) => a - b))
}

/**
 * Moves the pointer out of the content area. A pointer resting on a truncated cell makes that
 * cell's `.ci` expand in place across the table width, which changes measured widths and
 * screenshots. The first synthesized mouse event still computes hover from the real cursor, so the
 * pointer moves into the content area and then out for the hover state to settle.
 */
export async function parkPointer(win: Page): Promise<void> {
  await win.mouse.move(600, 400)
  await win.mouse.move(0, 0)
}

/**
 * Where the text inside `box` lies: the left and top of its content box, inside border and padding,
 * its width and its line height. A text that keeps all four keeps every line break.
 */
export function textBox(box: Locator): Promise<{ left: number; top: number; width: number; lineHeight: string }> {
  return box.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    const left = rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
    const right = rect.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
    const top = rect.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)
    return { left, top, width: right - left, lineHeight: style.lineHeight }
  })
}

/**
 * The property rail `rail`: where its content starts, the edge inside its border past which it clips,
 * and how far it is scrolled sideways.
 */
export function railEdges(rail: Locator): Promise<{ left: number; clip: number; scrollLeft: number }> {
  return rail.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    return {
      left: rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
      clip: rect.right - parseFloat(style.borderRightWidth),
      scrollLeft: el.scrollLeft,
    }
  })
}

/** Expects `editor` to hold focus and show whole inside the property rail `rail`, which has not scrolled sideways. */
export async function expectWholeInRail(rail: Locator, editor: Locator): Promise<void> {
  await expect(editor).toBeFocused()
  const [box, edges] = await Promise.all([editor.boundingBox(), railEdges(rail)])
  expect(box!.x + box!.width).toBeLessThanOrEqual(edges.clip)
  expect(edges.scrollLeft).toBe(0)
}

/** Finishes every running transition and animation on the element, so computed styles read next are final. */
export function settle(locator: Locator): Promise<void> {
  return locator.evaluate((el) => { el.getAnimations().forEach((a) => { a.finish() }) })
}

/**
 * Clicks "Research › Projects" in the sidebar, opens the draft project from the list, and returns
 * once its Gantt has drawn. The wait is for a frame, not an element: when the Gantt mounts, a layout
 * effect measures the viewport width directly and stubs and rows are drawn in the same commit, so
 * every element is correct as soon as it appears; what is still pending is the first ResizeObserver
 * callback. Without that frame, the recalculation after a later window resize lands one frame late
 * and stubs can be missing. Screens stay mounted once visited and Overview has a Gantt too, so the
 * awaited row is scoped to the visible screen.
 */
export async function gotoProject(win: Page): Promise<void> {
  await win.locator('[data-desk="resproj"]').click()
  await win.locator('[data-proj="draft"]').click()
  await win.locator('.screenslot:not([hidden]) .gantt .grow').first().waitFor()
  await win.evaluate(() => new Promise<null>((drawn) => requestAnimationFrame(() => drawn(null))))
}

/** Calls `vault.today` directly, bypassing the UI: the vault's today, base of every relative date on screen. */
export const vaultToday = (win: Page): Promise<string> => win.evaluate(() =>
  (window as unknown as MeridianWindow).meridian.call('vault.today', {}) as Promise<string>)

/**
 * Fixture dates are generated relative to the vault's today: returns the ISO date `days` after
 * `today`, or before it when `days` is negative. Test cases assert how far a date is from today, not
 * which calendar day it is, because that changes every day.
 */
export const fixtureDay = (today: string, days: number): string =>
  new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/**
 * The first and last ISO day of the timeline period around `today`: the day itself, its Monday to
 * Sunday week, or its calendar month. The timeline lists only the tasks that overlap this period.
 */
export function timelinePeriod(today: string, scale: 'day' | 'week' | 'month'): { first: string; last: string } {
  if (scale === 'day') return { first: today, last: today }
  const date = new Date(`${today}T00:00:00Z`)
  if (scale === 'week') {
    const monday = (date.getUTCDay() + 6) % 7
    return { first: fixtureDay(today, -monday), last: fixtureDay(today, 6 - monday) }
  }
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  return {
    first: iso(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
    last: iso(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)),
  }
}

/** Whether a task overlaps `period`, so the timeline lists it. */
export const overlaps = (task: { start: string; end: string }, period: { first: string; last: string }): boolean =>
  task.end >= period.first && task.start <= period.last

/** A date as the Chinese UI writes it (month and day), like `createFormat('zh').date` in renderer/lib/format.ts. */
export const dshort = (iso: string): string => {
  const [, month, day] = iso.match(/^(?:\d{4}-)?(\d{1,2})[-/](\d{1,2})$/) ?? []
  return month && day ? `${Number(month)}月${Number(day)}日` : iso
}

/**
 * Calls `project.get('draft')` directly, bypassing the UI, and keeps only the two arrays the
 * write-path test cases check: what Core actually stored after a drag, create, delete or similar
 * action, rather than what the UI rendered optimistically.
 */
export async function readDraft(win: Page): Promise<{
  milestones: { id: string; date: string }[]
  tasks: { id: string; title: string; start: string; end: string }[]
}> {
  return win.evaluate(async () => {
    const project = await (window as unknown as MeridianWindow).meridian
      .call('project.get', { id: 'draft' }) as {
        milestones: { id: string; date: string }[]
        tasks: { id: string; title: string; start: string; end: string }[]
      }
    return {
      milestones: project.milestones.map(({ id, date }) => ({ id, date })),
      tasks: project.tasks.map(({ id, title, start, end }) => ({ id, title, start, end })),
    }
  })
}
