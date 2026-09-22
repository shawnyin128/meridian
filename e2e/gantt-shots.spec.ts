import { resolve } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { fixtureDay, gotoProject, parkPointer, test, vaultToday, type MeridianWindow } from './app.js'

const SHOTS = resolve(import.meta.dirname, '../.superpowers/e2e-shots/gantt')

const SIZES = [[1280, 720], [1440, 900], [1920, 1080], [2560, 1440]] as const
const THEMES = [['light', ''], ['dark', 'dark']] as const

/** The screen you entered is always hanging, and the selector should be closed in the currently displayed screen. */
const shown = (win: Page) => win.locator('.screenslot:not([hidden])')

/** After waiting for two frames: changing the window size, scrolling and changing the theme, the viewport will not be recalculated until the next frame. */
const frames = (win: Page) => win.evaluate(() => new Promise<null>((drawn) => {
  requestAnimationFrame(() => requestAnimationFrame(() => drawn(null)))
}))

/**
 * The two items used in the screenshot are: name, how many days from the end of the schedule to today, and status. The fixture items are all days from the beginning of the window
 * Drawing starts and spans most of the window, neither of the two settings, 1280 and 1440, will roll out of the viewport; with these two, the viewport stops at the beginning
 * The entire paragraph on the right is outside, and when the scroll reaches the end, the entire paragraph on the left is outside.
 */
const SAMPLES = [
  { name: '残桩样例 · 右', start: 21, due: 22, status: '进行中' },
  { name: '残桩样例 · 左', start: -8, due: -7, status: '搁置' },
] as const

/**
 * Create two projects attached to both ends of the Gantt window, then click on the overview and wait for Gantt to finish drawing. `today` is Curry’s today.
 * Returns the overview Gantt's `.gantt` locator.
 */
async function enterOverviewWithSamples(win: Page, today: string): Promise<Locator> {
  // The overview is only retrieved after mounting and writing on the interface. The few times you bypass the interface and make direct adjustments, you must do so before entering the overview.
  for (const sample of SAMPLES) {
    await win.evaluate(async ({ name, patch }) => {
      const meridian = (window as unknown as MeridianWindow).meridian
      await meridian.call('project.create', { name })
      const rows = await meridian.call('project.overview', {}) as { id: string; name: string }[]
      await meridian.call('project.update', { id: rows.find((p) => p.name === name)!.id, patch })
    }, {
      name: sample.name,
      patch: { start: fixtureDay(today, sample.start), due: fixtureDay(today, sample.due), status: sample.status },
    })
  }
  await win.locator('[data-desk="restl"]').click()
  const gantt = shown(win).locator('.gantt')
  await gantt.locator('.grow').first().waitFor()
  return gantt
}

test('截下总览甘特在 1280/1440 两档窗口与亮暗两套主题下的图,视口停在开头与末尾各一张', async ({ app, win }) => {
  test.slow()
  const gantt = await enterOverviewWithSamples(win, await vaultToday(win))
  for (const [w, h] of SIZES.slice(0, 2)) {
    await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]!.setSize(s.w, s.h), { w, h })
    for (const [theme, value] of THEMES) {
      await win.evaluate((v) => { document.documentElement.dataset.theme = v }, value)
      for (const at of ['start', 'end'] as const) {
        await gantt.locator('.gwrap').evaluate((el, end) => { el.scrollLeft = end ? el.scrollWidth : 0 }, at === 'end')
        await parkPointer(win)
        await frames(win)
        await gantt.screenshot({ path: `${SHOTS}/overview-${w}-${theme}-${at}.png` })
      }
    }
  }
})

test('截下总览甘特在 1920/2560 两档窗口与亮暗两套主题下的图,视口停在开头与末尾各一张', async ({ app, win }) => {
  test.slow()
  const gantt = await enterOverviewWithSamples(win, await vaultToday(win))
  for (const [w, h] of SIZES.slice(2)) {
    await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]!.setSize(s.w, s.h), { w, h })
    for (const [theme, value] of THEMES) {
      await win.evaluate((v) => { document.documentElement.dataset.theme = v }, value)
      for (const at of ['start', 'end'] as const) {
        await gantt.locator('.gwrap').evaluate((el, end) => { el.scrollLeft = end ? el.scrollWidth : 0 }, at === 'end')
        await parkPointer(win)
        await frames(win)
        await gantt.screenshot({ path: `${SHOTS}/overview-${w}-${theme}-${at}.png` })
      }
    }
  }
})

test('截下项目详情甘特在四档窗口与亮暗两套主题下的图', async ({ app, win }) => {
  test.slow()
  await gotoProject(win)
  const gantt = shown(win).locator('.gantt')
  for (const [w, h] of SIZES) {
    await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]!.setSize(s.w, s.h), { w, h })
    for (const [theme, value] of THEMES) {
      await win.evaluate((v) => { document.documentElement.dataset.theme = v }, value)
      await parkPointer(win)
      await frames(win)
      await gantt.screenshot({ path: `${SHOTS}/project-${w}-${theme}.png` })
    }
  }
})
