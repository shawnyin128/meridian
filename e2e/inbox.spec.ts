import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, gotoPapers, test, uniqueHeights, type MeridianWindow } from './app.js'

/** The screen you entered is always hung, and the selectors that are present on every screen, such as cards, should be stored in the currently displayed screen. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)
const settings = (win: Page, sel: string) => win.locator(`.setdlg ${sel}`)

const DEMO = resolve(import.meta.dirname, 'fixtures/platform-shell-demo.html')

/** A push notification for demo. The field names are written in demo's own way, so leave them as they are so that they can be compared side by side with the source files. */
type DemoEntry = {
  id: string; watch: string; title: string; authors: string; venue: string; abs: string; rec: string
}

/**
 * Evaluate the INBOX array in the demo source file as it is. The expected value is taken from the demo itself, not copied by hand; the array is
 * A self-consistent literal that does not reference anything else in the demo.
 */
function inboxFromDemo(): DemoEntry[] {
  const demo = readFileSync(DEMO, 'utf8')
  const at = demo.indexOf('const INBOX=[')
  const end = demo.indexOf('\n];', at)
  if (at < 0 || end < 0) throw new Error('demo 里找不到 INBOX 数组')
  const literal = demo.slice(at + 'const INBOX='.length, end + 2)
  return new Function(`return ${literal}`)() as DemoEntry[]
}

const call = <T>(win: Page, method: string, params: unknown) => win.evaluate(
  ([m, p]) => (window as unknown as MeridianWindow).meridian.call(m as string, p) as Promise<T>,
  [method, params] as const,
)

const inboxFromCore = (win: Page) =>
  call<{
    id: string; watch: string; source: string; paper: string; downloaded: boolean; pdf: string
  }[]>(win, 'inbox.list', {})
const discoveryFromCore = (win: Page) =>
  call<{ id: string; project: string; reasons: { label: string }[] }[]>(
    win, 'inbox.list', { kind: 'discovery' },
  )
const laterFromCore = (win: Page) =>
  call<{ id: string; source: string; day: string }[]>(win, 'later.list', {})
const watchesFromCore = (win: Page) =>
  call<{
    id: string; type: 'topic' | 'author'; name: string; active: boolean
    identity?: { source: 'semantic-scholar'; id: string; affiliations: string[] }
  }[]>(win, 'watch.list', {})

/** Bypass the interface and call `papers.get` directly, and ask the library if this article is available. */
const inLibrary = (win: Page, id: string) => win.evaluate((paper) =>
  (window as unknown as MeridianWindow).meridian.call('papers.get', { id: paper })
    .then(() => true, () => false), id)
const trashFromCore = (win: Page) =>
  call<{ id: string; kind: string; title: string }[]>(win, 'trash.list', {})
const paperTotal = (win: Page) =>
  call<{ total: number }>(win, 'papers.list', { page: 1, size: 1 }).then((r) => r.total)

const KIND: Record<'topic' | 'author', string> = { topic: '主题', author: '作者' }

/** Press Enter twice to fill in the topic name of the use case. */
const TWICE_WATCH = '两下回车的主题'

const openInbox = (win: Page, scope: string) => win.locator(`[data-inbox="${scope}"]`).click()
const cardTitles = (win: Page) => shown(win, '.pcard h3').allTextContents()

/** Push configuration only lives in the global settings; the small gear on the inbox screen directly opens the corresponding category. */
async function openDeliverySettings(win: Page) {
  await openInbox(win, 'all')
  await shown(win, '[title="关注设置"]').click()
  await expect(win.locator('.setdlg')).toBeVisible()
  await expect(settings(win, '[data-setcat="delivery-watch"]')).toHaveClass(/\bon\b/)
}

/** Titles of the collapsible groups the cards are listed under, in page order. */
function groupTitles(win: Page): Promise<string[]> {
  return shown(win, '.collapsible-group-title').allTextContents()
}

