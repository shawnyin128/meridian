import { _electron as electron, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { LAUNCH_SWITCHES, test as base, type MeridianWindow } from './app.js'

const APP_DIR = resolve(import.meta.dirname, '../apps/desktop')
const EXAMPLE = resolve(import.meta.dirname, '../apps/desktop/src/core/fixtures/wiki-example-vault')

/**
 * The `app` fixture of app.ts on a vault with the aggregation layout: each case copies the example
 * vault into `wiki/` of a temporary directory, and `MERIDIAN_VAULT_ROOT` makes Core open that copy
 * with the vault store instead of the fixture store. The copy is deleted after the case, and the
 * case's config home and user-data folder are the temporary ones from app.ts.
 */
const test = base.extend<{ app: ElectronApplication }>({
  app: async ({ showWindow, configHome, profile }, use) => {
    const vault = mkdtempSync(join(tmpdir(), 'meridian-e2e-vault-'))
    for (const name of ['schema.yaml', 'papers', 'topics', 'methods']) {
      cpSync(join(EXAMPLE, name), join(vault, 'wiki', name), { recursive: true })
    }
    const app = await electron.launch({
      // The specs assert Chinese copy, so the app must not follow the host's language.
      args: [APP_DIR, '--lang=zh-CN', `--user-data-dir=${profile}`, ...LAUNCH_SWITCHES],
      env: {
        ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)),
        MERIDIAN_VAULT_ROOT: vault,
        MERIDIAN_LIBRARY_ROOT: vault,
        MERIDIAN_CONFIG_HOME: configHome,
        MERIDIAN_SHOW_WINDOW: showWindow ? 'isolated' : '0',
      },
    })
    await use(app)
    await app.close()
    rmSync(vault, { recursive: true, force: true })
  },
})

const shown = (win: Page) => win.locator('.screenslot:not([hidden])')
const call = <T>(win: Page, method: string, params: unknown) => win.evaluate(
  ([m, p]) => (window as unknown as MeridianWindow).meridian.call(m as string, p) as Promise<T>,
  [method, params] as const,
)

test('真实库的 store 读新布局:首页按两种聚合计数;一条提案写进库,页上出现,撤销后消失', async ({ win }) => {
  // Before writing, after writing and after undoing, the case walks the aggregation tree with more than
  // a dozen clicks; see `showWindow` in app.ts.
  test.slow()
  await win.locator('[data-desk="wiki"]').click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText('Wiki · 13')
  await expect(win.locator('[data-desk="papers"] .nav-row-count')).toHaveText('10')

  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await shown(win).locator('[data-wk="topics/ptq"]').click()
  await shown(win).locator('[data-wk="topics/ptq-weight-only"]').click()
  await expect(shown(win).locator('table.cmp tbody tr')).toHaveCount(5)

  await call(win, 'wiki.apply', { proposal: {
    source: 'chat', title: '给 Weight-only PTQ 记一条',
    ops: [{ op: 'appendEntry', page: 'topics/ptq-weight-only', section: '未解决', date: '2026-09-10', text: '端到端写进来的一条' }],
  } })
  // After writing, re-fetch on the screen: go back to the homepage and come in again
  await win.locator('[data-desk="papers"]').click()
  await win.locator('[data-desk="wiki"]').click()
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await shown(win).locator('[data-wk="topics/ptq"]').click()
  await shown(win).locator('[data-wk="topics/ptq-weight-only"]').click()
  await expect(shown(win).locator('.wkmain .md li', { hasText: '端到端写进来的一条' })).toHaveCount(1)

  const changes = await call<{ id: string; title: string; undoable: boolean }[]>(win, 'changelog.list', {})
  expect(changes[0]).toMatchObject({ title: 'Wiki · 给 Weight-only PTQ 记一条', undoable: true })
  await call(win, 'changelog.undo', { id: changes[0]!.id })
  await win.locator('[data-desk="papers"]').click()
  await win.locator('[data-desk="wiki"]').click()
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await shown(win).locator('[data-wk="topics/ptq"]').click()
  await shown(win).locator('[data-wk="topics/ptq-weight-only"]').click()
  await expect(shown(win).locator('.wkmain .md li', { hasText: '端到端写进来的一条' })).toHaveCount(0)
})

test('真实库的 store:页上改正文落到文件,撤销逐字节还原', async ({ win }) => {
  test.slow()
  await win.locator('[data-desk="wiki"]').click()
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await shown(win).locator('.wkmain .section-heading-actions > .btn:not(.add-action)', { hasText: '编辑' }).click()
  const box = shown(win).locator('.md.src')
  await box.press('Control+End')
  await box.pressSequentially('\n\n## 真实库里加的一节\n\n一行。')
  await shown(win).locator('.wkmain .section-heading-actions > .btn:not(.add-action)', { hasText: '保存' }).click()
  await expect(shown(win).locator('.wkmain .md h2', { hasText: '真实库里加的一节' })).toHaveCount(1)
  const agg = await call<{ body: string; updated: string }>(win, 'wiki.aggregation', { id: 'topics/quantization' })
  expect(agg.body).toContain('## 真实库里加的一节')
  expect(agg.updated).not.toBe('2026-09-09')

  const changes = await call<{ id: string; title: string }[]>(win, 'changelog.list', {})
  expect(changes[0]).toMatchObject({ title: 'Wiki · 「Quantization」· 改了正文' })
  await call(win, 'changelog.undo', { id: changes[0]!.id })
  await win.locator('[data-desk="papers"]').click()
  await win.locator('[data-desk="wiki"]').click()
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await expect(shown(win).locator('.wkmain .md h2', { hasText: '真实库里加的一节' })).toHaveCount(0)
  expect((await call<{ updated: string }>(win, 'wiki.aggregation', { id: 'topics/quantization' })).updated).toBe('2026-09-09')
})
