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
 * Chromium switches every automated launch passes. A window off every display or hidden paints in the
 * primary display's colour profile and tags its screenshots with it; forced sRGB keeps the stored
 * values equal to the page's own colours, as a window on a display returns them. The main process
 * cannot set this switch: Chromium reads it before the main script runs.
 */
export const LAUNCH_SWITCHES = ['--force-color-profile=srgb']

/**
 * Each test case gets its own Electron instance: `app` is the main-process handle (used to resize the
 * window), `win` is its first window. The whole app is closed after the case finishes.
 * `showWindow` says whether the case needs a shown window. It defaults to false, a hidden window.
 * Measured on macOS, a hidden window gets frames at the display's rate: a click or an element screenshot
 * takes under 0.1 s, a transition ends on time, and menu accelerators reach it. Windows has not been
 * measured, so cases that wait for many frames, take element screenshots or press menu accelerators
 * still set `test.use({ showWindow: true })`, and long ones `test.slow()`.
 * Neither window gets in the way of someone using the machine: on macOS the App has no Dock icon and
 * never becomes the active app. A shown window opens isolated, unfocusable and right of every display,
 * so it never covers another window, takes system focus or sees the machine's real keyboard and pointer.
 * Playwright's input goes through the DevTools protocol and still reaches the page, and `appSwitcher`
 * moves the page's focus the way switching to another app and back does.
 */
export const test = base.extend<{
  app: ElectronApplication; win: Page; showWindow: boolean; configHome: string; profile: string
}>({
  showWindow: [false, { option: true }],
  // A fresh config home per case keeps the user's own ~/.meridian (keys, model settings) out of reach.
  configHome: async ({}, use) => {
    const configHome = mkdtempSync(join(tmpdir(), 'meridian-e2e-config-'))
    await use(configHome)
    rmSync(configHome, { recursive: true, force: true })
  },
  // A fresh user-data folder per case keeps the App's own profile (settings, drafts) out of reach and
  // gives every case the profile of a first launch.
  profile: async ({}, use) => {
    const profile = mkdtempSync(join(tmpdir(), 'meridian-e2e-profile-'))
    await use(profile)
    rmSync(profile, { recursive: true, force: true })
  },
  app: async ({ showWindow, configHome, profile }, use) => {
    const app = await launchApp(showWindow, configHome, profile)
    await use(app)
    await app.close()
  },
  win: async ({ app }, use) => {
    await use(await app.firstWindow())
  },
})

/**
 * Starts the App on the fixture vault with config home `configHome` and user-data folder `profile`, on
 * screen (isolated) when `showWindow`.
 */
async function launchApp(showWindow: boolean, configHome: string, profile: string): Promise<ElectronApplication> {
  const app = await electron.launch({
    // The specs assert Chinese copy, so the app must not follow the host's language.
    args: [APP_DIR, '--lang=zh-CN', `--user-data-dir=${profile}`, ...LAUNCH_SWITCHES],
    env: {
      ...ENV,
      MERIDIAN_LIBRARY_ROOT: VAULT,
      MERIDIAN_CONFIG_HOME: configHome,
      // Write '0' explicitly: a case that did not ask for a window stays off screen even when the
      // outer shell sets this variable.
      MERIDIAN_SHOW_WINDOW: showWindow ? 'isolated' : '0',
    },
  })
  // Native popup menus are recorded instead of shown: an open one keeps Main in its tracking loop
  // until it is dismissed, which nothing in a case does, and the App could not quit.
  await app.evaluate(({ Menu }) => {
    const shown: string[][] = []
    Object.assign(globalThis, { popupMenus: shown })
    Menu.prototype.popup = function record(this: InstanceType<typeof Menu>) {
      shown.push(this.items.map((item) => (item.type === 'separator' ? '—' : item.label)))
    }
  })
  return app
}

/**
 * Quits `app` as ⌘Q does and starts the App again on the same vault, config home `configHome` and
 * user-data folder `profile`, keeping what the profile holds; returns the new App and its first window
 * once the preload is up. The caller closes the new App.
 */
export async function relaunch(
  app: ElectronApplication, configHome: string, profile: string,
): Promise<{ app: ElectronApplication; win: Page }> {
  const closed = app.waitForEvent('close')
  await app.evaluate(({ app: running }) => { setTimeout(() => running.quit(), 0) })
  await closed
  const next = await launchApp(false, configHome, profile)
  const win = await next.firstWindow()
  await win.waitForFunction(() => (window as unknown as MeridianWindow).meridian !== undefined)
  return { app: next, win }
}

export { expect } from '@playwright/test'

/**
 * Prepares a case about the App going to the background and coming back, without system focus:
 * `away()` takes focus from the page the way switching to another app does, with blur and a focusout
 * that has no related target, and `back()` returns it the way switching back does. The page's own focus
 * is taken once here, so from then on Playwright's focus emulation alone decides whether the page has
 * focus; `away()` turns it off and `back()` on.
 */
