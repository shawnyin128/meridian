import { _electron as electron, expect, test } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import type { MeridianWindow } from './app.js'

const harnessPython = process.env['MERIDIAN_HARNESS_TEST_PYTHON']
const realHarnessTest = harnessPython === undefined ? test.skip : test
const APP_DIR = resolve(import.meta.dirname, '../apps/desktop')
const FIXTURE_VAULT = resolve(APP_DIR, 'src/core/fixtures/vault')
const HARNESS_PATH = [
  resolve(import.meta.dirname, '../apps/harness/tests'),
  resolve(import.meta.dirname, '../apps/harness/src'),
].join(delimiter)

realHarnessTest('真实 Electron/Core/Python Harness 零费用链路停在审核后再写入', async () => {
  if (harnessPython === undefined) throw new Error('Harness test Python is not configured')
  const root = mkdtempSync(join(tmpdir(), 'meridian-harness-e2e-'))
  const vault = join(root, 'vault')
  const config = join(root, 'config')
  cpSync(FIXTURE_VAULT, vault, { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(join(config, 'harness-model.json'), JSON.stringify({
    schemaVersion: 'meridian.harness-model.v2',
    provider: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'zero-cost-fixture',
    authentication: 'none',
  }), 'utf8')

  const app = await electron.launch({
    args: [APP_DIR],
    env: {
      ...process.env,
      MERIDIAN_VAULT_ROOT: vault,
      MERIDIAN_VAULT_SOURCE: 'environment',
      MERIDIAN_CONFIG_HOME: config,
      MERIDIAN_CANNED_NET: '1',
      MERIDIAN_SHOW_WINDOW: '0',
      MERIDIAN_HARNESS_COMMAND: harnessPython,
      MERIDIAN_HARNESS_MODULE: 'fixture_server',
      MERIDIAN_HARNESS_PYTHONPATH: HARNESS_PATH,
    },
  })
  try {
    const win = await app.firstWindow()
    const shown = (selector: string) => win.locator(`.screenslot:not([hidden]) ${selector}`)
    const call = <T>(method: string, params: unknown) => win.evaluate(
      ([name, payload]) => (window as unknown as MeridianWindow).meridian
        .call(name as string, payload) as Promise<T>,
      [method, params] as const,
    )

    await win.locator('[data-desk="papers"]').click()
    await win.locator('#libq').fill('STAR: SPECULATIVE DECODING')
    await expect(win.locator('.ptable tbody tr')).toHaveCount(1)
    await win.locator('.ptable tbody tr').click()
    await shown('.pdetail [title="开始阅读"]').click()
    await shown('.reader-rail [title="内化到 Wiki"]').click()

    const before = await call<{ body: string }>('wiki.paper', {
      id: 'papers/13979-STAR-Speculative-Decodin',
    })
    await shown('.wiki-ingest .harness-trigger').click()
    const dialog = win.locator('[role="alertdialog"]')
    await expect(dialog).toContainText('点击开始后才会调用模型')
    await dialog.getByRole('button', { name: /开始(生成|更新)/ }).click()

    const review = shown('.wiki-ingest-review')
    await expect(review).toContainText('审核 Wiki 提案')
    await expect(review.locator('textarea')).toHaveValue(/zero-cost fixture crossed/)
    expect((await call<{ body: string }>('wiki.paper', {
      id: 'papers/13979-STAR-Speculative-Decodin',
    })).body).toBe(before.body)

    await review.getByRole('button', { name: '确认写入 Wiki' }).click()
    await expect(shown('.wiki-ingest')).toContainText('已写入 Wiki')
    expect((await call<{ body: string }>('wiki.paper', {
      id: 'papers/13979-STAR-Speculative-Decodin',
    })).body).toContain('zero-cost fixture crossed')
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})
