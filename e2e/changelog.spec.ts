import type { Page } from '@playwright/test'
import { expect, test, type MeridianWindow } from './app.js'

/** The screen you entered is always hung, and selectors that are present on every screen such as items should be included in the currently displayed screen. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

const gotoChangelog = (win: Page) => win.locator('[data-desk="changelog"]').click()

/** Bypass the interface and call `changelog.list` directly to get the source of each change in the library. */
const sourcesFromCore = (win: Page) => win.evaluate(async () => {
  const entries = await (window as unknown as MeridianWindow).meridian
    .call('changelog.list', {}) as { source: string }[]
  return entries.map((e) => e.source)
})

/** Bypass the interface and call `changelog.list` directly, and archive every change in the library. */
const archivedFromCore = (win: Page) => win.evaluate(async () => {
  const entries = await (window as unknown as MeridianWindow).meridian
    .call('changelog.list', {}) as { archived: boolean }[]
  return entries.map((e) => e.archived)
})

/** Bypass the interface and call `project.list` directly to get the current status of the project in the library. */
const statusFromCore = (win: Page, id: string) => win.evaluate(async (projectId) => {
  const rows = await (window as unknown as MeridianWindow).meridian
    .call('project.list', {}) as { id: string; status: string }[]
  return rows.find((p) => p.id === projectId)?.status
}, id)

/** The arrangement of the date subtitles and entries on the current screen: the title is written as `# text`, and the entry is written as `.`. */
const layout = (win: Page) => shown(win, '.desk-body').evaluate((body) => {
  const marks: string[] = []
  for (const el of body.querySelectorAll('.day-heading, .crow')) {
    marks.push(el.classList.contains('day-heading') ? `#${el.textContent!}` : '.')
  }
  return marks.join('')
})

/** Change draft to shelved on the project list, and take the path that is actually available on the interface. */
async function shelveDraft(win: Page): Promise<void> {
  await win.locator('[data-desk="resproj"]').click()
  await win.locator('[data-proj="draft"]').hover()
  await win.locator('[data-proj="draft"] .dots').click()
  await win.locator('.ctxmenu .mi', { hasText: '搁置' }).click()
  await expect(win.locator('#toast')).toHaveText('已标记为 搁置')
}

test('侧栏「最近变动」进的是变动屏,面包屑、屏头的数与角标都对上', async ({ win }) => {
  const sources = await sourcesFromCore(win)
  await expect(win.locator('[data-desk="changelog"] .n')).toHaveText(String(sources.length))

  await gotoChangelog(win)
  await expect(win.locator('#crumb .cseg')).toHaveText(['我的库', '最近变动'])
  await expect(shown(win, '.desk-head .t')).toHaveText(`最近变动 · ${sources.length}`)
  await expect(shown(win, '.crow')).toHaveCount(sources.length)
  await expect(shown(win, '.crow .src')).toHaveText(sources)
  // None of the fixture items have been archived: only the "Unfiled" section
  await expect(shown(win, '.section-heading')).toContainText(['未归档'])
})

test('点开一条才看得见它的 diff,加行删行分开着色', async ({ win }) => {
  await gotoChangelog(win)
  // The one with one deletion and one addition: "Your conclusion "branch waste" · v2 → v3"
  const row = shown(win, '.crow').filter({ hasText: '分支浪费' })
  await expect(row.locator('.diff')).toBeHidden()

  await row.click()
  await expect(row.locator('.diff')).toBeVisible()
  await expect(row.locator('.diff .del')).toHaveCount(1)
  await expect(row.locator('.diff .add')).toHaveCount(1)
  // Expansion is done one by one, and clicking on one will not expand the others.
  await expect(shown(win, '.crow').first().locator('.diff')).toBeHidden()

  await row.click()
  await expect(row.locator('.diff')).toBeHidden()
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
  await expect(top.locator('.src')).toHaveText('我')
  await top.hover()
  await expect(top.locator('.cundo')).toHaveText('撤销')

  await top.locator('.cundo').click()
  await expect(win.locator('#banner span')).toHaveText('已撤销 · 数据回到这一笔之前')
  // Retake the numbers and compare: Curry is really back to before the change, not just the changes on the screen
  expect(await statusFromCore(win, 'draft')).toBe('进行中')

  // This item remains and is marked as withdrawn, and the withdrawal itself becomes another item, ranked before it.
  await expect(shown(win, '.crow')).toHaveCount(seeded + 2)
  await expect(shown(win, '.crow').first().locator('.ct'))
    .toContainText('撤销:项目「draft 效率」· 改了字段')
  // The withdrawn article no longer has an undo button, and the withdrawn item is written in the line of gray text under the title.
  await expect(shown(win, '.crow').nth(1).locator('.cundo')).toHaveCount(0)
  await expect(shown(win, '.crow').nth(1).locator('.cm')).toContainText('已撤销')
})

test('这一笔之后又改过时撤销被拒,说清还有几条更新的,数据一个字没动', async ({ win }) => {
  await shelveDraft(win)
  await win.locator('[data-proj="draft"]').hover()
  await win.locator('[data-proj="draft"] .dots').click()
  await win.locator('.ctxmenu .mi', { hasText: '重命名' }).click()
  await win.locator('.ctxmenu .mi-in input').fill('改过名字的 draft')
  await win.locator('.ctxmenu .mi-in input').press('Enter')
  await expect(win.locator('#banner span')).toHaveText('已重命名')

  await gotoChangelog(win)
  // The one about changing status is after the one about changing name, so it ranks second.
  const shelved = shown(win, '.crow').nth(1)
  await shelved.hover()
  await expect(shelved.locator('.cundo')).toHaveText('撤销')
  await shelved.locator('.cundo').click()

  await expect(win.locator('#toast')).toHaveText('这条之后该实体又被改过 1 次,先撤销较新的那几条')
  expect(await statusFromCore(win, 'draft')).toBe('搁置')
  await expect(shelved.locator('.cundo')).toHaveText('撤销')
})

