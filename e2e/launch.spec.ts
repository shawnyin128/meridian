import { _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { prepareSelectedLibrary } from '../apps/desktop/src/core/workspace-layout.js'
import { expect, LAUNCH_SWITCHES, openSettings, test } from './app.js'

const APP_DIR = resolve(import.meta.dirname, '../apps/desktop')
const FIXTURE_VAULT = resolve(APP_DIR, 'src/core/fixtures/vault')
/** The Electron executable Playwright launches by default. */
const ELECTRON = createRequire(import.meta.url)('electron') as string

/**
 * Launch arguments for a case that reads the UI's Chinese copy, on user-data folder `profile`: the app
 * must not follow the host's language.
 */
const zhArgs = (profile: string) => [APP_DIR, '--lang=zh-CN', `--user-data-dir=${profile}`, ...LAUNCH_SWITCHES]

/** Whether the app's first window is shown right now. */
const visible = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())

/** Whether the App has an icon in the macOS Dock; other systems have no Dock. */
const inDock = (app: ElectronApplication) =>
  app.evaluate(({ app: electronApp }) => electronApp.dock?.isVisible() ?? false)

/**
 * What a screenshot stores for a swatch painted rgb(53, 104, 255) at the page's top left, read without
 * colour management: the page's own sRGB value, unless Chromium painted in a display's colour profile.
 */
async function storedSwatch(win: Page): Promise<number[]> {
  await win.evaluate(() => {
    const swatch = document.createElement('div')
    swatch.style.cssText = 'position:fixed;left:0;top:0;width:8px;height:8px;z-index:2147483647;background:rgb(53, 104, 255)'
    document.body.append(swatch)
  })
  const png = (await win.screenshot({ clip: { x: 2, y: 2, width: 1, height: 1 } })).toString('base64')
  return win.evaluate(async (b64) => {
    const bytes = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' })
    const bitmap = await createImageBitmap(bytes, { colorSpaceConversion: 'none' })
    const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]
  }, png)
}

test('自动化启动用这一例自己的临时 user-data 目录,不是应用自己的那份', async ({ app }) => {
  const paths = await app.evaluate(({ app: electronApp }) => ({
    userData: electronApp.getPath('userData'), appData: electronApp.getPath('appData'), name: electronApp.getName(),
  }))
  expect(paths.userData).not.toBe(join(paths.appData, paths.name))
  expect(realpathSync(paths.userData).startsWith(realpathSync(tmpdir()))).toBe(true)
})

