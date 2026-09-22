import type { ElectronApplication, Page } from '@playwright/test'
import { expect, openSettings, test, type MeridianWindow } from './app.js'

/** The number of steps for Tab walking: enough to complete the focusable elements in the setting modal and circle back to the starting point. */
const TAB_STEPS = 8

type Session = { id: string; title: string; archived: boolean }
type ExtensionStatus = {
  id: 'codex' | 'claude-code'
  name: string
  state: 'installed' | 'update-required' | 'not-installed'
  version?: string
  installCommand: string
  updateCommand: string
}

const EXTENSION_STATE_COPY: Record<ExtensionStatus['state'], string> = {
  installed: '已安装',
  'update-required': '需要更新',
  'not-installed': '未安装',
}

/** Bypass the interface and adjust the contract directly. */
const core = <T>(win: Page, method: string, params: unknown) =>
  win.evaluate(([m, p]) => (window as unknown as MeridianWindow).meridian.call(m as string, p),
    [method, params] as const) as Promise<T>

/**
 * Press `CmdOrCtrl` plus `key`. The event is injected into the window by the main process, and the page is returned to the menu without processing.
 * accelerator - This path is the same as the user's real keystroke, and the keydown processor on the page cannot touch it.
 * Playwright's own `keyboard.press` is only sent to the rendering process and cannot reach the menu.
 */
const press = (app: ElectronApplication, key: string) =>
  app.evaluate(({ BrowserWindow }, pressed) => {
    BrowserWindow.getAllWindows()[0]!.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: pressed,
      modifiers: [process.platform === 'darwin' ? 'meta' : 'control'],
    })
  }, key)

test('应用菜单里有「设置…」,其余菜单仍是 Electron 的角色', async ({ app, win }) => {
  // The menu is installed in whenReady, and it is guaranteed to be completely installed after the first window comes out.
  await win.locator('.sidebar').waitFor()
  const menu = await app.evaluate(({ Menu }) => {
    const built = Menu.getApplicationMenu()
    if (!built) throw new Error('主进程没有装应用菜单')
    return built.items.map((top) => ({
      label: top.label,
      role: top.role ?? null,
      items: (top.submenu?.items ?? []).map((item) => ({
        label: item.label, role: item.role ?? null, id: item.id, accelerator: item.accelerator ?? null,
      })),
    }))
  })
  console.log(`菜单 ${JSON.stringify(menu)}`)

  const mac = process.platform === 'darwin'
  // Only the menu where "Settings..." and "File" are listed by themselves, the rest are still roles, copy and paste, zoom,
  // The developer tools are still there; on macOS, "Settings..." is in the application name menu, and the file menu is still a role;
  // There is an additional "Tools" menu without role on Windows/Linux, sandwiched between the view and the window
  expect(menu.map((top) => top.role)).toEqual(mac
    ? ['appmenu', 'filemenu', 'editmenu', 'viewmenu', 'windowmenu']
    : [null, 'editmenu', 'viewmenu', null, 'windowmenu'])

  const settings = menu.flatMap((top) => top.items).filter((item) => item.id === 'settings')
  expect(settings).toHaveLength(1)
  expect(settings[0]!.label).toBe('设置…')
  expect(settings[0]!.accelerator).toBe('CmdOrCtrl+,')
  // On macOS, it's under the first menu of the menu bar (the application name menu); on Windows/Linux, it's under the "Tools" menu,
  // That is, the fourth top-level menu (after File, Edit, and View)
  expect(menu.findIndex((top) => top.items.some((item) => item.id === 'settings'))).toBe(mac ? 0 : 3)
})

// The buttons that are not connected to the page are returned to the accelerator of the menu. That step is the window's own native menu.
// A window that is not on the screen cannot get focus, so there is no escape route - pressing Ctrl+, nothing will happen.
test.describe(() => {
  test.use({ showWindow: true })

  test('应用菜单里的「设置…」与快捷键都打开设置,别的键不打开', async ({ app, win }) => {
    await win.locator('.sidebar').waitFor()
    await expect(win.locator('.setdlg')).toHaveCount(0)

    await openSettings(app, win)
    await expect(win.locator('.setdlg')).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(win.locator('.setdlg')).toHaveCount(0)

    // The shortcut key requires that the window really holds the system focus; turn off Playwright's focus simulation, and hasFocus will report the actual result.
    const cdp = await win.context().newCDPSession(win)
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false })
    await app.evaluate(({ BrowserWindow }) => {
      const target = BrowserWindow.getAllWindows()[0]!
      target.show()
      target.focus()
    })
    await expect.poll(() => win.evaluate(() => document.hasFocus()), {
      message: '窗口没有真的拿到系统焦点,原生菜单的快捷键到不了',
    }).toBe(true)

    await press(app, ',')
    await expect(win.locator('.setdlg')).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(win.locator('.setdlg')).toHaveCount(0)

    // Counter example: What opens settings is the shortcut key registered in "Settings...", not "whatever key is pressed to open it"
    await press(app, '.')
    await expect(win.locator('.setdlg')).toHaveCount(0)
  })
})

