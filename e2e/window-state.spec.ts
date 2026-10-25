import type { Locator, Page } from '@playwright/test'
import { appSwitcher, expect, gotoPapers, openSettings, relaunch, settle, test } from './app.js'

const crumbs = (win: Page) => win.locator('#crumb .cseg').allTextContents()

test('关掉再打开,窗口是上次的大小,停在上次的那一屏,侧栏是上次的宽度,收起的侧栏仍收起', async ({ app, win, configHome, profile }) => {
  await gotoPapers(win)
  await expect.poll(() => crumbs(win)).toEqual(['我的库', '论文'])
  const grip = win.locator('#sbgrip')
  await grip.focus()
  await grip.press('ArrowRight')
  const width = await win.locator('#main').evaluate((main) => (main as HTMLElement).style.getPropertyValue('--sbw'))
  expect(width).not.toBe('232px')
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setSize(1200, 760) })
  await win.keyboard.press('ControlOrMeta+b')
  await expect(win.locator('#main')).toHaveClass(/sbhide/)

  const reopened = await relaunch(app, configHome, profile)
  try {
    const size = await reopened.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getSize())
    expect(size).toEqual([1200, 760])
    await expect.poll(() => crumbs(reopened.win)).toEqual(['我的库', '论文'])
    await expect(reopened.win.locator('#main')).toHaveAttribute('style', new RegExp(`--sbw: ${width}`))
    await expect(reopened.win.locator('#main')).toHaveClass(/sbhide/)
  } finally {
    await reopened.app.close()
  }
})

/** A row's background and text colour once its look has settled; the look eases between states. */
const lookOf = async (row: Locator) => {
  await settle(row)
  return row.evaluate((element) => {
    const style = getComputedStyle(element)
    return [style.backgroundColor, style.color]
  })
}

/** The neutral selected look, --selected and --on-selected, the look of a pressed toggle. */
const neutralOf = (win: Page) => win.evaluate(() => {
  const probe = document.createElement('div')
  probe.style.backgroundColor = 'var(--selected)'
  probe.style.color = 'var(--on-selected)'
  document.body.append(probe)
  const style = getComputedStyle(probe)
  const values = [style.backgroundColor, style.color]
  probe.remove()
  return values
})

test('Meridian 不是当前的 App 时侧栏和设置的当前行从强调色变成中性灰,回来后变回', async ({ app, win }) => {
  // Settings opens first: a click gives the page its own focus back, which appSwitcher takes only once.
  await openSettings(app, win)
  const rows = [win.locator('#sidebar .nav-row.on'), win.locator('.setdlg .split-nav .nav-row.on')]
  const active = [await lookOf(rows[0]!), await lookOf(rows[1]!)]
  const switcher = await appSwitcher(app, win)
  await switcher.away()
  await expect(win.locator('html')).toHaveAttribute('data-window-inactive', '')
  const neutral = await neutralOf(win)
  for (const [index, row] of rows.entries()) {
    const inactive = await lookOf(row)
    expect(inactive).toEqual(neutral)
    expect(inactive).not.toEqual(active[index])
  }
  await switcher.back()
  await expect(win.locator('html')).not.toHaveAttribute('data-window-inactive', '')
  expect([await lookOf(rows[0]!), await lookOf(rows[1]!)]).toEqual(active)
})
