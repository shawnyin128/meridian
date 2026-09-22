import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, gotoPapers, parkPointer, test } from './app.js'

/**
 * Take a screenshot of each of the four states of the paper library table: default list, details panel, label floating layer, and grouping by topic.
 */

const SHOTS = resolve(import.meta.dirname, '../.superpowers/e2e-shots')

/** Go through the four states in turn and take a screenshot of each. The file name is `route-<route>-<state>.png`. */
async function shootStates(win: Page, route: string): Promise<void> {
  const rows = win.locator('tbody tr')
  await rows.first().waitFor()
  await parkPointer(win)
  await win.screenshot({ path: `${SHOTS}/route-${route}-table.png` })

  await rows.first().click()
  await win.locator('[title="收起详情"]').waitFor()
  await parkPointer(win)
  await win.screenshot({ path: `${SHOTS}/route-${route}-detail.png` })
  await win.locator('[title="收起详情"]').click()

  // When the theme grid cannot fit, fold the + at the end and press it on this grid before unfolding; the subject is now in the 7th grid
  // (title/short title/rating/author/year/publication/subject).
  const cell = rows.first().locator('td:nth-child(7)')
  await cell.hover()
  await cell.locator('.tagadd').click()
  await win.locator('[data-radix-popper-content-wrapper]').waitFor()
  await win.screenshot({ path: `${SHOTS}/route-${route}-tagadd.png` })
  await win.keyboard.press('Escape')
  await parkPointer(win)

  await win.getByRole('button', { name: '主题', exact: true }).first().click()
  await expect(win.locator('.lmore')).toHaveText('选一个主题查看论文')
  await parkPointer(win)
  await win.screenshot({ path: `${SHOTS}/route-${route}-grouped.png` })
}

test('截下路线 A 论文库表的四个状态', async ({ win }) => {
  await gotoPapers(win)
  await shootStates(win, 'a')
})
