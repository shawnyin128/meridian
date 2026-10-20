import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, gotoPapers, parkPointer, test } from './app.js'

/**
 * Screenshots of four states of the paper table: the default list, the details panel, the topic
 * popover and grouping by topic.
 */

const SHOTS = resolve(import.meta.dirname, '../.superpowers/e2e-shots')

/** Go through the four states in turn and take a screenshot of each. The file name is `route-<route>-<state>.png`. */
async function shootStates(win: Page, route: string): Promise<void> {
  const rows = win.locator('tbody tr')
  await rows.first().waitFor()
  await parkPointer(win)
  await win.screenshot({ path: `${SHOTS}/route-${route}-table.png` })

  await rows.first().click()
  await win.locator('[aria-label="收起详情"]').waitFor()
  await parkPointer(win)
  await win.screenshot({ path: `${SHOTS}/route-${route}-detail.png` })
  await win.locator('[aria-label="收起详情"]').click()

  // The + in a topic cell stays hidden until its row is hovered; Topics is the 7th column (Title,
  // Short title, Rating, Authors, Year, Venue, Topics).
  const cell = rows.first().locator('td:nth-child(7)')
  await cell.hover()
  await cell.locator('.tagadd').click()
  await win.locator('[data-radix-popper-content-wrapper]').waitFor()
  await win.screenshot({ path: `${SHOTS}/route-${route}-tagadd.png` })
  await win.keyboard.press('Escape')
  await parkPointer(win)

  await win.getByRole('radio', { name: '主题', exact: true }).first().click()
  await expect(win.locator('.gxrow').first()).toBeVisible()
  await parkPointer(win)
  await win.screenshot({ path: `${SHOTS}/route-${route}-grouped.png` })
}

test('截下路线 A 论文库表的四个状态', async ({ win }) => {
  await gotoPapers(win)
  await shootStates(win, 'a')
})
