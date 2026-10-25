import type { Page } from '@playwright/test'
import { expect, test, type MeridianWindow } from './app.js'

/** Screens stay mounted once visited, so selectors every screen has, such as rows, are scoped to the visible one. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

const gotoChangelog = (win: Page) => win.locator('[data-desk="changelog"]').click()

/** Calls `changelog.list` directly, bypassing the UI, and returns the source of each change in the vault. */
const sourcesFromCore = (win: Page) => win.evaluate(async () => {
  const entries = await (window as unknown as MeridianWindow).meridian
    .call('changelog.list', {}) as { source: string }[]
  return entries.map((e) => e.source)
})

/**
 * The attribution labels the screen shows for these change sources, top to bottom: a change the user
 * made has none, and an agent's carries the agent label, with the notes or experiment it came from.
 */
const labelsOf = (sources: string[]) => sources.filter((source) => source !== '我')
  .map((source) => (source === 'Meridian' ? 'agent' : `agent · ${source}`))

/** Calls `changelog.list` directly, bypassing the UI, and returns whether each change in the vault is archived. */
const archivedFromCore = (win: Page) => win.evaluate(async () => {
  const entries = await (window as unknown as MeridianWindow).meridian
    .call('changelog.list', {}) as { archived: boolean }[]
  return entries.map((e) => e.archived)
})

/** Calls `project.list` directly, bypassing the UI, and returns the project's current status in the vault. */
const statusFromCore = (win: Page, id: string) => win.evaluate(async (projectId) => {
  const rows = await (window as unknown as MeridianWindow).meridian
    .call('project.list', {}) as { id: string; status: string }[]
  return rows.find((p) => p.id === projectId)?.status
}, id)

/** The order of day headings and rows on the visible screen: a heading is written `#text`, a row `.`. */
const layout = (win: Page) => shown(win, '.desk-body').evaluate((body) => {
  const marks: string[] = []
  for (const el of body.querySelectorAll('.section-heading--group, .crow')) {
    marks.push(el.classList.contains('section-heading--group') ? `#${el.textContent!}` : '.')
  }
  return marks.join('')
})

/** Shelves the draft project from the project list, through the row menu a user would use. */
async function shelveDraft(win: Page): Promise<void> {
  await win.locator('[data-desk="resproj"]').click()
  await win.locator('[data-proj="draft"]').hover()
  await win.locator('[data-proj="draft"] .dots').click()
  await win.locator('.ctxmenu .mi', { hasText: '搁置' }).click()
  await expect.poll(() => statusFromCore(win, 'draft')).toBe('搁置')
}

test('侧栏「最近变动」进的是变动屏,面包屑、屏头的数与角标都对上', async ({ win }) => {
  const sources = await sourcesFromCore(win)
  await expect(win.locator('[data-desk="changelog"] .nav-row-count')).toHaveText(String(sources.length))

  await gotoChangelog(win)
  await expect(win.locator('#crumb .cseg')).toHaveText(['我的库', '最近变动'])
  await expect(shown(win, '.desk-head .t')).toHaveText(`最近变动 · ${sources.length}`)
  await expect(shown(win, '.crow')).toHaveCount(sources.length)
  await expect(shown(win, '.crow .src')).toHaveText(labelsOf(sources))
  // No fixture change is archived, so only the unarchived section shows.
  await expect(shown(win, '.section-heading')).toContainText(['未归档'])
})