test('preload 仍是窄接口:页面上没有任何收得下 channel 名的口子', async ({ app, win }) => {
  await win.locator('.sidebar').waitFor()

  const surface = await win.evaluate(() => {
    const page = window as unknown as Record<string, unknown>
    const bridge = page['meridian'] as Record<string, unknown>
    return {
      meridian: Object.keys(bridge).sort().map((k) => `${k}:${typeof bridge[k]}`),
      // The page cannot get Node and Electron, so there is no second way around this bridge.
      escapes: ['require', 'process', 'ipcRenderer', 'electron', 'module']
        .map((k) => `${k}:${typeof page[k]}`),
    }
  })
  console.log(`preload 面 ${JSON.stringify(surface)}`)
  expect(surface.meridian).toEqual([
    'call:function', 'chooseLibraryRoot:function', 'chooseWorkspaceRoot:function', 'onOpenAgentTutorial:function',
    'onOpenSettings:function', 'pathForFile:function', 'platform:string', 'restartApp:function', 'revealFile:function',
    'setLocale:function', 'setTitleBarTheme:function', 'toggleMaximize:function', 'updates:object',
  ])
  expect(surface.escapes).toEqual([
    'require:undefined', 'process:undefined', 'ipcRenderer:undefined',
    'electron:undefined', 'module:undefined',
  ])

  // The subscription port only communicates the agreed channel: the main process sends other messages, and the processor on the page does not ring once.
  await win.evaluate(() => {
    const page = window as unknown as {
      seen: number
      meridian: { onOpenSettings(handler: () => void): () => void }
    }
    page.seen = 0
    page.meridian.onOpenSettings(() => { page.seen += 1 })
  })
  const seen = () => win.evaluate(() => (window as unknown as { seen: number }).seen)

  await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0]!.webContents
    for (const channel of ['open-settings', 'meridian:open', 'meridian:opensettings', 'settings']) {
      wc.send(channel)
    }
  })
  await win.waitForTimeout(300)
  expect(await seen()).toBe(0)

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.webContents.send('meridian:open-settings')
  })
  await expect.poll(seen).toBe(1)
})

test('设置是左右分栏:左栏是分类,右栏是选中那一类的内容', async ({ app, win }) => {
  await openSettings(app, win)
  const cats = win.locator('.setdlg .set-side .srow')
  const archived = (await core<Session[]>(win, 'chat.list', {})).filter((s) => s.archived)
  expect(archived.length).toBeGreaterThan(0)

  // The left column only contains categories that really have content today, and does not include empty categories to make up the number.
  const labels = await cats.allInnerTexts()
  console.log(`左栏分类 ${JSON.stringify(labels)}`)
  expect(labels).toEqual(['外观', '存储', 'AI 模型', '扩展', '论文推送', '关注', '发现', '归档的对话'])
  await expect(win.locator('.setdlg .set-side .srow.on')).toHaveCount(1)
  await expect(win.locator('.setdlg .appearance-choice')).toHaveText(['浅色', '深色', '跟随系统'])
  await expect(win.locator('#themeBtn')).toHaveCount(0)
  await cats.filter({ hasText: '存储' }).click()
  await expect(win.locator('.setdlg .storage-reset')).toContainText('重置论文库')
  const directory = win.locator('.setdlg .storage-root .directory-field')
  await expect(directory.locator('input')).toHaveValue(/meridian/i)
  await expect(directory.locator('[aria-label="选择论文库根目录"]')).toHaveCount(1)
  await expect(win.getByRole('button', { name: '选择根目录…' })).toHaveCount(0)
  // Regular applications will be enabled; these shared fixtures are not allowed to be cleared by an interface use case.
  await expect(win.locator('.setdlg .storage-reset .btn')).toBeDisabled()

  // Click each category in the left column one by one, and the content in the right column will be changed to that category; the push setting itself will be divided into multiple sections.
  for (const label of labels) {
    await cats.filter({ hasText: label }).click()
    await expect(win.locator('.setdlg .set-side .srow.on')).toHaveText([label])
    await expect(win.locator('.setdlg .set-main')).toContainText(label)
  }

  await expect(win.locator('.setdlg .set-main .section-heading')).toHaveText(`归档的对话 · ${archived.length}`)
  await expect(win.locator('.setdlg .set-main .wrow')).toHaveCount(archived.length)
  await expect(win.locator('.setdlg .set-main .wrow .nm')).toHaveText(archived.map((s) => s.title))
})