test('侧栏「论文推送」进推送屏,条目、分组与正文都照 demo', async ({ win }) => {
  const demo = inboxFromDemo()
  expect(demo.length).toBeGreaterThan(0)
  expect((await inboxFromCore(win)).map((e) => e.id)).toEqual(demo.map((d) => d.id))

  await openInbox(win, 'all')
  await expect(win.locator('[data-inbox="discovery"]')).toContainText('发现')
  await expect(win.locator('[data-disc="topics"]')).toContainText('关注·主题')
  await expect(win.locator('[data-disc="authors"]')).toContainText('关注·作者')
  await expect(win.locator('#crumb .cseg')).toHaveText(['收件', '论文推送'])
  await expect(shown(win, '.desk-head .t')).toHaveText(`论文推送 · ${demo.length}`)
  await expect(shown(win, '.pcard')).toHaveCount(demo.length)
  expect(await cardTitles(win)).toEqual(demo.map((d) => d.title))

  // One article focuses on one paragraph, and "ignore all" only hangs on the first paragraph.
  const watches = await watchesFromCore(win)
  const heads = [...new Set(demo.map((d) => d.watch))].map((id) => {
    const w = watches.find((x) => x.id === id)!
    return `${KIND[w.type]} · ${w.name}`
  })
  expect(await groupTitles(win)).toEqual(heads)
  await expect(shown(win, '.collapsible-group-actions .btn')).toHaveCount(1)

  // Every paragraph of the first card is word-for-word identical to the original text of the demo.
  const card = shown(win, '.pcard').first()
  const text = (sel: string) => card.locator(sel).evaluate((el) => el.textContent ?? '')
  expect(await text('h3')).toBe(demo[0]!.title)
  expect(await text('.pm')).toBe(demo[0]!.authors + demo[0]!.venue)
  expect(await text('.pabs')).toBe(demo[0]!.abs)
  expect(await text('.prec')).toBe(demo[0]!.rec)
  expect(await card.locator('.plabel').allTextContents()).toEqual(['Abstract', '推荐理由'])
})

test('关注与项目发现是两条流,发现解释来源并接受显式反馈', async ({ win }) => {
  await openInbox(win, 'discovery')
  await expect(win.locator('[data-inbox="discovery"]')).toHaveClass(/\bon\b/)
  await expect(shown(win, '.desk-head .t')).toHaveText('论文发现 · 0')
  await shown(win, '.desk-head .btn').filter({ hasText: '刷新发现' }).click()

  await expect.poll(async () => (await discoveryFromCore(win)).length).toBeGreaterThan(0)
  await expect(shown(win, '.pcard').first()).toBeVisible()
  await expect(shown(win, '.pcard').first().locator('.prec')).toContainText('来自项目')
  await expect(shown(win, '.collapsible-group-title').first()).toContainText('项目 ·')
  // Discovery lists its projects under the sidebar row; picking one shows only that project's papers.
  const byProject = new Map<string, number>()
  for (const entry of await discoveryFromCore(win)) byProject.set(entry.project, (byProject.get(entry.project) ?? 0) + 1)
  await expect(win.locator('[data-discovery-project]')).toHaveCount(byProject.size)
  const [firstProject, firstCount] = [...byProject.entries()][0]!
  await win.locator(`[data-discovery-project="${firstProject}"]`).click()
  await expect(win.locator(`[data-discovery-project="${firstProject}"]`)).toHaveClass(/\bon\b/)
  await expect(shown(win, '.pcard')).toHaveCount(firstCount)
  await expect(shown(win, '.collapsible-group')).toHaveCount(1)
  await openInbox(win, 'discovery')

  const first = shown(win, '.pcard').first()
  await first.locator('[title="更多类似"]').click()
  await expect(first.locator('[title="更多类似"]')).toHaveClass(/\bon\b/)

  const before = (await discoveryFromCore(win)).length
  await shown(win, '.pcard').nth(1).locator('[title="减少类似"]').click()
  await expect.poll(async () => (await discoveryFromCore(win)).length).toBe(before - 1)
})

test('按主题与作者各筛一档,面包屑与条数都跟着换', async ({ win }) => {
  const entries = await inboxFromCore(win)
  const counted = (await watchesFromCore(win)).map((w) => ({
    ...w, n: entries.filter((e) => e.watch === w.id).length,
  }))
  // At least the number of entries in the two levels is different, otherwise this test will have no discernible effect on screening.
  expect(new Set(counted.map((c) => c.n)).size).toBeGreaterThan(1)

  for (const w of counted) {
    await openInbox(win, w.id)
    await expect(win.locator('#crumb .cseg')).toHaveText(['收件', KIND[w.type], w.name])
    await expect(shown(win, '.desk-head .t')).toHaveText(`${KIND[w.type]} · ${w.name} · ${w.n} 篇`)
    await expect(shown(win, '.pcard')).toHaveCount(w.n)
    // There is only one paragraph header in one gear, and it is this concern that is written; only empty states are displayed in the gaps.
    await expect(shown(win, '.collapsible-group')).toHaveCount(w.n === 0 ? 0 : 1)
    await expect(shown(win, '.empty-state')).toHaveCount(w.n === 0 ? 1 : 0)
    if (w.n > 0) expect(await groupTitles(win)).toEqual([`${KIND[w.type]} · ${w.name}`])
    await expect(win.locator(`[data-watchrow="${w.id}"]`)).toHaveClass(/\bon\b/)
  }
})

