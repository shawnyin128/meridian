import type { CDPSession, ElectronApplication, Page } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, openSettings, test, type MeridianWindow } from './app.js'

/** Tab presses in the focus walk: enough to pass every focusable element in Settings and wrap around. */
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

/** Calls a contract method directly, bypassing the UI. */
const core = <T>(win: Page, method: string, params: unknown) =>
  win.evaluate(([m, p]) => (window as unknown as MeridianWindow).meridian.call(m as string, p),
    [method, params] as const) as Promise<T>

/** The macOS virtual key codes (Carbon's `kVK_ANSI_Comma` and `kVK_ANSI_Period`) of the keys `press` takes. */
const MAC_KEY_CODES = { ',': 0x2b, '.': 0x2f } as const

/**
 * Presses `CmdOrCtrl` plus `key`. A key the page does not handle goes on to the menu accelerators: the
 * same path as a real keystroke, out of reach of the page's keydown handlers. Playwright's own
 * `keyboard.press` reaches only the renderer and never the menu. On Windows and Linux the main process
 * injects the event with `sendInputEvent`. Electron hands the macOS menu only a key event that carries
 * a native NSEvent, which `sendInputEvent` does not build; there the key goes through the DevTools
 * protocol of `cdp` with its macOS key code, from which Chromium builds that NSEvent.
 */
const press = (app: ElectronApplication, cdp: CDPSession, key: keyof typeof MAC_KEY_CODES) =>
  process.platform === 'darwin'
    ? cdp.send('Input.dispatchKeyEvent', {
      // 4 is Command in the protocol's modifier bit field.
      type: 'rawKeyDown', modifiers: 4, text: key, unmodifiedText: key, nativeVirtualKeyCode: MAC_KEY_CODES[key],
    })
    : app.evaluate(({ BrowserWindow }, pressed) => {
      BrowserWindow.getAllWindows()[0]!.webContents.sendInputEvent({
        type: 'keyDown',
        keyCode: pressed,
        modifiers: ['control'],
      })
    }, key)

test('应用菜单里有「设置…」,其余菜单仍是 Electron 的角色', async ({ app, win }) => {
  // The menu is set in whenReady, so it is fully installed once the first window is up.
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
  // Only "Settings…", the File menu and the Help menu are built by hand; the rest are still roles, so
  // copy and paste, zoom and the developer tools remain. On macOS "Settings…" sits in the app-name menu
  // and File is still a role; Windows and Linux add a Tools menu without a role, between View and
  // Window. Every platform ends with the Help menu, which has no role.
  expect(menu.map((top) => top.role)).toEqual(mac
    ? ['appmenu', 'filemenu', 'editmenu', 'viewmenu', 'windowmenu', null]
    : [null, 'editmenu', 'viewmenu', null, 'windowmenu', null])

  const settings = menu.flatMap((top) => top.items).filter((item) => item.id === 'settings')
  expect(settings).toHaveLength(1)
  expect(settings[0]!.label).toBe('设置…')
  expect(settings[0]!.accelerator).toBe('CmdOrCtrl+,')
  // On macOS it is in the menu bar's first menu (the app-name menu); on Windows and Linux in the Tools
  // menu, the fourth top-level menu after File, Edit and View.
  expect(menu.findIndex((top) => top.items.some((item) => item.id === 'settings'))).toBe(mac ? 0 : 3)
})