test('扩展设置展示 Core 检查到的状态与对应安装或更新命令', async ({ app, win }) => {
  const statuses = await core<ExtensionStatus[]>(win, 'extensions.status', {})
  expect(statuses.map((status) => status.id)).toEqual(['codex', 'claude-code'])

  await openSettings(app, win)
  await win.locator('.setdlg .srow[data-setcat="extensions"]').click()

  for (const status of statuses) {
    const entry = win.locator(`.setdlg [data-extension="${status.id}"]`)
    // An installed extension, current or not, is kept up to date rather than installed again.
    const updating = status.state !== 'not-installed'
    const command = updating ? status.updateCommand : status.installCommand
    await expect(entry).toContainText(status.name)
    await expect(entry.locator('.extension-state')).toContainText(EXTENSION_STATE_COPY[status.state])
    await expect(entry.locator('pre')).toHaveText(command)
    await expect(entry.getByRole('button', { name: `复制 ${status.name} ${updating ? '更新' : '安装'}命令` })).toHaveCount(1)
  }
})

test('一条归档都没有时,右栏给空态而不是只剩一个标题', async ({ app, win }) => {
  await win.locator('.sidebar').waitFor()
  for (const s of (await core<Session[]>(win, 'chat.list', {})).filter((x) => x.archived)) {
    await core(win, 'chat.setArchived', { id: s.id, archived: false })
  }

  await openSettings(app, win)
  await win.locator('.setdlg .srow[data-setcat="archived"]').click()
  await expect(win.locator('.setdlg .set-main .section-heading')).toHaveText('归档的对话 · 0')
  await expect(win.locator('.setdlg .set-main .wrow')).toHaveCount(0)
  await expect(win.locator('.setdlg .set-main .empty-state')).toHaveCount(1)
})

test('取消归档弹出的横幅盖在设置模态之上', async ({ app, win }) => {
  await win.locator('.sidebar').waitFor()
  const target = (await core<Session[]>(win, 'chat.list', {})).find((s) => !s.archived)!
  await core(win, 'chat.setArchived', { id: target.id, archived: true })

  await openSettings(app, win)
  await win.locator('.setdlg .srow[data-setcat="archived"]').click()
  await win.locator(`.setdlg .wrow[data-chat="${target.id}"] .btn`, { hasText: '取消归档' }).click()
  await win.locator('#banner.show').waitFor()

  const zIndex = await win.evaluate(() => ({
    banner: Number(getComputedStyle(document.querySelector('#banner')!).zIndex),
    setdlg: Number(getComputedStyle(document.querySelector('.setdlg')!).zIndex),
    scrim: Number(getComputedStyle(document.querySelector('.scrim')!).zIndex),
  }))
  expect(zIndex.banner).toBeGreaterThan(zIndex.setdlg)
  expect(zIndex.banner).toBeGreaterThan(zIndex.scrim)
})

test('设置模态:屏上其余部分隐掉,Tab 不跑到模态外,Esc 之后焦点回到打开之前那一处', async ({ app, win }) => {
  await win.locator('#sbBtn').focus()
  expect(await win.evaluate(() => document.activeElement?.id ?? '')).toBe('sbBtn')

  await openSettings(app, win)
  // Modal half: The mask blocks the pointer and the rest of the screen is completely hidden from screen readers.
  await expect(win.locator('.scrim')).toHaveCount(1)
  await expect(win.locator('#root')).toHaveAttribute('aria-hidden', 'true')

  const walk: string[] = []
  for (let i = 0; i < TAB_STEPS; i++) {
    await win.keyboard.press('Tab')
    walk.push(await win.evaluate(() => {
      const el = document.activeElement
      const where = el?.closest('.setdlg') ? '模态里' : '模态外'
      return `${where}:${el?.tagName ?? 'NONE'}|${(el?.textContent ?? '').trim().slice(0, 10)}`
    }))
  }
  console.log(`焦点陷阱 Tab=${TAB_STEPS} ${JSON.stringify(walk)}`)
  expect(walk.filter((step) => step.startsWith('模态外'))).toEqual([])

  await win.keyboard.press('Escape')
  await expect(win.locator('.setdlg')).toHaveCount(0)
  await expect(win.locator('#root')).not.toHaveAttribute('aria-hidden', 'true')
  // The focus is returned in a timeout after the modal is unloaded. The disappearance of the element does not mean that the focus has been returned.
  await expect.poll(() => win.evaluate(() => document.activeElement?.id ?? '')).toBe('sbBtn')
})
