import type { Locator, Page } from '@playwright/test'
import { TRASH_RETENTION_DAYS } from '../apps/desktop/src/shared/vocabulary.js'
import { expect, gotoPapers, gotoProject, test, vaultToday, type MeridianWindow } from './app.js'

/** Visited screens stay mounted, so selectors every screen has, like the header, target the shown one. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

const gotoTrash = (win: Page) => win.locator('[data-desk="trash"]').click()

/** Clicks a Trash row's Restore; the row shows its actions only while it is hovered. */
async function restore(row: Locator): Promise<void> {
  await row.hover()
  await row.locator('.row-actions [aria-label="恢复"]').click()
}

const DAY_MS = 86_400_000

/** What an entry deleted on the vault's today shows: the full retention period. */
const FULL_RETENTION = `${TRASH_RETENTION_DAYS} 天后自动清除`

/** Calls `trash.list` directly, bypassing the UI, for each entry's deletion time, newest first. */
const deletedAt = (win: Page) => win.evaluate(async () => {
  const entries = await (window as unknown as MeridianWindow).meridian
    .call('trash.list', {}) as { deletedAt: number }[]
  return entries.map((e) => e.deletedAt)
})

/** Calls `trash.list` directly, bypassing the UI, for the id of each entry in the Trash. */
const trashIds = (win: Page) => win.evaluate(async () => {
  const entries = await (window as unknown as MeridianWindow).meridian
    .call('trash.list', {}) as { id: string }[]
  return entries.map((e) => e.id)
})

/** Calls `trash.restore` directly, bypassing the UI; returns the rejection Core sent, or a note if accepted. */
const restoreRefused = (win: Page, id: string) => win.evaluate((entryId) =>
  (window as unknown as MeridianWindow).meridian.call('trash.restore', { id: entryId })
    .then(() => '没有被拒绝', (rejection: unknown) => rejection), id)

const paperTotal = (win: Page) => win.evaluate(async () => {
  const result = await (window as unknown as MeridianWindow).meridian
    .call('papers.list', { page: 1, size: 1 }) as { total: number }
  return result.total
})

test('删掉的论文进垃圾桶,恢复后回到列表且总数复原', async ({ win }) => {
  await gotoPapers(win)
  await expect(win.locator('.ptable tbody tr')).toHaveCount(20)
  const total = await paperTotal(win)
  const title = await win.locator('.ptable tbody tr').first().locator('.pt-title .ci').innerText()
  // The fixture library has two papers sharing this exact title, so filtering by title alone cannot
  // later confirm which one came back; capture the deleted paper's own id (table's default sort is
  // addedAt desc, matching apps/desktop/src/renderer/components/paper-table/PaperTable.tsx).
  const id = await win.evaluate(() => (window as unknown as MeridianWindow).meridian
    .call('papers.list', { page: 1, size: 1, sort: 'addedAt', direction: 'desc' })
    .then((r) => (r as { rows: { id: string }[] }).rows[0]!.id))

  await win.locator('.ptable tbody tr').first().locator('td').last().hover()
  await win.locator('.ptable tbody tr').first().locator('.rowx').click()
  await expect(win.locator('[data-desk="papers"] .n')).toHaveText(String(total - 1))
  await expect(win.locator('[data-desk="trash"] .n')).toHaveText('1')

  await gotoTrash(win)
  await expect(win.locator('#crumb .cseg')).toHaveText(['垃圾桶'])
  await expect(shown(win, '.desk-head .t')).toHaveText('垃圾桶 · 1')
  await expect(shown(win, '.section-heading')).toHaveText('论文 · 1')
  await expect(win.locator('.tgroup .trow .tt2')).toHaveText([title])
  await expect(win.locator('.tgroup .trow .tm2')).toHaveText([FULL_RETENTION])

  await restore(win.locator('.tgroup .trow'))
  await expect(win.locator('.tgroup .trow')).toHaveCount(0)
  await expect(win.locator('[data-desk="trash"] .n')).toHaveCount(0)
  await expect(win.locator('[data-desk="papers"] .n')).toHaveText(String(total))
  expect(await paperTotal(win)).toBe(total)

  // What is restored is the exact paper itself, not just some paper with the same title: check by id.
  const restored = await win.evaluate((paperId) => (window as unknown as MeridianWindow).meridian
    .call('papers.get', { id: paperId }), id) as { title: string }
  expect(restored.title).toBe(title)
})

