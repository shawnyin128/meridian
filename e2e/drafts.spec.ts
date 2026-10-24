import type { Page } from '@playwright/test'
import { expect, gotoPapers, gotoProject, relaunch, test, type MeridianWindow } from './app.js'

/** Visited screens stay mounted, so selectors are scoped to the screen shown. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

/** The fixture paper with a source PDF, opened in the reader from the paper table. */
async function openReader(win: Page): Promise<void> {
  await gotoPapers(win)
  await win.locator('#libq').fill('STAR: SPECULATIVE DECODING')
  await expect(win.locator('.ptable tbody tr')).toHaveCount(1)
  await win.locator('.ptable tbody tr').click()
  await shown(win, '.pdetail [aria-label="开始阅读"]').click()
  await shown(win, '[aria-label="阅读笔记"]').click()
}

test('关掉 App 再打开,没存的阅读笔记和论文对话里没发出的问题原样回来,仍没存;存下之后不再留着', async ({ app, win, configHome, profile }) => {
  await openReader(win)
  await shown(win, 'textarea[aria-label="新笔记"]').fill('没存的笔记')
  await win.locator('.paper-chat [contenteditable="true"]').fill('没发出的问题')

  const reopened = await relaunch(app, configHome, profile)
  try {
    await openReader(reopened.win)
    const note = shown(reopened.win, 'textarea[aria-label="新笔记"]')
    await expect(note).toHaveValue('没存的笔记')
    await expect(reopened.win.locator('.paper-chat [contenteditable="true"]')).toHaveText('没发出的问题')
    const notes = shown(reopened.win, '.reading-notes .reading-card')
    const before = await notes.count()

    await shown(reopened.win, '.note-compose .btn').click()
    await expect(notes).toHaveCount(before + 1)
    await expect(note).toHaveValue('')
    const kept = await reopened.win.evaluate(() => Object.keys(window.localStorage)
      .filter((key) => key.startsWith('meridian.drafts:'))
      .map((key) => window.localStorage.getItem(key)!).join(''))
    expect(kept).not.toContain('没存的笔记')
    expect(kept).toContain('没发出的问题')
  } finally {
    await reopened.app.close()
  }
})

/** The project memo of the fixture's draft project, opened on the project page. */
const memoOf = (win: Page) => win.locator('.screenslot:not([hidden]) .wkmain .memo')
/** The heading button `label` of section `section` in the project page's main column. */
const sectionButton = (win: Page, section: string, label: string) => win.locator('.screenslot:not([hidden]) .wkmain')
  .locator('.section-heading', { hasText: section }).locator('button', { hasText: label })

/** Opens the Wiki page `id` from the Wiki home. */
async function openWikiPage(win: Page, id: string): Promise<void> {
  await win.locator('[data-desk="wiki"]').click()
  await shown(win, `[data-wk="${id}"]`).click()
}
const wikiButton = (win: Page, label: string) => shown(win, '.wkmain .section-heading-actions > .btn:not(.add-action)').filter({ hasText: label })

test('关掉 App 再打开,项目随笔和 Wiki 正文没存的改动回到原处,还开在编辑里;取消或存下之后不再留着', async ({ app, win, configHome, profile }) => {
  await gotoProject(win)
  await sectionButton(win, '项目随笔', '编辑').click()
  await win.keyboard.press('ControlOrMeta+End')
  await win.keyboard.type(' 没存的随笔')
  await openWikiPage(win, 'topics/quantization')
  await wikiButton(win, '编辑').click()
  await shown(win, '.md.src').press('ControlOrMeta+End')
  await shown(win, '.md.src').pressSequentially('没存的正文')

  const reopened = await relaunch(app, configHome, profile)
  try {
    const again = reopened.win
    await gotoProject(again)
    await expect(memoOf(again).locator('.cm-content')).toContainText('没存的随笔')
    await openWikiPage(again, 'topics/quantization')
    await expect(shown(again, '.md.src')).toContainText('没存的正文')
    const before = await again.evaluate(() => (window as unknown as MeridianWindow).meridian.call('wiki.aggregation', { id: 'topics/quantization' }))
    expect((before as { body: string }).body).not.toContain('没存的正文')

    await wikiButton(again, '保存').click()
    await expect(shown(again, '.md.src')).toHaveCount(0)
    await gotoProject(again)
    await sectionButton(again, '项目随笔', '取消').click()
    await expect(memoOf(again).locator('.cm-editor')).toHaveCount(0)
    const kept = await again.evaluate(() => Object.keys(window.localStorage)
      .filter((key) => key.startsWith('meridian.drafts:'))
      .map((key) => window.localStorage.getItem(key)!).join(''))
    expect(kept).not.toContain('没存的随笔')
    expect(kept).not.toContain('没存的正文')
  } finally {
    await reopened.app.close()
  }
})