for (const mode of ['0', 'isolated']) {
  test(`MERIDIAN_SHOW_WINDOW=${mode} 却没给自己的 user-data 目录时,应用说出原因就退出,默认目录里什么也没写`, async ({ configHome }) => {
    const home = mkdtempSync(join(tmpdir(), 'meridian-e2e-default-profile-'))
    // The App's code under a package of its own name: its default profile lies apart from the App's on
    // every system, and on macOS CFFIXED_USER_HOME moves the Application Support folder holding it here.
    const wrapper = join(home, 'package')
    mkdirSync(wrapper)
    writeFileSync(join(wrapper, 'package.json'), JSON.stringify({
      name: `meridian-e2e-default-profile-${process.pid}`, main: relative(wrapper, join(APP_DIR, 'out', 'main', 'index.js')),
    }))
    const run = spawnSync(ELECTRON, [wrapper, '--lang=zh-CN', ...LAUNCH_SWITCHES], {
      encoding: 'utf8', timeout: 20_000,
      env: {
        ...cleanEnv(), MERIDIAN_SHOW_WINDOW: mode, MERIDIAN_LIBRARY_ROOT: FIXTURE_VAULT, MERIDIAN_CONFIG_HOME: configHome,
        CFFIXED_USER_HOME: home,
      },
    })
    const refused = run.stderr.match(/instead of the App's own profile at (.+)$/m)?.[1]
    try {
      expect(run.status).toBe(1)
      expect(refused).toBeDefined()
      expect(readdirSync(refused!)).toEqual([])
    } finally {
      rmSync(home, { recursive: true, force: true })
      if (refused?.includes(`meridian-e2e-default-profile-${process.pid}`)) rmSync(refused, { recursive: true, force: true })
    }
  })
}

test('打包后的应用启动出一个窗口', async ({ win }) => {
  const mark = win.locator('.titlebar .appbtn .brandmark')
  await expect(mark).toHaveCount(1)
  // With a wrong URL or an asset missing from the package, the element still has its 18×18 box; only naturalWidth is 0.
  expect(await mark.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
})

test('自动化传 MERIDIAN_SHOW_WINDOW=0 时窗口不上屏,Dock 里也没有应用图标,截图存的是页面自己的 sRGB 色值', async ({ app, win }) => {
  await win.locator('.sidebar').waitFor()
  expect(await visible(app)).toBe(false)
  expect(await inDock(app)).toBe(false)
  expect(await storedSwatch(win)).toEqual([53, 104, 255])
})

test('不传 MERIDIAN_SHOW_WINDOW 时窗口上屏', async ({ configHome, profile }) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(
    (e): e is [string, string] => e[1] !== undefined && !e[0].startsWith('MERIDIAN_')))
  // Point at the fixture vault: without it, the app would open the user's real vault from their configuration.
  const app = await electron.launch({
    args: [APP_DIR, `--user-data-dir=${profile}`], env: { ...env, MERIDIAN_LIBRARY_ROOT: FIXTURE_VAULT, MERIDIAN_CONFIG_HOME: configHome },
  })
  try {
    const win = await app.firstWindow()
    await win.locator('.sidebar').waitFor()
    // The window shows once the renderer has painted its first frame, which may land just after this.
    await expect.poll(() => visible(app)).toBe(true)
  } finally {
    await app.close()
  }
})

test.describe('用例要窗口出画面时', () => {
  test.use({ showWindow: true })

  test('窗口在所有显示器之外照常出画面:不把应用切到前台,拿不到系统焦点,Dock 里也没有应用图标,截图存的是页面自己的 sRGB 色值', async ({ app }) => {
    // macOS reports activation only as an event. The window shows after the renderer's first paint,
    // long after this call returns, so the listener is in place before any activation could happen.
    await app.evaluate(({ app: electronApp }) => {
      const seen = globalThis as { activated?: boolean }
      seen.activated = false
      electronApp.on('did-become-active', () => { seen.activated = true })
    })
    const win = await app.firstWindow()
    await win.locator('.sidebar').waitFor()
    await expect.poll(() => visible(app)).toBe(true)
    const windows = () => app.evaluate(({ app: electronApp, BrowserWindow, screen }) => {
      const target = BrowserWindow.getAllWindows()[0]!
      const at = target.getBounds()
      const overlap = (from: number, size: number, start: number, length: number) =>
        Math.max(0, Math.min(from + size, start + length) - Math.max(from, start))
      return {
        activated: (globalThis as { activated?: boolean }).activated,
        inDock: electronApp.dock?.isVisible() ?? false,
        focusable: target.isFocusable(),
        focused: BrowserWindow.getFocusedWindow() !== null,
        onDisplays: screen.getAllDisplays().reduce((area, { bounds }) =>
          area + overlap(at.x, at.width, bounds.x, bounds.width) * overlap(at.y, at.height, bounds.y, bounds.height), 0),
        content: target.getContentSize(),
      }
    })
    expect(await windows()).toMatchObject({ activated: false, inDock: false, focusable: false, focused: false, onDisplays: 0 })

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1600, 1300))
    expect(await windows()).toMatchObject({ onDisplays: 0, content: [1600, 1300] })
    // The page still paints there: a screenshot comes back at the new size, in device pixels. A PNG
    // stores its width and height at bytes 16 and 20.
    const shot = await win.screenshot()
    const scale = await win.evaluate(() => devicePixelRatio)
    expect([shot.readUInt32BE(16), shot.readUInt32BE(20)]).toEqual([1600 * scale, 1300 * scale])
    expect(await storedSwatch(win)).toEqual([53, 104, 255])
  })
})

