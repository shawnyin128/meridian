import type { ElectronApplication, Page } from '@playwright/test'
import { expect, gotoPapers, test } from './app.js'

/** Visited screens stay mounted, so selectors are scoped to the screen shown. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

/** Clicks the application menu's item `id`, as choosing it in the menu bar or pressing its shortcut does. */
const choose = (app: ElectronApplication, id: string) => app.evaluate(({ Menu }, item) => {
  Menu.getApplicationMenu()!.getMenuItemById(item)!.click()
}, id)

/** The label of the application menu's item `id`. */
const labelOf = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, item) => Menu.getApplicationMenu()!.getMenuItemById(item)!.label, id)

/** The window's own zoom level, which Electron's zoom roles step. */
const windowZoom = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomLevel())

test('视图菜单的缩放在阅读器里缩放论文,别处缩放整个窗口', async ({ app, win }) => {
  await gotoPapers(win)
  await win.locator('#libq').fill('STAR: SPECULATIVE DECODING')
  await expect(win.locator('.ptable tbody tr')).toHaveCount(1)
  await win.locator('.ptable tbody tr').click()
  await shown(win, '.pdetail [aria-label="开始阅读"]').click()
  const percent = shown(win, '.zoomctl .zoom-reset')
  await expect(percent).toHaveText('100%')

  await choose(app, 'zoomIn')
  await expect(percent).toHaveText('120%')
  await choose(app, 'zoomIn-equals')
  await expect(percent).toHaveText('140%')
  await choose(app, 'zoomOut')
  await expect(percent).toHaveText('120%')
  await choose(app, 'resetZoom')
  await expect(percent).toHaveText('100%')
  expect(await windowZoom(app)).toBe(0)

  await gotoPapers(win)
  await choose(app, 'zoomIn')
  await expect.poll(() => windowZoom(app)).toBe(0.5)
  await choose(app, 'resetZoom')
  await expect.poll(() => windowZoom(app)).toBe(0)
})

test('视图菜单第一项随侧栏改名,点它收起和展开侧栏', async ({ app, win }) => {
  await win.locator('.sidebar').waitFor()
  const main = win.locator('#main')
  await expect.poll(() => labelOf(app, 'toggleSidebar')).toBe('收起侧栏')
  await choose(app, 'toggleSidebar')
  await expect(main).toHaveClass(/sbhide/)
  await expect.poll(() => labelOf(app, 'toggleSidebar')).toBe('展开侧栏')
  await win.keyboard.press('ControlOrMeta+b')
  await expect(main).not.toHaveClass(/sbhide/)
  await expect.poll(() => labelOf(app, 'toggleSidebar')).toBe('收起侧栏')
})

test('文件菜单的新建项目打开项目列表里的新建行', async ({ app, win }) => {
  await win.locator('.sidebar').waitFor()
  await choose(app, 'newProject')
  await expect(shown(win, '.projpanel .inedit')).toBeFocused()
})

test('在 macOS 上向返回方向轻扫,和点返回按钮一样回到来的那一屏', async ({ app, win }) => {
  test.skip(process.platform !== 'darwin', 'Electron emits swipe only on macOS')
  await gotoPapers(win)
  await win.locator('#libq').fill('STAR: SPECULATIVE DECODING')
  await win.locator('.ptable tbody tr').click()
  await shown(win, '.pdetail [aria-label="开始阅读"]').click()
  await expect(shown(win, '.zoomctl')).toBeVisible()
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.emit('swipe', {}, 'left') })
  await expect(shown(win, '#libq')).toBeVisible()
})
