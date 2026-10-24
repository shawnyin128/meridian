import { _electron as electron, expect, test } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

const PAPER = '13979-STAR-Speculative-Decodin'

realHarnessTest('真实 Electron/Core/Python Harness 零费用链路停在审核后再写入，撤销写入后回到审核', async () => {
  if (harnessPython === undefined) throw new Error('Harness test Python is not configured')
  const root = mkdtempSync(join(tmpdir(), 'meridian-harness-e2e-'))
  const vault = join(root, 'vault')
  const config = join(root, 'config')
  cpSync(FIXTURE_VAULT, vault, { recursive: true })
  // The fixture page has no page count, and Core refuses a draft citing pages of a paper with none;
  // an imported paper gets its count from its PDF, which has two pages here.
  const page = join(vault, 'wiki', 'papers', `${PAPER}.md`)
  writeFileSync(page, readFileSync(page, 'utf8').replace(/^source_id: .*$/m, '$&\npage_count: 2'), 'utf8')
  mkdirSync(config, { recursive: true })
  writeFileSync(join(config, 'harness-model.json'), JSON.stringify({
    schemaVersion: 'meridian.harness-model.v2',
    provider: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'zero-cost-fixture',
    authentication: 'none',
  }), 'utf8')

  const app = await electron.launch({
    // The case asserts Chinese copy, so the app must not follow the host's language.
    args: [APP_DIR, '--lang=zh-CN'],
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
    await shown('.pdetail [aria-label="开始阅读"]').click()
    await shown('.reader-rail [aria-label="内化到 Wiki"]').click()

    const body = async () => (await call<{ body: string }>('wiki.paper', { id: `papers/${PAPER}` })).body
    const before = await body()
    await shown('.wiki-ingest .harness-trigger').click()
    const dialog = win.locator('[role="alertdialog"]')
    // The confirmation states the cost before any run: none has started, so no proposal is waiting.
    await expect(dialog.locator('.modal-actions .tag')).toHaveText('免费')
    expect(await call('harness.pendingPaperWiki', { paperId: PAPER })).toBeNull()
    await dialog.getByRole('button', { name: /开始(生成|更新)/ }).click()

    const review = shown('.wiki-ingest-review')
    await expect(review).toContainText('审核 Wiki 提案')
    await expect(review).toContainText('zero-cost fixture crossed')
    expect(await body()).toBe(before)

    await review.getByRole('button', { name: '确认写入 Wiki' }).click()
    await expect(shown('.wiki-ingest')).toContainText('已写入 Wiki')
    expect(await body()).toContain('zero-cost fixture crossed')

    // Undoing the write from its notice puts the page back and the proposal back under review.
    await win.locator('#notice').getByRole('button', { name: '撤销' }).click()
    await expect.poll(body).toBe(before)
    await expect(review.getByRole('button', { name: '确认写入 Wiki' })).toBeVisible()
    await expect(shown('.wiki-ingest')).not.toContainText('已写入 Wiki')
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})