test('忽略一条:它进垃圾桶,恢复后回到推送屏原来的位置', async ({ win }) => {
  await openInbox(win, 'all')
  // allTextContents will not retry itself. It will wait for all the cards in this file to be drawn before reading.
  await expect(shown(win, '.pcard')).toHaveCount((await inboxFromCore(win)).length)
  const order = await cardTitles(win)
  const dropped = order[1]!

  await shown(win, '.pcard').nth(1).locator('[title="忽略"]').click()
  await expect(shown(win, '.pcard')).toHaveCount(order.length - 1)
  expect(await cardTitles(win)).toEqual(order.filter((t) => t !== dropped))

  // Re-retrieve the number and compare it: it is really in the trash, not just missing from the interface
  const trash = await trashFromCore(win)
  expect(trash).toHaveLength(1)
  expect(trash[0]).toMatchObject({ kind: 'inbox', title: dropped })
  expect(await inboxFromCore(win)).toHaveLength(order.length - 1)

  await win.locator('[data-desk="trash"]').click()
  await expect(shown(win, '.section-heading')).toHaveText('论文推送 · 1清空垃圾桶')
  await expect(win.locator('.tgroup .trow .tt2')).toHaveText([dropped])
  await win.locator('.tgroup .trow .btn', { hasText: '恢复' }).click()

  await openInbox(win, 'all')
  await expect(shown(win, '.pcard')).toHaveCount(order.length)
  expect(await cardTitles(win)).toEqual(order)
  expect(await trashFromCore(win)).toHaveLength(0)
})

test('「全部忽略」清空这一档,清完出空态,忽略的都在垃圾桶里', async ({ win }) => {
  await openInbox(win, 'all')
  await expect(shown(win, '.pcard')).toHaveCount((await inboxFromCore(win)).length)
  const titles = await cardTitles(win)

  await shown(win, '.collapsible-group-actions .btn').filter({ hasText: '全部忽略' }).click()
  await expect(shown(win, '.pcard')).toHaveCount(0)
  await expect(shown(win, '.empty-state')).toHaveCount(1)
  await expect(shown(win, '.desk-head .t')).toHaveText('论文推送 · 0')

  const trash = await trashFromCore(win)
  expect(trash.map((t) => t.title).sort()).toEqual([...titles].sort())
  expect(trash.every((t) => t.kind === 'inbox')).toBe(true)
  await expect(win.locator('#rowInboxAll .n')).toHaveText('')
})

test('入库:论文进库,按钮就地变开始阅读', async ({ win }) => {
  await openInbox(win, 'all')
  await expect(shown(win, '.pcard')).toHaveCount((await inboxFromCore(win)).length)
  const before = await paperTotal(win)
  const title = (await cardTitles(win))[0]!

  const card = shown(win, '.pcard').first()
  await card.locator('[title="下载并入库"]').click()
  await expect(card.locator('[title="开始阅读"]')).toHaveCount(1)
  await expect(win.locator('#toast')).toHaveText('已下载入库 · 可阅读')
  await expect(card.locator('[title="下载并入库"]')).toHaveCount(0)

  expect(await paperTotal(win)).toBe(before + 1)
  expect((await inboxFromCore(win)).filter((e) => e.downloaded)).toHaveLength(1)
  await expect(win.locator('[data-desk="papers"] .n')).toHaveText(String(before + 1))

  // Which article is included: filter the paper list by title, and it will be in the row.
  await win.locator('[data-desk="papers"]').click()
  await win.locator('#libq').fill(title.slice(0, 24))
  await expect(win.locator('.ptable tbody tr .pt-title .ci')).toHaveText([title])
})

test('入库撞上库里已有的那一篇:不重复入库,就地给出打开那一篇的入口', async ({ win }) => {
  const entries = await call<{ id: string; title: string; paper: string }[]>(win, 'inbox.list', {})
  // The library already has that push for that article: the same content is derived from the same paper ID.
  const dup = (await Promise.all(entries.map(async (e) =>
    ({ e, known: await inLibrary(win, e.paper) })))).find((x) => x.known)!.e
  const known = await call<{ title: string }>(win, 'papers.get', { id: dup.paper })
  const before = await paperTotal(win)

  await openInbox(win, 'all')
  const card = shown(win, `.pcard[data-pid="${dup.id}"]`)
  await card.locator('[title="下载并入库"]').click()

  await expect(win.locator('#toast')).toHaveText('库里已经有这一篇 · 没有重复入库')
  await expect(card.locator('.pdup span')).toHaveText(`库里已经有这一篇：「${known.title}」`)
  // There are not many items in the library, and this one has not been recorded as being in the library.
  expect(await paperTotal(win)).toBe(before)
  expect((await inboxFromCore(win)).find((e) => e.id === dup.id)?.downloaded).toBe(false)

  // That entrance really opens up Curry’s article: the title of Curry’s page is written in the header of the reader.
  await card.locator('.pdup .btn', { hasText: '打开' }).click()
  await expect(win.locator('#crumb .cseg').last()).toHaveText(known.title.split(':')[0]!)
})

