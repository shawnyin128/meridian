import type { ElectronApplication, Page } from '@playwright/test'
import { expect, gotoPapers, popupMenus, test } from './app.js'

/** Visited screens stay mounted, so selectors are scoped to the screen shown. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

/** Clicks the application menu's item `id`, as choosing it in the menu bar or pressing its shortcut does. */
const choose = (app: ElectronApplication, id: string) => app.evaluate(({ Menu }, item) => {
  Menu.getApplicationMenu()!.getMenuItemById(item)!.click()
}, id)

/** The label of the application menu's item `id`. */
const labelOf = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, item) => Menu.getApplicationMenu()!.getMenuItemById(item)!.label, id)

/** The fixture paper with a source PDF, opened in the reader from the paper table. */
async function openReader(win: Page): Promise<void> {
  await gotoPapers(win)
  await win.locator('#libq').fill('STAR: SPECULATIVE DECODING')
  await expect(win.locator('.ptable tbody tr')).toHaveCount(1)
  await win.locator('.ptable tbody tr').click()
  await shown(win, '.paper-detail-slot [aria-label="开始阅读"]').click()
}

/** The window's own zoom level, which Electron's zoom roles step. */
const windowZoom = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomLevel())

test('视图菜单的缩放在阅读器里缩放论文,别处缩放整个窗口', async ({ app, win }) => {
  await openReader(win)
  const percent = shown(win, '.zoom-control .zoom-control-reset')
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

  // In the reader the paper chat takes the sidebar's place; its back button leaves for Papers.
  await shown(win, '.paper-chat .back').click()
  await expect(shown(win, '#libq')).toBeVisible()
  await choose(app, 'zoomIn')
  await expect.poll(() => windowZoom(app)).toBe(0.5)
  await choose(app, 'resetZoom')
  await expect.poll(() => windowZoom(app)).toBe(0)
})

test('视图菜单第一项随侧栏改名,点它收起和展开侧栏', async ({ app, win }) => {
  await win.locator('#sidebar').waitFor()
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
  await win.locator('#sidebar').waitFor()
  await choose(app, 'newProject')
  await expect(shown(win, '.projpanel .inedit')).toBeFocused()
})

test('在 macOS 上向返回方向轻扫,和点返回按钮一样回到来的那一屏', async ({ app, win }) => {
  test.skip(process.platform !== 'darwin', 'Electron emits swipe only on macOS')
  await openReader(win)
  await expect(shown(win, '.zoom-control')).toBeVisible()
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.emit('swipe', {}, 'left') })
  await expect(shown(win, '#libq')).toBeVisible()
})

test('右键项目卡片和侧栏的对话行打开它们 … 按钮的同一个菜单,主进程不再弹编辑菜单', async ({ app, win }) => {
  await win.locator('[data-desk="resproj"]').click()
  const card = shown(win, '.projpanel[data-proj="draft"]')
  await card.click({ button: 'right', position: { x: 40, y: 16 } })
  await expect(win.locator('[role="menu"] [role="menuitem"]').first()).toHaveText('重命名')
  await expect(card.locator('.dots')).toHaveAttribute('aria-expanded', 'true')
  await win.keyboard.press('Escape')
  await expect(win.locator('[role="menu"]')).toHaveCount(0)

  const chat = win.locator('#chatList [data-chat]').first()
  await chat.click({ button: 'right' })
  await expect(win.locator('[role="menu"] [role="menuitem"]')).toHaveText(['重命名', '归档', '删除'])
  expect(await popupMenus(app)).toEqual([])
})