test('关掉 App 再打开,打了一半的新项目名或新任务那一行回到原处,仍没建;取消之后不再留着', async ({ app, win, configHome, profile }) => {
  // Leaving an inline draft saves it, so each one is left open by quitting.
  await win.locator('[data-desk="resproj"]').click()
  await shown(win, '#projNew').click()
  await shown(win, '.projpanel .inedit').fill('打了一半的项目名')

  const first = await relaunch(app, configHome, profile)
  let second: Awaited<ReturnType<typeof relaunch>> | null = null
  try {
    await first.win.locator('[data-desk="resproj"]').click()
    await expect(shown(first.win, '.projpanel .inedit')).toHaveValue('打了一半的项目名')
    const projects = await first.win.evaluate(() => (window as unknown as MeridianWindow).meridian.call('project.list', {}))
    expect(JSON.stringify(projects)).not.toContain('打了一半的项目名')
    await shown(first.win, '.projpanel .inedit').press('Escape')
    await expect(shown(first.win, '.projpanel .inedit')).toHaveCount(0)
    await gotoProject(first.win)
    const plan = shown(first.win, '.project-plan')
    await plan.locator('[aria-label="添加任务"]').first().click()
    await plan.locator('.task-create-row .tag').click()
    await plan.locator('.task-create-row .min').fill('打了一半的任务')

    second = await relaunch(first.app, configHome, profile)
    await gotoProject(second.win)
    const row = shown(second.win, '.project-plan .task-create-row')
    await expect(row.locator('.min')).toHaveValue('打了一半的任务')
    await expect(row.locator('.tag')).toHaveText('P2')
    const kept = await second.win.evaluate(() => Object.keys(window.localStorage)
      .filter((key) => key.startsWith('meridian.drafts:'))
      .map((key) => window.localStorage.getItem(key)!).join(''))
    expect(kept).not.toContain('打了一半的项目名')
    expect(kept).toContain('打了一半的任务')
  } finally {
    await (second ?? first).app.close()
  }
})

test('关掉 App 再打开,选中文字后工具条里没存的批注和论文表里改到一半的随笔格回到原处,仍没存', async ({ app, win, configHome, profile }) => {
  // Leaving either one saves it, so each is left open by quitting.
  await openReader(win)
  await expect(shown(win, '.pdfpagebox[data-painted="1"]').first()).toBeVisible()
  const line = await shown(win, '.pdfpagebox .textLayer span').first().boundingBox()
  await win.mouse.move(line!.x + 1, line!.y + line!.height / 2)
  await win.mouse.down()
  await win.mouse.move(line!.x + line!.width - 1, line!.y + line!.height / 2, { steps: 6 })
  await win.mouse.up()
  await win.locator('.selection-tools textarea[aria-label="批注"]').fill('没存的批注')
  const highlights = async (page: Page) => (await page.evaluate(() => (window as unknown as MeridianWindow).meridian
    .call('papers.reading', { id: '13979-STAR-Speculative-Decodin' })) as { highlights: unknown[] }).highlights.length
  const before = await highlights(win)

  const first = await relaunch(app, configHome, profile)
  let second: Awaited<ReturnType<typeof relaunch>> | null = null
  try {
    await openReader(first.win)
    await expect(first.win.locator('.selection-tools textarea[aria-label="批注"]')).toHaveValue('没存的批注')
    expect(await highlights(first.win)).toBe(before)
    await first.win.keyboard.press('Escape')
    await expect(first.win.locator('.selection-tools')).toHaveCount(0)
    await first.win.locator('.paper-chat .back, button.back').first().click()
    await gotoPapers(first.win)
    await first.win.locator('#libq').fill('STAR: SPECULATIVE DECODING')
    await expect(first.win.locator('.ptable tbody tr')).toHaveCount(1)
    await first.win.locator('.ptable tbody tr .pt-remark').click()
    await first.win.locator('.ptable tbody tr .pt-remark input').fill('改到一半的随笔')

    second = await relaunch(first.app, configHome, profile)
    await gotoPapers(second.win)
    await second.win.locator('#libq').fill('STAR: SPECULATIVE DECODING')
    await expect(second.win.locator('.ptable tbody tr .pt-remark input')).toHaveValue('改到一半的随笔')
    const kept = await second.win.evaluate(() => Object.keys(window.localStorage)
      .filter((key) => key.startsWith('meridian.drafts:'))
      .map((key) => window.localStorage.getItem(key)!).join(''))
    expect(kept).not.toContain('没存的批注')
  } finally {
    await (second ?? first).app.close()
  }
})