// The window stays on screen because Windows sends the shortcut through sendInputEvent, which has not
// been verified on an offscreen window.
test.describe(() => {
  test.use({ showWindow: true })

  test('应用菜单里的「设置…」与快捷键都打开设置,别的键不打开', async ({ app, win }) => {
    await win.locator('.sidebar').waitFor()
    await expect(win.locator('.setdlg')).toHaveCount(0)

    await openSettings(app, win)
    await expect(win.locator('.setdlg')).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(win.locator('.setdlg')).toHaveCount(0)

    const cdp = await win.context().newCDPSession(win)
    await press(app, cdp, ',')
    await expect(win.locator('.setdlg')).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(win.locator('.setdlg')).toHaveCount(0)

    // Negative check: Settings opens on the shortcut registered for "Settings…", not on any key.
    await press(app, cdp, '.')
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
    'call:function', 'chooseLibraryRoot:function', 'chooseWorkspaceRoot:function', 'onFullScreen:function',
    'onOpenAgentTutorial:function', 'onOpenPalette:function', 'onOpenSettings:function', 'pathForFile:function',
    'platform:string', 'restartApp:function', 'revealFile:function', 'setLocale:function', 'setTitleBarTheme:function',
    'toggleMaximize:function', 'updates:object',
  ])
  expect(surface.escapes).toEqual([
    'require:undefined', 'process:undefined', 'ipcRenderer:undefined',
    'electron:undefined', 'module:undefined',
  ])

  // The subscription listens only on its agreed channel: other messages from the main process never
  // fire the page's handler.
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

  // The palette subscription likewise listens only on its own channel.
  await win.evaluate(() => {
    const page = window as unknown as {
      palette: number
      meridian: { onOpenPalette(handler: () => void): () => void }
    }
    page.palette = 0
    page.meridian.onOpenPalette(() => { page.palette += 1 })
  })
  const palette = () => win.evaluate(() => (window as unknown as { palette: number }).palette)
  await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0]!.webContents
    for (const channel of ['open-palette', 'meridian:palette', 'meridian:openpalette', 'meridian:open-settings']) {
      wc.send(channel)
    }
  })
  await win.waitForTimeout(300)
  expect(await palette()).toBe(0)
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.webContents.send('meridian:open-palette')
  })
  await expect.poll(palette).toBe(1)
})

