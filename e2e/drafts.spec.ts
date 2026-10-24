import type { Page } from '@playwright/test'
import { expect, gotoPapers, relaunch, test } from './app.js'

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

test('关掉 App 再打开,没存的阅读笔记和论文对话里没发出的问题原样回来,仍没存;存下之后不再留着', async ({ app, win, configHome }) => {
  await openReader(win)
  await shown(win, 'textarea[aria-label="新笔记"]').fill('没存的笔记')
  await win.locator('.paper-chat [contenteditable="true"]').fill('没发出的问题')

  const reopened = await relaunch(app, configHome)
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