test.describe('这一条推送已经在别处入过库', () => {
  // Core's `jobs.status()` is polled every second (useJobs.ts) and bumps the vault revision on any
  // external write, including this test's own bypass call; off-screen windows only paint that update
  // once per second, so the click racing the stale card can lose to the poll there but not on screen.
  test.use({ showWindow: true })

  test('界面上还没刷新时再点「入库」:报进 toast 而不是 .ipcerror', async ({ win }) => {
    const entries = await inboxFromCore(win)
    const fresh = (await Promise.all(entries.filter((e) => !e.downloaded).map(async (e) =>
      ({ e, known: await inLibrary(win, e.paper) })))).find((x) => !x.known)!.e

    await openInbox(win, 'all')
    const card = shown(win, `.pcard[data-pid="${fresh.id}"]`)
    await expect(card.locator('[title="下载并入库"]')).toHaveCount(1)

    // Bypass the interface and store it directly: core records that it has been stored in the library. The interface has not retrieved it yet, and the card is still displayed as not stored in the library.
    await call(win, 'inbox.download', { id: fresh.id })

    await card.locator('[title="下载并入库"]').click()
    await expect(win.locator('#toast')).toHaveText(`这一条已经入库:${fresh.id}`)
    await expect(shown(win, '.ipcerror')).toHaveCount(0)
  })
})

test('下载并入库时显示进度环,完成后就地变成开始阅读', async ({ win }) => {
  await openInbox(win, 'all')
  const card = shown(win, '.pcard[data-pid="drafterlite"]')
  await card.locator('[title="下载并入库"]').click()
  await expect(card.locator('.icbtn.busy[title="从 arXiv 下载中"] .ring')).toHaveCount(1)
  await expect(card.locator('[title="开始阅读"]')).toHaveCount(1, { timeout: 10_000 })
  await expect(card.locator('.ring')).toHaveCount(0)
  expect((await inboxFromCore(win)).find((entry) => entry.id === 'drafterlite')?.downloaded).toBe(true)
})

test('下载失败在卡片内给原因和重试,不占用全页错误', async ({ win }) => {
  await openInbox(win, 'all')
  const card = shown(win, '.pcard[data-pid="sequoia2"]')
  await card.locator('[title="下载并入库"]').click()
  await expect(card.locator('.pfail span')).toHaveText('没能下载原文:服务器返回 503')
  await expect(card.locator('[title="下载并入库"]')).toHaveCount(1)
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  await card.locator('.pfail .btn', { hasText: '重试' }).click()
  await expect(card.locator('.pfail span')).toHaveText('没能下载原文:服务器返回 503')
})

test('检查新论文按关注抓取一次,新论文进入相应分组且标题栏记下时间', async ({ win }) => {
  await openInbox(win, 'all')
  const before = await inboxFromCore(win)
  await shown(win, '.desk-head .btn').filter({ hasText: '检查新论文' }).click()
  await expect(shown(win, '.pcard')).toHaveCount(before.length + 2)
  await expect(shown(win, '.desk-head .fetchnote')).toHaveText(/^上次检查 \d+\/\d+ \d{2}:\d{2}$/)
  expect((await cardTitles(win))[0]).toBe('Tree Width in Batched Serving')
  const fresh = shown(win, '.pcard').filter({ hasText: 'Tree Width in Batched Serving' })
  await expect(fresh.locator('.plabel')).toHaveText(['Abstract'])
  await expect(win.locator('#rowInboxAll .n')).toHaveText(String(before.length + 2))
})