test('撤不动的那几条没有撤销钮,灰字里写着无法撤销:fixture 带进来的历史没有还原所需的东西', async ({ win }) => {
  await gotoChangelog(win)
  // Wait for all the rows to arrive first: an empty list also satisfies "no undo button", which is not what this use case wants to prove.
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
  const title = await first.locator('.ct').innerText()

  await first.hover()
  await first.locator('.carch').click()

  await expect(shown(win, '.desk-head .t')).toHaveText(`最近变动 · ${total - 1}`)
  await expect(win.locator('[data-desk="changelog"] .n')).toHaveText(String(total - 1))
  await expect(shown(win, '.section-heading')).toContainText(['未归档', '已归档'])

  // The section headers are the ones in the main area: 15px. The first section "Unfiled" is exempt from the line. The non-first section "Archived" has a top line.
  const heads = shown(win, '.section-heading')
  await expect(heads.nth(0)).toHaveCSS('font-size', '15px')
  await expect(heads.nth(0)).toHaveCSS('border-top-width', '0px')
  await expect(heads.nth(1)).toHaveCSS('font-size', '15px')
  await expect(heads.nth(1)).toHaveCSS('border-top-width', '1px')

  // The filed item is the only one in "Archived" and it has no archive button.
  const filed = shown(win, '.crow').last()
  await expect(filed.locator('.ct')).toHaveText(title)
  await expect(filed.locator('.carch')).toHaveCount(0)
  // The latest changes will not be recorded in the archive: the total number of entries is not many.
  await expect(shown(win, '.crow')).toHaveCount(total)
})

test('「全部归档」把未归档清空,写「都看过了。」,按钮跟着灰掉', async ({ win }) => {
  const total = (await sourcesFromCore(win)).length
  await gotoChangelog(win)
  // "Archived All" is pasted to the right of the "Unarchived" section title.
  await expect(shown(win, '.section-heading').first().locator('.archall')).toHaveCount(1)
  await shown(win, '.archall').click()

  await expect(win.locator('#toast')).toHaveText(`已归档 ${total} 条`)
  await expect(shown(win, '.desk-head .t')).toHaveText('最近变动 · 0')
  await expect(win.locator('[data-desk="changelog"] .n')).toHaveText('0')
  await expect(shown(win, '.empty-state')).toHaveText('都看过了。')
  // It sits under a section heading with the archived list below it, so it is the one-line variant.
  await expect(shown(win, '.empty-state')).toHaveClass(/empty-state--section/)
  await expect(shown(win, '.archall')).toBeDisabled()
  await expect(shown(win, '.crow')).toHaveCount(total)
  // Does it count if you look at it on the screen? Every item in the library is really filed.
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
  await expect(win.locator('#banner span')).toHaveText('已撤销 · 数据回到这一笔之前')
  // Retake the numbers and compare: Curry is really back to before the change
  expect(await statusFromCore(win, 'draft')).toBe('进行中')

  // That item is still in "Archived", but marked as withdrawn; the withdrawal itself is a new item, and it falls on the top of "Unarchived"
  await expect(shown(win, '.crow').last().locator('.cm')).toContainText('已撤销')
  await expect(shown(win, '.crow').first().locator('.ct'))
    .toContainText('撤销:项目「draft 效率」· 改了字段')
})

test('这一屏没有筛选条:来源只写在条目上,不能按它筛', async ({ win }) => {
  const sources = await sourcesFromCore(win)
  await gotoChangelog(win)
  await expect(shown(win, '.crow')).toHaveCount(sources.length)
  await expect(shown(win, '.segmented-control')).toHaveCount(0)
  await expect(shown(win, '.crow .src')).toHaveText(sources)
})

test('两节内部各自按天分段,同一天连成一段,段首一行日期', async ({ win }) => {
  await gotoChangelog(win)
  // There are four fixtures: one is recorded today, and three are recorded yesterday; none of them are archived, so there is only the "Unfiled" section.
  await expect(shown(win, '.crow')).toHaveCount(4)
  expect(await layout(win)).toBe('#今天.#昨天...')

  // File today's item: it goes to "Archived" and both sections have their own date titles.
  const first = shown(win, '.crow').first()
  await first.hover()
  await first.locator('.carch').click()
  await expect(shown(win, '.day-heading')).toHaveText(['昨天', '今天'])
  expect(await layout(win)).toBe('#昨天...#今天.')
})

test('日期只写在小标题上:条目的灰字不再重复一遍', async ({ win }) => {
  await shelveDraft(win)
  await gotoChangelog(win)
  // The entire meta that I wrote down is that date, and only the last half of the sentence is left after cutting it.
  await expect(shown(win, '.crow').first().locator('.cm')).toHaveText('点开看改了什么')
  // The meta of fixture is two paragraphs written by hand, only the first paragraph of date is cut off.
  await expect(shown(win, '.crow').filter({ hasText: '分支浪费' }).locator('.cm'))
    .toHaveText('实验 #3 的结果回流 · 无法撤销')

  for (const line of await shown(win, '.crow .cm').allTextContents()) {
    expect(line, line).not.toMatch(/^(今天|昨天|昨晚|刚刚|本周|更早)/)
  }
})
