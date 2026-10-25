import type { Page } from '@playwright/test'
import { appSwitcher, expect, gotoPapers, relaunch, settle, test } from './app.js'

const crumbs = (win: Page) => win.locator('#crumb .cseg').allTextContents()

test('关掉再打开,窗口是上次的大小,停在上次的那一屏,侧栏是上次的宽度', async ({ app, win, configHome, profile }) => {
  await gotoPapers(win)
  await expect.poll(() => crumbs(win)).toEqual(['我的库', '论文'])
  const grip = win.locator('#sbgrip')
  await grip.focus()
  await grip.press('ArrowRight')
  const width = await win.locator('#main').evaluate((main) => (main as HTMLElement).style.getPropertyValue('--sbw'))
  expect(width).not.toBe('232px')
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setSize(1200, 760) })

  const reopened = await relaunch(app, configHome, profile)
  try {
    const size = await reopened.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getSize())
    expect(size).toEqual([1200, 760])
    await expect.poll(() => crumbs(reopened.win)).toEqual(['我的库', '论文'])
    await expect(reopened.win.locator('#main')).toHaveAttribute('style', new RegExp(`--sbw: ${width}`))
  } finally {
    await reopened.app.close()
  }
})

test('Meridian 不是当前的 App 时侧栏的当前行从强调色变成中性灰,回来后变回', async ({ app, win }) => {
  const current = win.locator('.srow.on').first()
  await expect(current).toBeVisible()
  // The row's background eases between the two looks; the measurement takes the settled one.
  const look = async () => {
    await settle(current)
    return current.evaluate((row) => {
      const style = getComputedStyle(row)
      return [style.backgroundColor, style.color]
    })
  }
  const active = await look()
  const switcher = await appSwitcher(app, win)
  await switcher.away()
  await expect(win.locator('html')).toHaveAttribute('data-window-inactive', '')
  const inactive = await look()
  // The neutral selected look: --selected and --on-selected, the look of a pressed toggle.
  const neutral = await win.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = 'var(--selected)'
    probe.style.color = 'var(--on-selected)'
    document.body.append(probe)
    const style = getComputedStyle(probe)
    const values = [style.backgroundColor, style.color]
    probe.remove()
    return values
  })
  expect(inactive).toEqual(neutral)
  expect(inactive).not.toEqual(active)
  await switcher.back()
  await expect(win.locator('html')).not.toHaveAttribute('data-window-inactive', '')
  expect(await look()).toEqual(active)
})