test('存入稍后阅读:离开推送屏,排到队首,再移出', async ({ win }) => {
  const queued = await laterFromCore(win)
  const watches = await watchesFromCore(win)

  await win.locator('#rowLater').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['收件', '稍后阅读'])
  await expect(shown(win, '.desk-head .t')).toHaveText(`稍后阅读 · ${queued.length}`)
  await expect(shown(win, '.pcard')).toHaveCount(queued.length)

  // The segments grouped by time are the segments calculated by Curry, and those grouped by source are the origins recorded when joining the team.
  // Unlike sectionHeads' targets, the grouping switch now lives in the page header, so a day heading's
  // text is already clean and needs no control-label stripping.
  const heads = (key: 'day' | 'source') => [...new Set(queued.map((e) => e[key]))]
    .map((k) => `${k} · ${queued.filter((e) => e[key] === k).length}`)
  expect(await shown(win, '.day-heading').allTextContents()).toEqual(heads('day'))
  await shown(win, '.segmented-control>button').filter({ hasText: '按来源' }).click()
  await expect(shown(win, '.segmented-control>button').filter({ hasText: '按来源' })).toHaveClass(/\bon\b/)
  expect(await shown(win, '.day-heading').allTextContents()).toEqual(heads('source'))

  await openInbox(win, 'all')
  const entries = await inboxFromCore(win)
  await expect(shown(win, '.pcard')).toHaveCount(entries.length)
  const first = entries[0]!
  const title = (await cardTitles(win))[0]!
  await shown(win, '.pcard').first().locator('[title="稍后阅读"]').click()
  await expect(shown(win, '.pcard')).toHaveCount(entries.length - 1)

  await win.locator('#rowLater').click()
  await expect(shown(win, '.desk-head .t')).toHaveText(`稍后阅读 · ${queued.length + 1}`)
  await expect(shown(win, '.pcard h3').first()).toHaveText(title)
  const watched = watches.find((w) => w.id === first.watch)!
  expect((await laterFromCore(win))[0]).toMatchObject({
    id: first.id, day: '今天', source: `${KIND[watched.type]} · ${watched.name}`,
  })

  await shown(win, '.pcard').first().locator('[title="移出"]').click()
  await expect(shown(win, '.desk-head .t')).toHaveText(`稍后阅读 · ${queued.length}`)
  expect((await laterFromCore(win)).map((e) => e.id)).toEqual(queued.map((e) => e.id))
})

test('稍后阅读里有原文地址的条目可以直接开始阅读并在需要时先下载', async ({ win }) => {
  const queued = await call<{ id: string; paper: string; downloaded: boolean; pdf?: string }[]>(win, 'later.list', {})
  const entries = await call<{ id: string; paper: string; downloaded: boolean }[]>(win, 'inbox.list', {})
  const readable = new Set(queued.filter((entry) => entry.downloaded || entry.pdf !== undefined)
    .map((entry) => entry.id))

  await win.locator('#rowLater').click()
  await expect(shown(win, '.pcard')).toHaveCount(queued.length)
  for (const entry of queued) {
    await expect(shown(win, `.pcard[data-pid="${entry.id}"] [title="开始阅读"]`))
      .toHaveCount(readable.has(entry.id) ? 1 : 0)
  }
  // There are quite a few queues, but the only thing missing is the entrance to the reader.
  await expect(shown(win, '.pcard [title="移出"]')).toHaveCount(queued.length)

  // In the inbox, download the same article pointed to by the queue into the database, and the item on the queue will appear and "start reading"
  const shared = queued.find((e) => !e.downloaded
    && entries.some((x) => x.id === e.id && !x.downloaded))!
  const source = entries.find((x) => x.paper === shared.paper)!
  await openInbox(win, 'all')
  await shown(win, `.pcard[data-pid="${source.id}"] [title="下载并入库"]`).click()
  await expect(shown(win, `.pcard[data-pid="${source.id}"] [title="开始阅读"]`)).toHaveCount(1)

  await win.locator('#rowLater').click()
  await expect(shown(win, `.pcard[data-pid="${shared.id}"] [title="开始阅读"]`)).toHaveCount(1)
  await expect(shown(win, '.pcard [title="开始阅读"]')).toHaveCount(readable.size)
})