/** The environment minus every MERIDIAN_ variable: each test case picks its own vault, not the outer shell. */
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(
  (e): e is [string, string] => e[1] !== undefined && !e[0].startsWith('MERIDIAN_')))

test('指定的库里没有论文页目录时,内容区报出原因的标签而不带路径,设置仍打得开', async ({ configHome, profile }) => {
  const bare = mkdtempSync(join(tmpdir(), 'meridian-e2e-bare-'))
  const app = await electron.launch({
    args: zhArgs(profile),
    env: { ...cleanEnv(), MERIDIAN_VAULT_ROOT: bare, MERIDIAN_CONFIG_HOME: configHome, MERIDIAN_SHOW_WINDOW: '0' },
  })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('.bootfail .desk-head .t')).toHaveText('论文库打不开')
    await expect(win.locator('.bootfail .ipcerror')).toHaveText('不是 Meridian 论文库')
    await win.locator('.bootfail .btn', { hasText: '换论文库' }).click()
    // The button opens settings on the storage category, where another library is chosen.
    await expect(win.locator('.setdlg .srow[data-setcat="storage"]')).toHaveClass(/\bon\b/)
    // The root path now shows in the shared read-only directory field, not a separate <code> element.
    await expect(win.locator('.setdlg .storage-root .directory-field input')).toHaveValue(/meridian-e2e-bare-/)
  } finally {
    await app.close()
    rmSync(bare, { recursive: true, force: true })
  }
})

test('指定的库没有 Wiki 结构文件时,内容区报出原因的标签而不带路径', async ({ configHome, profile }) => {
  const legacy = mkdtempSync(join(tmpdir(), 'meridian-e2e-noschema-'))
  mkdirSync(join(legacy, 'wiki', 'papers'), { recursive: true })
  const app = await electron.launch({
    args: zhArgs(profile),
    env: { ...cleanEnv(), MERIDIAN_VAULT_ROOT: legacy, MERIDIAN_CONFIG_HOME: configHome, MERIDIAN_SHOW_WINDOW: '0' },
  })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('.bootfail .ipcerror')).toHaveText('不是 Meridian 论文库')
  } finally {
    await app.close()
    rmSync(legacy, { recursive: true, force: true })
  }
})

test('用户配置登记的库打不开时报错,不悄悄换成应用自己的库', async ({ profile }) => {
  const home = mkdtempSync(join(tmpdir(), 'meridian-e2e-home-'))
  const missing = join(home, 'missing-library')
  writeFileSync(join(home, 'paper-wiki-workspaces.json'), JSON.stringify({ active_library_root: missing }), 'utf8')
  const app = await electron.launch({
    args: zhArgs(profile), env: { ...cleanEnv(), MERIDIAN_CONFIG_HOME: home, MERIDIAN_SHOW_WINDOW: '0' },
  })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('.bootfail .ipcerror')).toHaveText('不是 Meridian 论文库')
  } finally {
    await app.close()
    rmSync(home, { recursive: true, force: true })
  }
})

// A minimal but schema-valid wiki page: the vault's background scan reads every page under
// wiki/papers/ and throws on malformed frontmatter, so the backed-up file needs real frontmatter,
// not just arbitrary bytes, or the reset call never gets a chance to run.
const KEEP_PAGE = '---\ntype: "paper"\ntitle: "Keep"\nstatus: "draft"\ncreated: "2026-09-15"\n'
  + 'updated: "2026-09-15"\nsource_id: "keep"\nmemberships: []\n---\n# Keep\n'