test('点开一条才看得见它的 diff,加行删行分开着色', async ({ win }) => {
  await gotoChangelog(win)
  // The change with one deleted and one added line: the user's conclusion "branch waste", v2 to v3.
  const row = shown(win, '.crow').filter({ hasText: '分支浪费' })
  const toggle = row.locator('.card-tray-toggle')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(row.locator('.diff')).toBeVisible()
  await expect(row.locator('.diff .del')).toHaveCount(1)
  await expect(row.locator('.diff .add')).toHaveCount(1)
  // Each row expands on its own: opening one leaves the others closed.
  await expect(shown(win, '.crow').first().locator('.card-tray-toggle')).toHaveAttribute('aria-expanded', 'false')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

test('改一笔再撤销:数据真的回到改之前,那一条标成已撤销,并多出一条撤销记录', async ({ win }) => {
  expect(await statusFromCore(win, 'draft')).toBe('进行中')
  const seeded = (await sourcesFromCore(win)).length
  await shelveDraft(win)
  expect(await statusFromCore(win, 'draft')).toBe('搁置')

  await gotoChangelog(win)
  await expect(shown(win, '.crow')).toHaveCount(seeded + 1)
  const top = shown(win, '.crow').first()
  await expect(top.locator('.ct')).toContainText('项目「draft 效率」· 改了字段')
  await expect(top.locator('.src')).toHaveCount(0)
  await top.hover()
  await expect(top.locator('.cundo')).toHaveAttribute('aria-label', '撤销')

  await top.locator('.cundo').click()
  // Read Core again: the vault really is back to its state before the change, not just the screen.
  await expect.poll(() => statusFromCore(win, 'draft')).toBe('进行中')

  // The original change stays, marked as undone, and the undo itself is a new change listed above it.
  await expect(shown(win, '.crow')).toHaveCount(seeded + 2)
  await expect(shown(win, '.crow').first().locator('.ct'))
    .toContainText('撤销：项目「draft 效率」· 改了字段')
  // The undone change has no undo button any more, and the gray line under its title says it was undone.
  await expect(shown(win, '.crow').nth(1).locator('.cundo')).toHaveCount(0)
  await expect(shown(win, '.crow').nth(1).locator('.cm')).toContainText('已撤销')
})

test('这一笔之后又改过时撤销被拒,说清还有几条更新的,数据一个字没动', async ({ win }) => {
  await shelveDraft(win)
  await win.locator('[data-proj="draft"]').hover()
  await win.locator('[data-proj="draft"] .dots').click()
  await win.locator('.ctxmenu .mi', { hasText: '重命名' }).click()
  await win.locator('[data-proj="draft"] .metadata-input').fill('改过名字的 draft')
  await win.locator('[data-proj="draft"] .metadata-input').press('Enter')
  await expect(win.locator('[data-proj="draft"]')).toContainText('改过名字的 draft')

  await gotoChangelog(win)
  // The status change is older than the rename, so it is listed second.
  const shelved = shown(win, '.crow').nth(1)
  await shelved.hover()
  await expect(shelved.locator('.cundo')).toHaveAttribute('aria-label', '撤销')
  await shelved.locator('.cundo').click()

  await expect(win.locator('#notice[data-tone="refusal"] .notice-text')).toHaveText('先撤销较新的变动')
  expect(await statusFromCore(win, 'draft')).toBe('搁置')
  await expect(shelved.locator('.cundo')).toHaveAttribute('aria-label', '撤销')
})

test('撤不动的那几条没有撤销钮,灰字里写着无法撤销:fixture 带进来的历史没有还原所需的东西', async ({ win }) => {
  await gotoChangelog(win)
  // Wait for all the rows to arrive first: an empty list also satisfies "no undo button", which is not what this test case means to prove.
  await expect(shown(win, '.crow')).toHaveCount((await sourcesFromCore(win)).length)
  await expect(shown(win, '.crow .cundo')).toHaveCount(0)
  for (const row of await shown(win, '.crow').all()) {
    await expect(row.locator('.cm')).toContainText('无法撤销')
  }
})

test('归一条:它落到「已归档」那一节,屏头与侧栏的数都掉一,记录不多一条', async ({ win }) => {
  const total = (await sourcesFromCore(win)).length
  await gotoChangelog(win)
  const first = shown(win, '.crow').first()
  const title = (await first.locator('.ct').textContent())!

  await first.hover()
  await first.locator('.carch').click()

  await expect(shown(win, '.desk-head .t')).toHaveText(`最近变动 · ${total - 1}`)
  await expect(win.locator('[data-desk="changelog"] .nav-row-count')).toHaveText(String(total - 1))
  await expect(shown(win, '.section-heading')).toContainText(['未归档', '已归档'])

  // Section headings use the main-area size, 15px. The first section (unarchived) has no top rule;
  // a later one ("Archived") draws one. The day groups under them are group headings.
  const heads = shown(win, '.section-heading--section')
  await expect(heads.nth(0)).toHaveCSS('font-size', '15px')
  await expect(heads.nth(0)).toHaveCSS('border-top-width', '0px')
  await expect(heads.nth(1)).toHaveCSS('font-size', '15px')
  await expect(heads.nth(1)).toHaveCSS('border-top-width', '1px')

  // The archived change is the only one under "Archived" and has no archive button.
  const filed = shown(win, '.crow').last()
  await expect(filed.locator('.ct')).toHaveText(title)
  await expect(filed.locator('.carch')).toHaveCount(0)
  // Archiving is not itself recorded as a change: the row count does not grow.
  await expect(shown(win, '.crow')).toHaveCount(total)
})

test('「全部归档」把未归档清空成一行空态 —,按钮跟着灰掉', async ({ win }) => {
  const total = (await sourcesFromCore(win)).length
  await gotoChangelog(win)
  // "Archive all" sits at the right end of the unarchived section's heading.
  await expect(shown(win, '.section-heading').first().locator('.archall')).toHaveCount(1)
  await shown(win, '.archall').click()

  await expect(shown(win, '.desk-head .t')).toHaveText('最近变动 · 0')
  await expect(win.locator('[data-desk="changelog"] .nav-row-count')).toHaveCount(0)
  await expect(shown(win, '.empty-state')).toHaveText('—')
  // It sits under a section heading with the archived list below it, so it is the one-line variant.
  await expect(shown(win, '.empty-state')).toHaveClass(/empty-state--section/)
  await expect(shown(win, '.archall')).toBeDisabled()
  await expect(shown(win, '.crow')).toHaveCount(total)
  // The screen alone proves nothing: every change in the vault really is archived.
  expect(await archivedFromCore(win)).toEqual(Array<boolean>(total).fill(true))
})

test('归过档的那一条照样撤得动,撤销不动它的归档,撤销本身落在未归档', async ({ win }) => {
  await shelveDraft(win)
  await gotoChangelog(win)
  const top = shown(win, '.crow').first()
  await top.hover()
  await top.locator('.carch').click()
  await expect(shown(win, '.section-heading')).toContainText(['未归档', '已归档'])

  const filed = shown(win, '.crow').last()
  await expect(filed.locator('.ct')).toContainText('项目「draft 效率」· 改了字段')
  await filed.hover()
  await filed.locator('.cundo').click()
  // Read Core again: the vault really is back to its state before the change.
  await expect.poll(() => statusFromCore(win, 'draft')).toBe('进行中')

  // The change stays under "Archived", marked as undone; the undo is a new change at the top of the
  // unarchived section.
  await expect(shown(win, '.crow').last().locator('.cm')).toContainText('已撤销')
  await expect(shown(win, '.crow').first().locator('.ct'))
    .toContainText('撤销：项目「draft 效率」· 改了字段')
})

test('这一屏没有筛选条:来源只写在条目上,不能按它筛', async ({ win }) => {
  const sources = await sourcesFromCore(win)
  await gotoChangelog(win)
  await expect(shown(win, '.crow')).toHaveCount(sources.length)
  await expect(shown(win, '.segmented-control')).toHaveCount(0)
  await expect(shown(win, '.crow .src')).toHaveText(labelsOf(sources))
})

test('两节内部各自按天分段,同一天连成一段,段首一行日期', async ({ win }) => {
  await gotoChangelog(win)
  // The fixture has four changes, one recorded today and three yesterday; none is archived, so only
  // the unarchived section shows.
  await expect(shown(win, '.crow')).toHaveCount(4)
  expect(await layout(win)).toBe('#今天.#昨天...')

  // Archive today's change: it moves to "Archived", and each section gets its own day headings.
  const first = shown(win, '.crow').first()
  await first.hover()
  await first.locator('.carch').click()
  await expect(shown(win, '.section-heading--group')).toHaveText(['昨天', '今天'])
  expect(await layout(win)).toBe('#昨天...#今天.')
})

test('日期只写在小标题上:条目的灰字不再重复一遍', async ({ win }) => {
  await shelveDraft(win)
  await gotoChangelog(win)
  // The meta line of the user's own undoable change was only its date; with the date cut, it is empty.
  await expect(shown(win, '.crow').first().locator('.cm')).toHaveText('')
  // Fixture meta lines are hand-written in two parts; only the leading date part is cut.
  await expect(shown(win, '.crow').filter({ hasText: '分支浪费' }).locator('.cm'))
    .toHaveText('实验 #3 的结果回流 · 无法撤销')

  for (const line of await shown(win, '.crow .cm').allTextContents()) {
    expect(line, line).not.toMatch(/^(今天|昨天|昨晚|刚刚|本周|更早)/)
  }
})