test('关注管理:暂停、添加与移除都实时改侧栏与推送屏', async ({ win }) => {
  await openDeliverySettings(win)

  const watches = await watchesFromCore(win)
  await expect(settings(win, '.wrow')).toHaveCount(watches.length)
  await expect(settings(win, '.section-heading')).toContainText(['主题', '作者'])

  // The category now has its own page-level heading above the two watch-type groups, so scope to the
  // group variant specifically: the first group (topics) is free of a line, the second (authors) draws one.
  const groupHeads = settings(win, '.section-heading--group')
  await expect(groupHeads.nth(0)).toHaveCSS('font-size', '15px')
  await expect(groupHeads.nth(0)).toHaveCSS('border-top-width', '0px')
  await expect(groupHeads.nth(1)).toHaveCSS('font-size', '15px')
  await expect(groupHeads.nth(1)).toHaveCSS('border-top-width', '1px')

  // Pause: The line turns gray, the corner icon is retracted, and the captured push is still there.
  const entriesBefore = await inboxFromCore(win)
  const kept = entriesBefore.filter((e) => e.watch === 'spec').length
  const spec = settings(win, '.wrow').filter({ hasText: 'speculative decoding' })
  await spec.locator('.btn', { hasText: '暂停' }).click()
  await expect(spec.locator('.src')).toHaveText('已暂停')
  await expect(win.locator('[data-watchrow="spec"]')).toHaveClass(/\bdim\b/)
  await expect(win.locator('[data-watchrow="spec"] .n')).toHaveCount(0)
  expect((await inboxFromCore(win)).filter((e) => e.watch === 'spec')).toHaveLength(kept)
  await spec.locator('.btn', { hasText: '恢复' }).click()
  await expect(win.locator('[data-watchrow="spec"]')).not.toHaveClass(/\bdim\b/)

  // Added: Add one more row to the "Topic" group in the sidebar, and the group count will increase accordingly.
  const topics = watches.filter((w) => w.type === 'topic').length
  await settings(win, '.section-heading').filter({ hasText: '主题' }).locator('.btn').click()
  await expect(settings(win, '.wrow')).toHaveCount(watches.length + 1)
  // The two groups are tiled sibling nodes. The placeholder for the topic group is followed by the lines for the author group, so press to identify it, not .last()
  await expect(settings(win, '.wrow').nth(topics)).toHaveClass(/\bnewrow\b/)
  await settings(win, '.wrow.newrow input').fill('kv cache')
  await settings(win, '.wrow.newrow input').press('Enter')
  await expect(settings(win, '.wrow.newrow')).toHaveCount(0)
  await expect(settings(win, '.wrow')).toHaveCount(watches.length + 1)
  await expect(win.locator('#g-topics .srow')).toHaveCount(topics + 1)
  await expect(win.locator('[data-disc="topics"] .n')).toHaveText(String(topics + 1))

  // Removed: the sidebar row disappears, and its own pushes are cleared with it (the confirm dialog's
  // own wording says so); other watches' pushes are untouched.
  expect(kept).toBeGreaterThan(0)
  await spec.locator('.btn', { hasText: '移除' }).click()
  // Removing a watch is destructive, so it now confirms first (ConfirmDialog.tsx).
  await win.locator('.cfpop .dlg-a>*').last().click()
  await expect(win.locator('[data-watchrow="spec"]')).toHaveCount(0)
  const survivors = entriesBefore.filter((e) => e.watch !== 'spec')
  await expect.poll(async () => (await inboxFromCore(win)).map((e) => e.id))
    .toEqual(survivors.map((e) => e.id))
  await win.keyboard.press('Escape')
  await openInbox(win, 'all')
  await expect(shown(win, '.pcard')).toHaveCount(survivors.length)
  expect(await groupTitles(win)).toEqual([...new Set(survivors.map((e) => e.source))])
})

test('关注管理:占位行按 Esc 撤掉,屏上没有旧的圆角添加框', async ({ win }) => {
  await openDeliverySettings(win)
  const watches = await watchesFromCore(win)
  await expect(settings(win, '.wrow')).toHaveCount(watches.length)

  // Esc removes the placeholder; there is no old rounded corner added box on this screen.
  await settings(win, '.section-heading').filter({ hasText: '作者' }).locator('.btn').click()
  await expect(settings(win, '.wrow')).toHaveCount(watches.length + 1)
  // The placeholder is wearing .wrow clothes: when it is turned on, the attention line on this screen is still the same height.
  expect(await uniqueHeights(settings(win, '.wrow'))).toHaveLength(1)
  await settings(win, '.wrow.newrow input').press('Escape')
  await expect(settings(win, '.wrow.newrow')).toHaveCount(0)
  await expect(settings(win, '.wrow')).toHaveCount(watches.length)
  await expect(settings(win, '.mgr-add')).toHaveCount(0)
})

test('作者关注先用机构消歧,确认后保存稳定作者身份', async ({ win }) => {
  await openDeliverySettings(win)
  await settings(win, '.section-heading').filter({ hasText: '作者' }).locator('.btn').click()
  await settings(win, '.wrow.newrow input').fill('Alex Kim')

  await expect(settings(win, '.author-match')).toHaveCount(3)
  await expect(settings(win, '.author-match')).toContainText([
    'Massachusetts Institute of Technology', 'Stanford University', 'Carnegie Mellon University',
  ])
  await settings(win, '.author-match').nth(1).locator('.btn', { hasText: '关注' }).click()

  await expect(settings(win, '.wrow.newrow')).toHaveCount(0)
  const added = (await watchesFromCore(win)).find((item) => item.name === 'Alex Kim')
  expect(added).toMatchObject({
    type: 'author',
    identity: { source: 'openalex', affiliations: ['Stanford University'] },
  })
  const row = settings(win, `.wrow[data-w="${added!.id}"]`)
  await expect(row.locator('.author-id-state')).toHaveText('Stanford University')
})

