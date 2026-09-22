import { _electron as electron } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { prepareSelectedLibrary } from '../apps/desktop/src/core/workspace-layout.js'
import { expect, openSettings, test } from './app.js'

const APP_DIR = resolve(import.meta.dirname, '../apps/desktop')
const FIXTURE_VAULT = resolve(APP_DIR, 'src/core/fixtures/vault')

/** The first window of the application is not on the screen at the moment. */
const visible = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())

test('打包后的应用启动出一个窗口', async ({ win }) => {
  const mark = win.locator('.titlebar .appbtn .brandmark')
  await expect(mark).toHaveCount(1)
  // When the address is wrong and the resource is not included in the package, the element still has an 18×18 box, and only the naturalWidth will be 0.
  expect(await mark.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
})

test('自动化传 MERIDIAN_SHOW_WINDOW=0 时窗口不上屏', async ({ app, win }) => {
  await win.locator('.sidebar').waitFor()
  expect(await visible(app)).toBe(false)
})

test('不传 MERIDIAN_SHOW_WINDOW 时窗口上屏', async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(
    (e): e is [string, string] => e[1] !== undefined && !e[0].startsWith('MERIDIAN_')))
  // Point to fixture: Without this item, the application will open the real paper library according to user configuration.
  const app = await electron.launch({ args: [APP_DIR], env: { ...env, MERIDIAN_LIBRARY_ROOT: FIXTURE_VAULT } })
  try {
    const win = await app.firstWindow()
    await win.locator('.sidebar').waitFor()
    expect(await visible(app)).toBe(true)
  } finally {
    await app.close()
  }
})

/** Remove all variables starting with MERIDIAN_: the use case decides where the library comes from, and those set in the external shell do not count. */
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(
  (e): e is [string, string] => e[1] !== undefined && !e[0].startsWith('MERIDIAN_')))

test('指定的库里没有论文页目录时,内容区报出缺的目录,设置仍打得开', async () => {
  const bare = mkdtempSync(join(tmpdir(), 'meridian-e2e-bare-'))
  const app = await electron.launch({
    args: [APP_DIR], env: { ...cleanEnv(), MERIDIAN_VAULT_ROOT: bare, MERIDIAN_SHOW_WINDOW: '0' },
  })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('.bootfail .desk-head .t')).toHaveText('论文库打不开')
    await expect(win.locator('.bootfail .ipcerror')).toHaveText(`库里没有论文页目录:${join(bare, 'wiki', 'papers')}`)
    await win.locator('.bootfail .btn', { hasText: '打开设置' }).click()
    // The button opens settings on its default category (appearance), not a contextual jump to storage.
    await win.locator('.setdlg .srow[data-setcat="storage"]').click()
    // The root path now shows in the shared read-only directory field, not a separate <code> element.
    await expect(win.locator('.setdlg .storage-root .directory-field input')).toHaveValue(/meridian-e2e-bare-/)
  } finally {
    await app.close()
    rmSync(bare, { recursive: true, force: true })
  }
})

test('指定的库没有 Wiki 结构文件时,内容区报出缺的那个文件', async () => {
  const legacy = mkdtempSync(join(tmpdir(), 'meridian-e2e-noschema-'))
  mkdirSync(join(legacy, 'wiki', 'papers'), { recursive: true })
  const app = await electron.launch({
    args: [APP_DIR], env: { ...cleanEnv(), MERIDIAN_VAULT_ROOT: legacy, MERIDIAN_SHOW_WINDOW: '0' },
  })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('.bootfail .ipcerror')).toHaveText(`库里没有 Wiki 结构文件:${join(legacy, 'wiki', 'schema.yaml')}`)
  } finally {
    await app.close()
    rmSync(legacy, { recursive: true, force: true })
  }
})

test('用户配置登记的库打不开时报错,不悄悄换成应用自己的库', async () => {
  const home = mkdtempSync(join(tmpdir(), 'meridian-e2e-home-'))
  const missing = join(home, 'missing-library')
  writeFileSync(join(home, 'paper-wiki-workspaces.json'), JSON.stringify({ active_library_root: missing }), 'utf8')
  const app = await electron.launch({
    args: [APP_DIR], env: { ...cleanEnv(), MERIDIAN_CONFIG_HOME: home, MERIDIAN_SHOW_WINDOW: '0' },
  })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('.bootfail .ipcerror')).toHaveText(`库里没有论文页目录:${join(missing, 'wiki', 'papers')}`)
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

test('设置可重置、切换和删除论文库备份', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'meridian-e2e-reset-'))
  const root = join(parent, 'library')
  prepareSelectedLibrary(root, new Date('2026-09-15T12:00:00Z'))
  writeFileSync(join(root, 'sources', 'papers', 'keep.pdf'), 'source bytes', 'utf8')
  writeFileSync(join(root, 'wiki', 'papers', 'keep.md'), KEEP_PAGE, 'utf8')
  const app = await electron.launch({
    args: [APP_DIR],
    env: {
      ...cleanEnv(), MERIDIAN_VAULT_ROOT: root, MERIDIAN_CANNED_NET: '1', MERIDIAN_SHOW_WINDOW: '0',
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
    await expect(win.locator('.dlg-t')).toContainText('旧库会自动备份')
    await win.locator('.dlg-a .btn', { hasText: '取消' }).click()
    await expect(win.locator('.dlg-t')).toHaveCount(0)

    await reset.click()
    const reloaded = win.waitForEvent('domcontentloaded')
    await win.locator('.dlg-a .btn', { hasText: '重置并重启' }).click()
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
    await expect(win.locator('.dlg-d')).toContainText('永久删除')
    await win.locator('.dlg-a .btn', { hasText: '删除' }).click()
    await expect(win.locator('.storage-backup-row')).toHaveCount(0)
    expect(readdirSync(parent).filter((name) => name.startsWith('library-backup-'))).toEqual([])
  } finally {
    await app.close()
    rmSync(parent, { recursive: true, force: true })
  }
})