test('垃圾桶条目带着删除时刻过边界,记的是库里的今天,而库里的今天就是系统日期', async ({ win }) => {
  await gotoPapers(win)
  const before = await win.evaluate(() => Date.now())
  await win.locator('.ptable tbody tr').first().locator('td').last().hover()
  await win.locator('.ptable tbody tr').first().locator('.rowx').click()

  await gotoTrash(win)
  await expect(win.locator('.tgroup .trow')).toHaveCount(1)
  const { stamps, today, system, now } = await win.evaluate(async () => {
    const { meridian } = window as unknown as MeridianWindow
    const entries = await meridian.call('trash.list', {}) as { deletedAt: number }[]
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return {
      stamps: entries.map((e) => e.deletedAt),
      today: await meridian.call('vault.today', {}) as string,
      system: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      now: Date.now(),
    }
  })
  console.log(`垃圾桶条目的删除时刻 ${JSON.stringify(stamps)},库里的今天是 ${today},`
    + `这一屏读到的系统日期是 ${system},点删除前墙上时钟是 ${before},读到时是 ${now}`)

  // The UI shows only the days left, not the timestamp, so read it through the contract.
  expect(stamps).toEqual([Date.parse(`${today}T00:00:00Z`)])
  // The vault's clock is the system clock; it is not frozen on some past day.
  expect(today).toBe(system)
  // The deletion time is midnight of the vault's today, not the wall clock: it divides evenly by a day,
  // which a wall-clock time almost never does.
  expect(stamps[0]! % DAY_MS).toBe(0)
  expect(before % DAY_MS, '墙上时钟正好落在零点,这条用例这一次证不了任何事').not.toBe(0)
  expect(before).toBeLessThanOrEqual(now)
})

test('垃圾桶的倒数按库里的今天算,把这一屏的钟拨走也不动', async ({ win }) => {
  await gotoPapers(win)
  await win.locator('.ptable tbody tr').first().locator('td').last().hover()
  await win.locator('.ptable tbody tr').first().locator('.rowx').click()
  await expect(win.locator('[data-desk="trash"] .n')).toHaveText('1')
  await win.locator('.ptable tbody tr').first().locator('td').last().hover()
  await win.locator('.ptable tbody tr').first().locator('.rowx').click()
  await expect(win.locator('[data-desk="trash"] .n')).toHaveText('2')

  // The deletion time is the vault's today, so two deletions on one day share a time and a countdown.
  const stamps = await deletedAt(win)
  expect(new Set(stamps).size).toBe(1)
  // Both carry the vault's today, so each has the full retention period left, not an arbitrary count.
  const midnight = Date.parse(`${await vaultToday(win)}T00:00:00Z`)
  expect(stamps).toEqual([midnight, midnight])

  // Move this page's clock three days ahead, then open the Trash for the first time: a countdown that read
  // the wall clock would show four days.
  await win.clock.setFixedTime(stamps[0]! + 3 * DAY_MS)
  await gotoTrash(win)
  await expect(win.locator('.tgroup .trow .tm2'))
    .toHaveText([FULL_RETENTION, FULL_RETENTION])
})

test('删掉的附件进垃圾桶,恢复后回到项目', async ({ win }) => {
  await gotoProject(win)
  const names = await win.locator('.attrow .an').allInnerTexts()
  expect(names.length).toBeGreaterThan(1)

  await win.locator('.attrow').first().hover()
  await win.locator('.attrow .ax').first().click()
  await expect(win.locator('.attrow')).toHaveCount(names.length - 1)

  await gotoTrash(win)
  await expect(shown(win, '.section-heading')).toHaveText('附件 · 1')
  await expect(win.locator('.tgroup .trow .tt2')).toHaveText([names[0]!])

  await restore(win.locator('.tgroup .trow'))
  await expect(win.locator('.tgroup .trow')).toHaveCount(0)

  // Entering Projects from another screen lands on the list; the attachments are in the project detail,
  // so open draft again.
  await win.locator('[data-desk="resproj"]').click()
  await win.locator('[data-proj="draft"]').click()
  await expect(win.locator('.attrow .an')).toHaveCount(names.length)
  expect((await win.locator('.attrow .an').allInnerTexts()).sort()).toEqual([...names].sort())
})