test('关注建议可从一句话或项目画像生成主题与稳定作者', async ({ win }) => {
  await openDeliverySettings(win)
  const section = settings(win, '.watch-suggestions')
  await expect(section).not.toContainText('不调用模型')

  await section.locator('input').fill('我想关注批量推理中的动态验证与草稿树')
  await section.locator('.btn.pri').click()
  await expect(section.locator('.watch-suggestion-group')).toHaveCount(2)
  await expect(section).toContainText('efficient inference')
  await expect(section).toContainText('h-index')

  const suggestedTopic = section.locator('.watch-suggestion-row')
    .filter({ hasText: 'efficient inference' }).first()
  await suggestedTopic.locator('.btn', { hasText: '添加' }).click()
  await expect.poll(async () => (await watchesFromCore(win))
    .some((item) => item.type === 'topic' && item.name === 'efficient inference')).toBe(true)

  const projectResult = await call<{
    topics: { name: string }[]; authors: { id: string }[]; paperCount: number
  }>(win, 'watch.suggest', { source: 'project', projectId: 'draft' })
  expect(projectResult.paperCount).toBeGreaterThan(0)
  expect(projectResult.topics.map((item) => item.name)).toContain('speculative decoding')
  expect(projectResult.authors[0]?.id).toBeTruthy()

  await section.locator('.watch-suggestion-source .btn', { hasText: '从项目生成' }).click()
  await section.locator('.btn.pri').click()
  await expect(section.locator('.watch-suggestion-row').first()).toBeVisible()
})

test('关注可原地编辑:保留原 id、暂停状态与已经收到的论文', async ({ win }) => {
  await openDeliverySettings(win)
  const before = await watchesFromCore(win)
  const inboxIds = (await inboxFromCore(win)).map((entry) => entry.id)

  const topic = before.find((item) => item.type === 'topic')!
  const topicRow = settings(win, `.wrow[data-w="${topic.id}"]`)
  await topicRow.locator('.btn', { hasText: '编辑' }).click()
  await settings(win, `.wrow.editrow[data-w="${topic.id}"] input`).fill(`${topic.name} updated`)
  await settings(win, `.wrow.editrow[data-w="${topic.id}"] input`).press('Enter')
  await expect(settings(win, `.wrow[data-w="${topic.id}"] .nm`)).toHaveText(`${topic.name} updated`)

  const authorWatch = before.find((item) => item.type === 'author')!
  const authorRow = settings(win, `.wrow[data-w="${authorWatch.id}"]`)
  await authorRow.locator('.btn', { hasText: '编辑' }).click()
  await settings(win, `.wrow.editrow[data-w="${authorWatch.id}"] input`).fill(`${authorWatch.name} Lab`)
  await settings(win, '.author-resolver-actions .btn').click()
  await expect(settings(win, `.wrow[data-w="${authorWatch.id}"] .nm`)).toHaveText(`${authorWatch.name} Lab`)

  const after = await watchesFromCore(win)
  expect(after.find((item) => item.id === topic.id)).toMatchObject({
    id: topic.id, name: `${topic.name} updated`, active: topic.active,
  })
  expect(after.find((item) => item.id === authorWatch.id)).toMatchObject({
    id: authorWatch.id, name: `${authorWatch.name} Lab`, active: authorWatch.active,
  })
  expect(after.find((item) => item.id === authorWatch.id)?.identity).toBeUndefined()
  expect((await inboxFromCore(win)).map((entry) => entry.id)).toEqual(inboxIds)
})

/** The browser's default style and the style given by the rules are completely different for the items actually worn in the input box. */
const inputShape = (input: Locator): Promise<Record<string, string>> => input.evaluate((el) => {
  const s = getComputedStyle(el)
  return {
    border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
    background: s.backgroundColor,
    radius: s.borderTopLeftRadius,
    // Read the left side only: #libq is now a ClearableInput whose trailing clear button legitimately
    // widens its own right padding, so the shared "same outfit" side is the one without that button.
    padding: `${s.paddingTop} ${s.paddingLeft}`,
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
  }
})

test('论文表的筛选框与关注屏的一句话添加框穿同一件衣服', async ({ win }) => {
  await openDeliverySettings(win)
  const twin = await inputShape(settings(win, '.af-in input'))

  await win.keyboard.press('Escape')
  await gotoPapers(win)
  const filter = await inputShape(win.locator('#libq'))

  console.log(`一句话添加框 ${JSON.stringify(twin)},筛选框 ${JSON.stringify(filter)}`)
  expect(twin.radius, '两边一起掉回浏览器默认样式时,只比两边相等是比不出来的').not.toBe('0px')
  expect(filter).toEqual(twin)
})

