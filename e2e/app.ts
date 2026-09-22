import { _electron as electron, test as base } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { resolve } from 'node:path'

const APP_DIR = resolve(import.meta.dirname, '../apps/desktop')

/**
 * Which vault the use case runs on. Only the original text of the paper was actually read from the disk, so I pointed to the one in the fixture and put it
 * An original article's vault; `MERIDIAN_LIBRARY_ROOT` has been specified, so that the same batch of use cases can be run
 * On the real library.
 */
const VAULT = process.env['MERIDIAN_LIBRARY_ROOT']
  ?? resolve(APP_DIR, 'src/core/fixtures/vault')

const ENV = Object.fromEntries(
  Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined))

/**
 * Each use case has an exclusive Electron instance: `app` is the main process handle (change the window size and use it),
 * `win` is its first window. The entire application is automatically shut down after the use case is run.
 * `showWindow` tells whether this item requires a real window on the screen. The default is not - it has been used more than a hundred times in one round of regression.
 * Windows grabbing focus again and again can make it difficult to use the computer. The price is that the window that is not on the screen does not have the frame given by the compositor: rAF falls to
 * Once per second, so Playwright waits for two seconds for each operability and one second for each element screenshot;
 * The menu accelerator is only accessible from the window on the upper screen. The use case itself that is blocked by these two things
 * `test.use({ showWindow: true })`, and leave the rest open.
 */
export const test = base.extend<{
  app: ElectronApplication; win: Page; showWindow: boolean
}>({
  showWindow: [false, { option: true }],
  app: async ({ showWindow }, use) => {
    const app = await electron.launch({
      // The specs assert Chinese copy, so the app must not follow the host's language.
      args: [APP_DIR, '--lang=zh-CN'],
      env: {
        ...ENV,
        MERIDIAN_LIBRARY_ROOT: VAULT,
        // Explicitly write '0': When this variable is set in the external shell, the unnamed use case still does not appear on the screen.
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

/** preload is exposed to the page's access interface. In `page.evaluate`, the interface is bypassed and the core is directly called according to the contract method name. */
export type MeridianWindow = Window & {
  meridian: { call(method: string, params: unknown): Promise<unknown>; platform: NodeJS.Platform }
}

/**
 * Click the brand mark in the title bar to open the application menu, and then click "Settings...". When you return, the settings modal is already on the screen.
 */
export async function openSettings(_app: ElectronApplication, win: Page): Promise<void> {
  // Settings are entered from the brand mark in the upper left corner of the title bar: that layer is the entrance to application-level configuration, and the menu bar is no longer drawn.
  await win.locator('.titlebar .appbtn').click()
  await win.locator('[data-appmenu] .mi', { hasText: '设置…' }).click()
  await win.locator('.setdlg').waitFor()
}

/**
 * Click "My Library › Papers" on the sidebar to enter the paper screen. The application falls on the dynamic screen. All use cases done on the paper table must take this step first.
 */
export async function gotoPapers(win: Page): Promise<void> {
  await win.locator('[data-desk="papers"]').click()
}

/** A deduplicated ascending collection of elements `offsetHeight`. A single-value collection indicates that this group of rows is of equal height. */
export function uniqueHeights(rows: Locator): Promise<number[]> {
  return rows.evaluateAll((els) => [
    ...new Set(els.map((el) => (el as HTMLElement).offsetHeight)),
  ].sort((a, b) => a - b))
}

/**
 * Move the pointer out of the content area. When the pointer presses on the truncated grid, the `.ci` of that grid will expand in place and cross the table width.
 * The measured width and the captured image will change accordingly; the hover of the first synthesized mouse event is still calculated according to the real cursor.
 * Therefore, you need to enter the content area and then come out, so that the hover state can be settled.
 */
export async function parkPointer(win: Page): Promise<void> {
  await win.mouse.move(600, 400)
  await win.mouse.move(0, 0)
}

/** End all running transitions and animations on the element, so that the subsequent calculated value reading will immediately get the final value. */
export function settle(locator: Locator): Promise<void> {
  return locator.evaluate((el) => { el.getAnimations().forEach((a) => { a.finish() }) })
}

/**
 * Click "Research › Projects" on the sidebar to enter the project list, then click on the draft project from the list, and then return after Gantt has finished drawing.
 * What we are waiting for is the frame, not a certain element: when Gantt is mounted, the viewport width is directly measured by the layout side effect, and the stub and row are the same.
 * Submit the drawing, so any element is already correct as soon as it appears; what has not yet been implemented is the first time of ResizeObserver
 * callback. If we don't wait for that frame, when the window size is changed later, the recalculation will be delayed by one frame, and the stumps will not be filled.
 * The entered screen is always hanging, and there is also a Gantt on the research overview, so the waiting line must be included in the currently displayed screen.
 */
export async function gotoProject(win: Page): Promise<void> {
  await win.locator('[data-desk="resproj"]').click()
  await win.locator('[data-proj="draft"]').click()
  await win.locator('.screenslot:not([hidden]) .gantt .grow').first().waitFor()
  await win.evaluate(() => new Promise<null>((drawn) => requestAnimationFrame(() => drawn(null))))
}

/** Bypass the interface and call `vault.today` directly, get today in Curry; every relative date on the screen is counted according to it. */
export const vaultToday = (win: Page): Promise<string> => win.evaluate(() =>
  (window as unknown as MeridianWindow).meridian.call('vault.today', {}) as Promise<string>)

/**
 * The date of the fixture is generated according to today in the library, which is the day days after today, ISO; if days is negative, it is today
 * before. The use case is written to determine how far the date is from today, not which day it falls on - which day is different every day.
 */
export const fixtureDay = (today: string, days: number): string =>
  new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/** The date is uniformly written as M month and D day on the interface, which is the same as dshort of routes/dates.ts. */
export const dshort = (iso: string): string => {
  const [, month, day] = iso.match(/^(?:\d{4}-)?(\d{1,2})[-/](\d{1,2})$/) ?? []
  return month && day ? `${Number(month)}月${Number(day)}日` : iso
}

/**
 * Bypass the interface and call `project.get('draft')` directly, and only get the two arrays to be checked by the write path use case.
 * It is used to confirm the actual value stored in the core after dragging, creating, deleting and other operations, rather than the optimistically rendered state of the interface itself.
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