test('原项目还在垃圾桶里时,那条附件恢复不回去,项目回来才又能恢复', async ({ win }) => {
  await gotoProject(win)
  const names = await win.locator('.attrow .an').allInnerTexts()
  await win.locator('.attrow').first().hover()
  await win.locator('.attrow .ax').first().click()
  await expect(win.locator('.attrow')).toHaveCount(names.length - 1)

  // Entering Projects from another screen lands on the list, so detour through the Trash, then go back
  // to the list and delete this project too.
  await gotoTrash(win)
  await expect(shown(win, '.section-heading')).toHaveText('附件 · 1')
  await win.locator('[data-desk="resproj"]').click()
  const name = await shown(win, '[data-proj="draft"] .project-identity-name').innerText()
  await shown(win, '[data-proj="draft"]').hover()
  await shown(win, '[data-proj="draft"] .dots').click()
  await win.locator('.ctxmenu .mi.danger').click()
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已移入垃圾桶')

  await gotoTrash(win)
  await expect(shown(win, '.section-heading')).toHaveText(['项目 · 1', '附件 · 1'])
  const projectRow = shown(win, '.trow').filter({ hasText: name })
  const attachmentRow = shown(win, '.trow').filter({ hasText: names[0]! })

  // An attachment cannot go back to a project that is gone, so its Restore button is disabled rather
  // than clickable into an IPC error.
  await expect(attachmentRow.locator('.row-actions [aria-label="恢复"]')).toBeDisabled()
  await expect(projectRow.locator('.row-actions [aria-label="恢复"]')).toBeEnabled()

  await restore(projectRow)
  await expect(attachmentRow.locator('.row-actions [aria-label="恢复"]')).toBeEnabled()
  await restore(attachmentRow)
  await expect(win.locator('.tgroup .trow')).toHaveCount(0)
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  await expect(win.locator('#notice[data-tone="refusal"]')).toHaveCount(0)

  await win.locator('[data-desk="resproj"]').click()
  await win.locator('[data-proj="draft"]').click()
  // allInnerTexts does not retry, so wait for every attachment to render before reading.
  await expect(win.locator('.attrow .an')).toHaveCount(names.length)
  expect((await win.locator('.attrow .an').allInnerTexts()).sort()).toEqual([...names].sort())
})

test('清空垃圾桶要过二次确认,清掉的东西恢复不回来', async ({ win }) => {
  await gotoPapers(win)
  await expect(win.locator('.ptable tbody tr')).toHaveCount(20)
  await win.locator('.ptable tbody tr').first().locator('td').last().hover()
  await win.locator('.ptable tbody tr').first().locator('.rowx').click()
  await gotoProject(win)
  await win.locator('.attrow').first().hover()
  await win.locator('.attrow .ax').first().click()

  await gotoTrash(win)
  await expect(win.locator('.tgroup .trow')).toHaveCount(2)
  const ids = await trashIds(win)

  await shown(win, '.desk-head .page-actions .btn').filter({ hasText: '清空垃圾桶' }).click()
  const dialog = win.locator('[role="alertdialog"]')
  await expect(dialog.locator('.modal-title')).toHaveText('清空垃圾桶？')
  await expect(dialog.locator('.modal-detail')).toHaveText('2 项将被彻底删除，不可恢复。')
  await expect(dialog.locator('.modal-actions .btn')).toHaveText(['取消', '确认清空'])

  // Cancel leaves the contents unchanged.
  await dialog.locator('.btn', { hasText: '取消' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(win.locator('.tgroup .trow')).toHaveCount(2)

  await shown(win, '.desk-head .page-actions .btn').filter({ hasText: '清空垃圾桶' }).click()
  await dialog.locator('.btn', { hasText: '确认清空' }).click()
  await expect(win.locator('.tgroup .trow')).toHaveCount(0)
  await expect(win.locator('.empty-state')).toHaveCount(1)
  await expect(win.locator('[data-desk="trash"] .n')).toHaveCount(0)

  expect(ids).toHaveLength(2)
  for (const id of ids) expect(await restoreRefused(win, id)).toEqual({ reason: 'not-found' })
})