test('关注管理:同一时间只开一个占位,点另一组的加号先收掉上一个', async ({ win }) => {
  await openDeliverySettings(win)
  const watches = await watchesFromCore(win)
  await expect(settings(win, '.wrow')).toHaveCount(watches.length)

  await settings(win, '.section-heading').filter({ hasText: '主题' }).locator('.btn').click()
  await settings(win, '.wrow.newrow input').fill('还没提交的字')
  await settings(win, '.section-heading').filter({ hasText: '作者' }).locator('.btn').click()

  // The author group is ranked after the theme group, and its place is the last line on the screen; the theme group line and the words inside are closed together.
  await expect(settings(win, '.wrow.newrow')).toHaveCount(1)
  await expect(settings(win, '.wrow')).toHaveCount(watches.length + 1)
  await expect(settings(win, '.wrow').last()).toHaveClass(/\bnewrow\b/)
  await expect(settings(win, '.wrow.newrow input')).toHaveValue('')
})

test('关注管理:两下快回车只建出一条关注', async ({ win }) => {
  await openDeliverySettings(win)
  const watches = await watchesFromCore(win)
  await expect(settings(win, '.wrow')).toHaveCount(watches.length)

  const topics = watches.filter((w) => w.type === 'topic').length
  await settings(win, '.section-heading').filter({ hasText: '主题' }).locator('.btn').click()
  await settings(win, '.wrow.newrow input').fill(TWICE_WATCH)
  // The placeholder cannot be removed until the writing comes back. It and the words inside are still there until the writing comes back. core may have been written between two presses,
  // Then there is no chance of this competition; two keydowns sent to the same task will definitely collide, and the second keydown will be placed on the placeholder that has not yet been written.
  await settings(win, '.wrow.newrow input').evaluate((el) => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })

  await expect(settings(win, '.wrow.newrow')).toHaveCount(0)
  await expect(settings(win, '.wrow')).toHaveCount(watches.length + 1)
  await expect(win.locator('#g-topics .srow')).toHaveCount(topics + 1)
  expect((await watchesFromCore(win)).filter((w) => w.name === TWICE_WATCH)).toHaveLength(1)
})

test.describe('关注管理:切到别的应用', () => {
  // The window must be on the screen and take the system focus before the blur() of the main process can take the focus.
  test.use({ showWindow: true })

  test('切到别的应用不算放弃:占位与打好的字都留着', async ({ app, win }) => {
    await openDeliverySettings(win)
    await settings(win, '.section-heading').filter({ hasText: '主题' }).locator('.btn').click()
    const input = settings(win, '.wrow.newrow input')
    await input.fill('切走之前打的字')
    await expect(input).toBeFocused()
    // Turn off Playwright's focus simulation: when it is turned on, the page always assumes that it has focus, and the real window is out of focus and cannot be transmitted.
    const cdp = await win.context().newCDPSession(win)
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false })
    // Pull the window to the foreground and wait until it really gets the system focus before the subsequent blur() can lose focus.
    await app.evaluate(({ BrowserWindow }) => {
      const target = BrowserWindow.getAllWindows()[0]!
      target.show()
      target.focus()
    })
    await expect.poll(() => win.evaluate(() => document.hasFocus()), {
      message: '窗口没有真的拿到系统焦点,后面的 blur() 无从谈起',
    }).toBe(true)
    await input.evaluate((el) => {
      const seen: (string | null)[] = []
      ;(window as unknown as { focusouts: (string | null)[] }).focusouts = seen
      el.addEventListener('focusout', (e) => {
        const to = (e as FocusEvent).relatedTarget
        seen.push(to instanceof Element ? to.tagName : null)
      })
    })

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.blur())

    await expect.poll(() => win.evaluate(() => (window as unknown as { focusouts: (string | null)[] }).focusouts))
      .toEqual([null])
    await expect(settings(win, '.wrow.newrow')).toHaveCount(1)
    await expect(input).toHaveValue('切走之前打的字')
  })
})

test('侧栏角标数的都是库里的真实数量', async ({ win }) => {
  const entries = await inboxFromCore(win)
  const watches = await watchesFromCore(win)
  const queued = await laterFromCore(win)
  const count = (id: string) => entries.filter((e) => e.watch === id).length

  const badges: [string, number][] = [
    ['#rowInboxAll .n', entries.length],
    ['[data-disc="topics"] .n', watches.filter((w) => w.type === 'topic').length],
    ['[data-disc="authors"] .n', watches.filter((w) => w.type === 'author').length],
    ['#rowLater .n', queued.length],
    ...watches.map((w): [string, number] => [`[data-watchrow="${w.id}"] .n`, count(w.id)]),
  ]
  // At least two different numbers, otherwise this test will not be able to distinguish between subscripts.
  expect(new Set(badges.map(([, n]) => n)).size).toBeGreaterThan(1)

  for (const [sel, n] of badges) {
    // The empty subscript is hidden by CSS, and the text is an empty string, consistent with the demo's `n||''`
    await expect(win.locator(sel)).toHaveText(n === 0 ? '' : String(n))
  }
})
