import type { Page } from '@playwright/test'
import { TRASH_RETENTION_DAYS } from '../apps/desktop/src/shared/vocabulary.js'
import { expect, gotoPapers, gotoProject, test, vaultToday, type MeridianWindow } from './app.js'

/** The screen you entered is always hung, and the selector that is present on every screen, such as the screen header, should be stored in the currently displayed screen. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

const gotoTrash = (win: Page) => win.locator('[data-desk="trash"]').click()

const DAY_MS = 86_400_000

/** The article that Curry deleted today has the entire retention period written down. */
const FULL_RETENTION = `${TRASH_RETENTION_DAYS} 天后自动清除`

/** Bypass the interface and call `trash.list` directly to get the deletion time of each item, with the latest one first. */
const deletedAt = (win: Page) => win.evaluate(async () => {
  const entries = await (window as unknown as MeridianWindow).meridian
    .call('trash.list', {}) as { deletedAt: number }[]
  return entries.map((e) => e.deletedAt)
})

/** Bypass the interface and call `trash.list` directly, and get the id of each item in the trash. */
const trashIds = (win: Page) => win.evaluate(async () => {
  const entries = await (window as unknown as MeridianWindow).meridian
    .call('trash.list', {}) as { id: string }[]
  return entries.map((e) => e.id)
})

/** Directly call `trash.restore` to bypass the interface and return the reason for rejection; if it is not rejected, return the sentence itself. */
const restoreRefused = (win: Page, id: string) => win.evaluate((entryId) =>
  (window as unknown as MeridianWindow).meridian.call('trash.restore', { id: entryId })
    .then(() => '没有被拒绝', (e: Error) => e.message), id)

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
  await expect(shown(win, '.section-heading')).toHaveText('论文 · 1清空垃圾桶')
  await expect(win.locator('.tgroup .trow .tt2')).toHaveText([title])
  await expect(win.locator('.tgroup .trow .tm2')).toHaveText([FULL_RETENTION])

  await win.locator('.tgroup .trow .btn', { hasText: '恢复' }).click()
  await expect(win.locator('.tgroup .trow')).toHaveCount(0)
  await expect(win.locator('[data-desk="trash"] .n')).toHaveText('')
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

  // Only the number of days left is written on the interface, and the time itself is not displayed, so it can only be read according to the contract.
  expect(stamps).toEqual([Date.parse(`${today}T00:00:00Z`)])
  // Curry's clock is the system's clock, it doesn't stop at a certain day in the past.
  expect(today).toBe(system)
  // The deletion time is taken from the zero point of Curry's day, not the wall clock: it is evenly divisible by one day, and the wall clock is almost impossible to be evenly divided.
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

  // The deletion time is today in Curry. The two deletions on the same day have the same time, so the countdowns should be the same.
  const stamps = await deletedAt(win)
  expect(new Set(stamps).size).toBe(1)
  // Both are recorded on today's day in the library, so what's left of them is the entire retention period, not a random number.
  const midnight = Date.parse(`${await vaultToday(win)}T00:00:00Z`)
  expect(stamps).toEqual([midnight, midnight])

  // First set the clock on this screen to three days later, and then open the trash can for the first time: if you still look at the clock on the wall, the countdown will read four days.
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
  await expect(shown(win, '.section-heading')).toHaveText('附件 · 1清空垃圾桶')
  await expect(win.locator('.tgroup .trow .tt2')).toHaveText([names[0]!])

  await win.locator('.tgroup .trow .btn', { hasText: '恢复' }).click()
  await expect(win.locator('.tgroup .trow')).toHaveCount(0)

  // Enter "Project" from another screen and it will fall into the list. The attachment is in the project details, so you have to click on draft again.
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

  // The "item" entered from another screen landed on the list, so go around the trash can first, then go back to the list and delete this item as well.
  await gotoTrash(win)
  await expect(shown(win, '.section-heading')).toHaveText('附件 · 1清空垃圾桶')
  await win.locator('[data-desk="resproj"]').click()
  const name = await shown(win, '[data-proj="draft"] .project-identity-name').innerText()
  await shown(win, '[data-proj="draft"]').hover()
  await shown(win, '[data-proj="draft"] .dots').click()
  await win.locator('.ctxmenu .mi.danger').click()
  await expect(win.locator('#banner span')).toHaveText('已移入垃圾桶 · 7 天内可恢复')

  await gotoTrash(win)
  await expect(shown(win, '.section-heading')).toHaveText(['项目 · 1清空垃圾桶', '附件 · 1'])
  const projectRow = shown(win, '.trow').filter({ hasText: name })
  const attachmentRow = shown(win, '.trow').filter({ hasText: names[0]! })

  // You cannot restore a project that no longer exists, so the restore button for this item is gray. Instead of clicking on it, you will get an IPC error message.
  await expect(attachmentRow.locator('.btn', { hasText: '恢复' })).toBeDisabled()
  await expect(projectRow.locator('.btn', { hasText: '恢复' })).toBeEnabled()

  await projectRow.locator('.btn', { hasText: '恢复' }).click()
  await expect(attachmentRow.locator('.btn', { hasText: '恢复' })).toBeEnabled()
  await attachmentRow.locator('.btn', { hasText: '恢复' }).click()
  await expect(win.locator('.tgroup .trow')).toHaveCount(0)
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  expect(await win.locator('#toast').textContent()).toBe('')

  await win.locator('[data-desk="resproj"]').click()
  await win.locator('[data-proj="draft"]').click()
  // allInnerTexts will not retry itself. It will wait for all attachments to be drawn back before reading.
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

  await shown(win, '.section-heading.flexh .btn').filter({ hasText: '清空垃圾桶' }).click()
  const dialog = win.locator('[role="alertdialog"]')
  await expect(dialog.locator('.dlg-t')).toHaveText('清空垃圾桶？2 项将被彻底删除，不可恢复。')
  await expect(dialog.locator('.dlg-a .btn')).toHaveText(['取消', '确认清空'])

  // Cancel immutable content
  await dialog.locator('.btn', { hasText: '取消' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(win.locator('.tgroup .trow')).toHaveCount(2)

  await shown(win, '.section-heading.flexh .btn').filter({ hasText: '清空垃圾桶' }).click()
  await dialog.locator('.btn', { hasText: '确认清空' }).click()
  await expect(win.locator('.tgroup .trow')).toHaveCount(0)
  await expect(win.locator('.empty-state')).toHaveCount(1)
  await expect(win.locator('[data-desk="trash"] .n')).toHaveText('')

  expect(ids).toHaveLength(2)
  for (const id of ids) expect(await restoreRefused(win, id)).toContain(id)
})