export async function appSwitcher(app: ElectronApplication, win: Page): Promise<{
  away(): Promise<void>; back(): Promise<void>
}> {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.blurWebView())
  const cdp = await win.context().newCDPSession(win)
  const emulate = async (enabled: boolean) => { await cdp.send('Emulation.setFocusEmulationEnabled', { enabled }) }
  return { away: () => emulate(false), back: () => emulate(true) }
}

/** The API preload exposes to the page; inside `page.evaluate` it calls Core by contract method, bypassing the UI. */
export type MeridianWindow = Window & {
  meridian: { call(method: string, params: unknown): Promise<unknown>; platform: NodeJS.Platform }
}

/**
 * The native menus Main has popped up in this case, in order: each one's item labels, with '—' for a
 * separator. The `app` fixture records them instead of showing them.
 */
export const popupMenus = (app: ElectronApplication): Promise<string[][]> =>
  app.evaluate(() => (globalThis as unknown as { popupMenus: string[][] }).popupMenus)

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

type Box = { left: number; right: number; top: number }

/**
 * Where the parts of the panel head `head` lie: its content box inside border and padding; the title,
 * the first element inside it matching `title`, as its box, the lines its text runs over and its font
 * size; and each element inside it matching `actions`, with its box and accessible name, in order.
 */
export function panelHead(head: Locator, title: string, actions: string): Promise<{
  content: Box
  title: Box & { lines: Box[]; fontSize: number }
  actions: (Box & { label: string; width: number; height: number })[]
}> {
  return head.evaluate((el, [titleSelector, actionSelector]) => {
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    const content = {
      left: rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
      right: rect.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
      top: rect.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop),
    }
    const titleElement = el.querySelector(titleSelector)!
    const fragments: DOMRect[] = []
    const texts = document.createTreeWalker(titleElement, NodeFilter.SHOW_TEXT)
    for (let text = texts.nextNode(); text !== null; text = texts.nextNode()) {
      const range = document.createRange()
      range.selectNodeContents(text)
      fragments.push(...[...range.getClientRects()].filter((fragment) => fragment.width > 0))
    }
    // Fragments of one line overlap the middle of that line's first fragment.
    const lines: (Box & { bottom: number })[] = []
    for (const fragment of fragments) {
      const middle = (fragment.top + fragment.bottom) / 2
      const line = lines.find((held) => middle > held.top && middle < held.bottom)
      if (line === undefined) lines.push({ left: fragment.left, right: fragment.right, top: fragment.top, bottom: fragment.bottom })
      else Object.assign(line, { left: Math.min(line.left, fragment.left), right: Math.max(line.right, fragment.right) })
    }
    const titleRect = titleElement.getBoundingClientRect()
    return {
      content,
      title: {
        left: titleRect.left, right: titleRect.right, top: titleRect.top,
        lines: lines.sort((a, b) => a.top - b.top).map(({ left, right, top }) => ({ left, right, top })),
        fontSize: parseFloat(getComputedStyle(titleElement).fontSize),
      },
      actions: [...el.querySelectorAll(actionSelector)].map((action) => {
        const box = action.getBoundingClientRect()
        return {
          label: action.getAttribute('aria-label') ?? '', left: box.left, right: box.right, top: box.top,
          width: box.width, height: box.height,
        }
      }),
    }
  }, [title, actions] as const)
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

/**
 * The tags inside `scope` that do not show whole: one narrower than its text, unless it is capped
 * (`tag--capped`) and fades its long text at its cap, and one that has yielded and hides. Each comes with
 * its text, its width and the width its text needs.
 */
export function unfitTags(scope: Locator): Promise<{ text: string; width: number; needs: number; hidden: boolean }[]> {
  return scope.evaluateAll((roots) => roots.flatMap((root) => [...root.querySelectorAll('.tag')]
    .filter((tag) => tag.getClientRects().length > 0)
    .map((tag) => {
      const text = tag.querySelector(':scope > .tag-text') ?? tag
      const width = tag.getBoundingClientRect().width
      return {
        text: tag.textContent!.trim(), width, needs: width - text.clientWidth + text.scrollWidth,
        hidden: getComputedStyle(tag).visibility === 'hidden', capped: tag.classList.contains('tag--capped'),
      }
    })
    .filter((tag) => tag.hidden || (!tag.capped && tag.needs > tag.width + 0.5))
    .map(({ text, width, needs, hidden }) => ({ text, width, needs, hidden }))))
}

/**
 * The shown boxes among `titles` that are narrower than the least a list row keeps for its title,
 * twelve characters of body text (12 × --fs-base), each with its text and width.
 */
export function narrowTitles(titles: Locator): Promise<{ text: string; width: number }[]> {
  return titles.evaluateAll((boxes) => {
    const least = 12 * parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs-base'))
    return boxes.filter((box) => box.getClientRects().length > 0)
      .map((box) => ({ text: box.textContent!.trim(), width: box.getBoundingClientRect().width }))
      .filter((title) => title.width < least - 0.5)
  })
}

/** How far below its screen's header the top of `content` lies, in px. */
export function belowHeader(content: Locator): Promise<number> {
  return content.evaluate((el) => el.getBoundingClientRect().top
    - el.closest('.desk')!.querySelector('.desk-head')!.getBoundingClientRect().bottom)
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
