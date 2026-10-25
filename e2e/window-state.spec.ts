import type { Page } from '@playwright/test'
import { expect, gotoPapers, relaunch, test } from './app.js'

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