test('设置可重置、切换和删除论文库备份', async ({ configHome, profile }) => {
  const parent = mkdtempSync(join(tmpdir(), 'meridian-e2e-reset-'))
  const root = join(parent, 'library')
  prepareSelectedLibrary(root, new Date('2026-09-15T12:00:00Z'))
  writeFileSync(join(root, 'sources', 'papers', 'keep.pdf'), 'source bytes', 'utf8')
  writeFileSync(join(root, 'wiki', 'papers', 'keep.md'), KEEP_PAGE, 'utf8')
  const app = await electron.launch({
    args: zhArgs(profile),
    env: {
      ...cleanEnv(), MERIDIAN_VAULT_ROOT: root, MERIDIAN_CONFIG_HOME: configHome, MERIDIAN_CANNED_NET: '1',
      MERIDIAN_SHOW_WINDOW: '0',
    },
  })
  try {
    const win = await app.firstWindow()
    await win.locator('.sidebar').waitFor()
    await openSettings(app, win)
    // Settings opens on its default category (appearance); the storage-reset control lives under storage.
    await win.locator('.setdlg .srow[data-setcat="storage"]').click()
    const reset = win.locator('.storage-reset .btn', { hasText: '重置库' })
    await expect(reset).toBeEnabled()
    await reset.click()
    await expect(win.locator('.modal-detail')).toContainText('旧库会自动备份')
    await win.locator('.modal-actions .btn', { hasText: '取消' }).click()
    await expect(win.locator('[role="alertdialog"]')).toHaveCount(0)
    await expect(win.locator('.setdlg')).toBeVisible()

    await reset.click()
    const reloaded = win.waitForEvent('domcontentloaded')
    await win.locator('.modal-actions .btn', { hasText: '重置并重启' }).click()
    await reloaded
    await win.locator('.sidebar').waitFor()
    await expect(win.locator('.bootfail')).toHaveCount(0)

    const backup = readdirSync(parent).find((name) => name.startsWith('library-backup-'))
    expect(backup).toBeDefined()
    const backupRoot = join(parent, backup!)
    expect(readFileSync(join(backupRoot, 'sources', 'papers', 'keep.pdf'), 'utf8'))
      .toBe('source bytes')
    expect(readFileSync(join(backupRoot, 'wiki', 'papers', 'keep.md'), 'utf8'))
      .toBe(KEEP_PAGE)
    expect(existsSync(join(root, 'sources', 'papers', 'keep.pdf'))).toBe(false)
    expect(existsSync(join(root, 'wiki', 'papers', 'keep.md'))).toBe(false)
    expect(existsSync(join(root, 'wiki', 'schema.yaml'))).toBe(true)

    await openSettings(app, win)
    await win.locator('.setdlg .srow[data-setcat="storage"]').click()
    await expect(win.locator('.storage-backup-row')).toHaveCount(1)
    const switched = win.waitForEvent('domcontentloaded')
    await win.locator('.storage-backup-actions .btn', { hasText: '切换' }).click()
    await switched
    await win.locator('.sidebar').waitFor()
    expect(readFileSync(join(root, 'sources', 'papers', 'keep.pdf'), 'utf8')).toBe('source bytes')
    expect(readFileSync(join(root, 'wiki', 'papers', 'keep.md'), 'utf8')).toBe(KEEP_PAGE)

    await openSettings(app, win)
    await win.locator('.setdlg .srow[data-setcat="storage"]').click()
    await expect(win.locator('.storage-backup-row')).toHaveCount(1)
    await win.locator('.storage-backup-actions .btn', { hasText: '删除' }).click()
    await expect(win.locator('.modal-detail')).toContainText('永久删除')
    await win.locator('.modal-actions .btn', { hasText: '删除' }).click()
    await expect(win.locator('.storage-backup-row')).toHaveCount(0)
    expect(readdirSync(parent).filter((name) => name.startsWith('library-backup-'))).toEqual([])
  } finally {
    await app.close()
    rmSync(parent, { recursive: true, force: true })
  }
})