test('设置是左右分栏:左栏是分类,右栏是选中那一类的内容', async ({ app, win }) => {
  await openSettings(app, win)
  const cats = win.locator('.setdlg .set-side .srow')
  const archived = (await core<Session[]>(win, 'chat.list', {})).filter((s) => s.archived)
  expect(archived.length).toBeGreaterThan(0)

  // The left column lists only categories that have content today, with no empty ones as filler.
  const labels = await cats.allInnerTexts()
  console.log(`左栏分类 ${JSON.stringify(labels)}`)
  expect(labels).toEqual(['外观', '存储', 'API', '扩展', '论文推送', '归档的对话'])
  await expect(win.locator('.setdlg .set-side .srow.on')).toHaveCount(1)
  await expect(win.getByRole('radiogroup', { name: '外观', exact: true }).locator('.appearance-choice')).toHaveText(['浅色', '深色', '跟随系统'])
  await expect(win.getByRole('radiogroup', { name: '外观主题', exact: true }).locator('.appearance-choice'))
    .toHaveText(['默认', '朱漆', '螺钿', '秋叶', '流霞'])
  await expect(win.locator('#themeBtn')).toHaveCount(0)
  await cats.filter({ hasText: '存储' }).click()
  await expect(win.locator('.setdlg .storage-reset')).toContainText('重置论文库')
  const directory = win.locator('.setdlg .storage-root .directory-field')
  await expect(directory.locator('input')).toHaveValue(/meridian/i)
  await expect(directory.locator('[aria-label="选择论文库根目录"]')).toHaveCount(1)
  await expect(win.getByRole('button', { name: '选择根目录…' })).toHaveCount(0)
  // Reset is enabled in normal use; the shared fixture must not be cleared by a UI test.
  await expect(win.locator('.setdlg .storage-reset .btn')).toBeDisabled()

  // Clicking each category in the left column switches the right column to it; the Inmail category
  // itself spans several sections.
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

test('设置右栏滚动时,标题留在上面,滚动条从标题下面起、止于圆角之上,右上角的关闭按钮照样点得到', async ({ app, win }) => {
  await openSettings(app, win)
  await win.locator('.setdlg .srow[data-setcat="extensions"]').click()
  await win.locator('.setdlg [data-extension]').first().waitFor()

  const layout = await win.evaluate(() => {
    const dialog = document.querySelector('.setdlg')!
    const column = dialog.querySelector('.set-main')!
    const area = [column, ...column.querySelectorAll('*')].find((box) => getComputedStyle(box).overflowY === 'auto') as HTMLElement
    area.scrollTop = (area.scrollHeight - area.clientHeight) / 2
    // An offscreen window gets no frames to fire scroll events in, so the case sends its own.
    area.dispatchEvent(new Event('scroll'))
    const title = column.querySelector('.section-heading')!
    const close = dialog.querySelector('.modal-close')!
    const button = close.getBoundingClientRect()
    const scroller = area.getBoundingClientRect()
    const corner = dialog.getBoundingClientRect().bottom - parseFloat(getComputedStyle(dialog).borderBottomRightRadius)
    // Layout edges are fractional, and painting snaps them to whole pixels.
    const px = Math.round
    return {
      fade: area.dataset.fade,
      hitsClose: close.contains(document.elementFromPoint(button.left + button.width / 2, button.top + button.height / 2)),
      titleScrolls: area.contains(title),
      startsBelowTitleAndClose: px(scroller.top) >= px(title.getBoundingClientRect().bottom) && px(scroller.top) >= px(button.bottom),
      endsAboveCorner: px(scroller.bottom) <= px(corner),
    }
  })
  expect(layout).toEqual({
    fade: 'top bottom', hitsClose: true, titleScrolls: false, startsBelowTitleAndClose: true, endsAboveCorner: true,
  })

  await win.locator('.setdlg .modal-close').click()
  await expect(win.locator('.setdlg')).toHaveCount(0)
})

test('取消归档弹出的提示盖在设置模态之上', async ({ app, win }) => {
  await win.locator('.sidebar').waitFor()
  const target = (await core<Session[]>(win, 'chat.list', {})).find((s) => !s.archived)!
  await core(win, 'chat.setArchived', { id: target.id, archived: true })

  await openSettings(app, win)
  await win.locator('.setdlg .srow[data-setcat="archived"]').click()
  await win.locator(`.setdlg .wrow[data-chat="${target.id}"]`).hover()
  await win.locator(`.setdlg .wrow[data-chat="${target.id}"] .row-actions [aria-label="取消归档"]`).click()
  await win.locator('#notice.show').waitFor()

  const zIndex = await win.evaluate(() => ({
    notice: Number(getComputedStyle(document.querySelector('.notice-host')!).zIndex),
    setdlg: Number(getComputedStyle(document.querySelector('.setdlg')!).zIndex),
    scrim: Number(getComputedStyle(document.querySelector('.scrim')!).zIndex),
  }))
  expect(zIndex.notice).toBeGreaterThan(zIndex.setdlg)
  expect(zIndex.notice).toBeGreaterThan(zIndex.scrim)
})

test('设置模态:屏上其余部分隐掉,Tab 不跑到模态外,Esc 之后焦点回到打开之前那一处', async ({ app, win }) => {
  await win.locator('#sbBtn').focus()
  expect(await win.evaluate(() => document.activeElement?.id ?? '')).toBe('sbBtn')

  await openSettings(app, win)
  // The modal part: the scrim blocks the pointer, and the rest of the screen is hidden from screen readers.
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
  // Focus returns in a timeout after the modal unmounts; the element being gone does not mean it is back.
  await expect.poll(() => win.evaluate(() => document.activeElement?.id ?? '')).toBe('sbBtn')
})

/** Forgets the colour theme a case chose, which the shared profile would otherwise carry into later cases. */
const forgetColourTheme = (win: Page) => win.evaluate(() => {
  window.localStorage.removeItem('meridian.colour-theme')
  window.localStorage.removeItem('meridian.colour-theme-cache')
})

test('新建外观主题:保存写进配置目录的 themes/<id>.json 并套用;编辑时在 App 外改了文件,没改过就重读,改过就留着修改并标出', async ({ app, win, configHome }) => {
  try {
    await openSettings(app, win)
    await win.locator('.setdlg .appearance-add').click()
    await win.locator('.setdlg input[aria-label="名称"]').fill('E2E Theme')
    await win.locator('.setdlg [data-module="accent"]').click()
    const hex = win.locator('.setdlg input[aria-label="色值"]')
    await hex.fill('#2f6fbf')
    const save = win.locator('.setdlg .theme-module-card .btn.pri')
    await save.click()
    await expect(save).toHaveText('已保存')

    const file = join(configHome, 'themes', 'e2e-theme.json')
    const written = JSON.parse(readFileSync(file, 'utf8'))
    expect([written.schema, written.id, written.name, written.basedOn, written.light.accent])
      .toEqual(['meridian.theme.v1', 'e2e-theme', 'E2E Theme', 'default', '#2f6fbf'])
    const rootAccent = () => win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())
    await expect.poll(rootAccent).toBe('#2f6fbf')
    await expect(win.locator('.setdlg [data-module]')).toHaveCount(13)

    writeFileSync(file, JSON.stringify({ ...written, light: { ...written.light, accent: '#336655' } }))
    await expect(hex).toHaveValue('#336655', { timeout: 10_000 })
    await expect.poll(rootAccent, { timeout: 10_000 }).toBe('#336655')
    await expect(win.locator('.setdlg')).not.toContainText('文件已在 App 外修改')

    await hex.fill('#2f6fbf')
    writeFileSync(file, JSON.stringify({ ...written, light: { ...written.light, accent: '#112233' } }))
    await expect(win.locator('.setdlg')).toContainText('文件已在 App 外修改', { timeout: 10_000 })
    await expect(hex).toHaveValue('#2F6FBF')
  } finally {
    await forgetColourTheme(win)
  }
})

test('外观主题从新建、保存、套用,到重新加载后还在、在卡片的 … 菜单里重新编辑和删除', async ({ app, win, configHome }) => {
  try {
    await openSettings(app, win)
    await win.locator('.setdlg .appearance-add').click()
    await win.locator('.setdlg input[aria-label="名称"]').fill('晨雾')
    await win.locator('.setdlg [data-module="accent"]').click()
    await win.locator('.setdlg input[aria-label="色值"]').fill('#2f6fbf')
    const save = win.locator('.setdlg .theme-module-card .btn.pri')
    await save.click()
    await expect(save).toHaveText('已保存')
    const file = join(configHome, 'themes', 'theme.json')
    expect(JSON.parse(readFileSync(file, 'utf8')).name).toBe('晨雾')

    await win.locator('.setdlg button[aria-label="返回"]').click()
    await expect(win.locator('[role="alertdialog"]')).toHaveCount(0)
    const themes = win.getByRole('radiogroup', { name: '外观主题', exact: true })
    await expect(themes.locator('.appearance-choice')).toHaveText(['默认', '朱漆', '螺钿', '秋叶', '流霞', '晨雾'])
    await expect(themes.locator('[data-colour-theme="theme"]')).toHaveAttribute('aria-checked', 'true')

    await win.reload()
    const rootAccent = () => win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())
    await expect.poll(rootAccent).toBe('#2f6fbf')
    await expect(win.locator('html')).toHaveAttribute('data-colour-theme', 'theme')

    await openSettings(app, win)
    const card = themes.locator('[data-colour-theme="theme"]')
    const menu = async () => {
      await card.hover()
      await win.locator('.setdlg button[aria-label="管理「晨雾」"]').click()
    }
    await menu()
    await expect(win.locator('[role="menu"] [role="menuitem"]')).toHaveText(['编辑', '删除'])
    await win.locator('[role="menu"] [role="menuitem"]', { hasText: '编辑' }).click()
    await expect(win.locator('.setdlg input[aria-label="名称"]')).toHaveValue('晨雾')
    await win.locator('.setdlg [data-module="ground"]').click()
    await win.locator('.setdlg input[aria-label="色值"]').fill('#f6f8fb')
    await win.locator('.setdlg button[aria-label="返回"]').click()
    await expect(win.locator('[role="alertdialog"] .modal-title')).toHaveText('放弃未保存的修改？')
    await win.locator('[role="alertdialog"] .btn.pri.danger').click()
    await expect(themes.locator('.appearance-choice')).toHaveCount(6)
    expect(JSON.parse(readFileSync(file, 'utf8')).light.ground).not.toBe('#f6f8fb')

    await menu()
    await win.locator('[role="menu"] [role="menuitem"]', { hasText: '删除' }).click()
    await expect(win.locator('[role="alertdialog"] .modal-title')).toHaveText('删除外观主题「晨雾」？')
    await win.locator('[role="alertdialog"] .btn.pri.danger').click()
    await expect(themes.locator('.appearance-choice')).toHaveText(['默认', '朱漆', '螺钿', '秋叶', '流霞'])
    await expect(themes.locator('[data-colour-theme="default"]')).toHaveAttribute('aria-checked', 'true')
    await expect(win.locator('html')).not.toHaveAttribute('data-colour-theme', /./)
    expect(existsSync(file)).toBe(false)
    // The menu and its confirmation leave nothing behind that blocks the pointer.
    await themes.locator('[data-colour-theme="cinnabar"]').click()
    await expect(win.locator('html')).toHaveAttribute('data-colour-theme', 'cinnabar')
  } finally {
    await forgetColourTheme(win)
  }
})
