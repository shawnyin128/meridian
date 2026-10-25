import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { minimalPdf } from '../apps/desktop/src/core/net/minimal-pdf.js'
import { appSwitcher, expect, gotoPapers, test, type MeridianWindow } from './app.js'

/** Screens stay mounted once visited, so selectors every screen has, such as cards, are scoped to the visible one. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)
const settings = (win: Page, sel: string) => win.locator(`.setdlg ${sel}`)

const DEMO = resolve(import.meta.dirname, 'fixtures/platform-shell-demo.html')

/** The responses fixture mode serves instead of the network, by URL. */
const CANNED_NET = JSON.parse(readFileSync(
  resolve(import.meta.dirname, '../apps/desktop/src/core/fixtures/net.json'), 'utf8',
)) as Record<string, { pdf?: { title?: string; lines: string[] } }>

/** One Inmail entry of the demo, with field names spelled as in the demo so they compare side by side. */
type DemoEntry = {
  id: string; watch: string; title: string; authors: string; venue: string; abs: string; rec: string
}

/**
 * Evaluates the demo's INBOX array as is. Expected values come from the demo itself rather than being
 * copied by hand; the array is a self-contained literal that references nothing else in the demo.
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

/** The other streams that list an entry, as Core answers them. */
type Also = { also?: { kind: 'watch' | 'discovery'; id: string }[] }
const inboxFromCore = (win: Page) =>
  call<({
    id: string; watch: string; source: string; paper: string; downloaded: boolean; pdf: string
  } & Also)[]>(win, 'inbox.list', {})
const discoveryFromCore = (win: Page) =>
  call<({ id: string; project: string; reasons: { label: string }[] } & Also)[]>(
    win, 'inbox.list', { kind: 'discovery' },
  )
/** The ids of the watches, or the projects, that list `entry`: the one that delivered it first, then the others. */
const listedUnder = (entry: { watch?: string; project?: string } & Also, kind: 'watch' | 'discovery') => [
  ...(kind === 'watch' ? [entry.watch ?? ''] : [entry.project ?? '']).filter((id) => id !== ''),
  ...(entry.also ?? []).filter((stream) => stream.kind === kind).map((stream) => stream.id),
]
const laterFromCore = (win: Page) =>
  call<{ id: string; source: string; day: string }[]>(win, 'later.list', {})
const watchesFromCore = (win: Page) =>
  call<{
    id: string; type: 'topic' | 'author'; name: string; active: boolean
    identity?: { source: 'semantic-scholar'; id: string; affiliations: string[] }
  }[]>(win, 'watch.list', {})

/** Calls `papers.get` directly, bypassing the UI, to ask whether the vault has this paper. */
const inLibrary = (win: Page, id: string) => win.evaluate((paper) =>
  (window as unknown as MeridianWindow).meridian.call('papers.get', { id: paper })
    .then(() => true, () => false), id)
const trashFromCore = (win: Page) =>
  call<{ id: string; kind: string; title: string }[]>(win, 'trash.list', {})
const paperTotal = (win: Page) =>
  call<{ total: number }>(win, 'papers.list', { page: 1, size: 1 }).then((r) => r.total)

const KIND: Record<'topic' | 'author', string> = { topic: '关键词', author: '作者' }

/** The kind word the fixture's inbox entries were stored with; an entry keeps the source text it was written with. */
const STORED_KIND: Record<'topic' | 'author', string> = { topic: '主题', author: '作者' }

/** The topic name typed in the press-Enter-twice test case. */
const TWICE_WATCH = '两下回车的主题'

/**
 * Clicks a sidebar Inbox row's own button: a plain row is that button, while a composite row, such
 * as the one for all deliveries, holds it as its label beside a fold caret that must not take the click.
 */
const openInbox = (win: Page, scope: string) =>
  win.locator(`button[data-inbox="${scope}"], [data-inbox="${scope}"] > .nav-row-label`).click()

/** Clicks a button in a row's actions slot as a pointer does: the slot takes clicks only while its row is hovered. */
async function rowAction(host: Locator, label: string) {
  await host.hover()
  await host.locator(`.row-actions [aria-label="${label}"]`).click()
}

/** A stored source as the UI shows it: a topic watch's source stored with its STORED_KIND word shows its KIND word. */
const shownSource = (source: string) => (source.startsWith('主题 · ') ? `关键词${source.slice(2)}` : source)
const cardTitles = (win: Page) => shown(win, '.pcard h3').allTextContents()

/** Inmail settings live only in Settings; the gear on the Inmail screen opens their Watches category directly. */
async function openDeliverySettings(win: Page) {
  await openInbox(win, 'all')
  await shown(win, '[aria-label="关注设置"]').click()
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
  await expect(win.locator('[data-disc="topics"]')).toContainText('关注·关键词')
  await expect(win.locator('[data-disc="authors"]')).toContainText('关注·作者')
  await expect(win.locator('#crumb .cseg')).toHaveText(['收件', '论文推送'])
  await expect(shown(win, '.desk-head .t')).toHaveText(`论文推送 · ${demo.length}`)
  await expect(shown(win, '.pcard')).toHaveCount(demo.length)
  expect(await cardTitles(win)).toEqual(demo.map((d) => d.title))

  // One group per watch, each with its own "Dismiss all".
  const watches = await watchesFromCore(win)
  const heads = [...new Set(demo.map((d) => d.watch))].map((id) => {
    const w = watches.find((x) => x.id === id)!
    return `${KIND[w.type]} · ${w.name}`
  })
  expect(await groupTitles(win)).toEqual(heads)
  await expect(shown(win, '.collapsible-group-actions .btn')).toHaveCount(heads.length)

  // Every part of the first card matches the demo's text exactly.
  const card = shown(win, '.pcard').first()
  const text = (sel: string) => card.locator(sel).evaluate((el) => el.textContent ?? '')
  expect(await text('h3')).toBe(demo[0]!.title)
  expect(await text('.pm')).toBe(demo[0]!.authors + demo[0]!.venue)
  expect(await text('.pabs')).toBe(demo[0]!.abs)
  expect(await text('.prec')).toBe(demo[0]!.rec)
  expect(await card.locator('.plabel').allTextContents()).toEqual(['摘要', '推荐理由'])
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
  for (const entry of await discoveryFromCore(win)) {
    for (const project of listedUnder(entry, 'discovery')) byProject.set(project, (byProject.get(project) ?? 0) + 1)
  }
  await expect(win.locator('[data-discovery-project]')).toHaveCount(byProject.size)
  const [firstProject, firstCount] = [...byProject.entries()][0]!
  await win.locator(`[data-discovery-project="${firstProject}"]`).click()
  await expect(win.locator(`[data-discovery-project="${firstProject}"]`)).toHaveClass(/\bon\b/)
  await expect(shown(win, '.pcard')).toHaveCount(firstCount)
  await expect(shown(win, '.collapsible-group')).toHaveCount(1)
  await openInbox(win, 'discovery')

  // More-like-this feedback keeps the card, pressed; less-like-this feedback then takes it out.
  const first = shown(win, '.pcard').first()
  await rowAction(first, '更多类似')
  await expect(first.locator('[aria-label="更多类似"]')).toHaveAttribute('aria-pressed', 'true')

  const before = (await discoveryFromCore(win)).length
  await rowAction(first, '减少类似')
  await expect.poll(async () => (await discoveryFromCore(win)).length).toBe(before - 1)
})

test('发现的卡片能忽略;忽略、减少类似和已经了解都进垃圾桶,恢复后回到发现,反馈一并撤掉', async ({ win }) => {
  await openInbox(win, 'discovery')
  await shown(win, '.desk-head .btn').filter({ hasText: '刷新发现' }).click()
  await expect.poll(async () => (await discoveryFromCore(win)).length).toBeGreaterThan(0)
  const delivered = await discoveryFromCore(win)
  await expect(shown(win, '.pcard')).toHaveCount(delivered.length)
  const title = (await cardTitles(win))[0]!

  for (const label of ['忽略', '减少类似', '已经了解']) {
    await openInbox(win, 'discovery')
    await rowAction(shown(win, '.pcard').filter({ hasText: title }), label)
    await expect(shown(win, '.pcard')).toHaveCount(delivered.length - 1)
    expect((await trashFromCore(win)).map((item) => [item.kind, item.title])).toEqual([['inbox', title]])

    await win.locator('[data-desk="trash"]').click()
    await expect(shown(win, '.section-heading')).toHaveText('论文推送 · 1')
    await rowAction(win.locator('.tgroup .trow'), '恢复')
    await expect.poll(async () => (await trashFromCore(win)).length).toBe(0)
    const restored = await call<{ title: string; feedback?: string }[]>(win, 'inbox.list', { kind: 'discovery' })
    expect(restored.find((entry) => entry.title === title)).not.toHaveProperty('feedback')
  }
  await openInbox(win, 'discovery')
  await expect(shown(win, '.pcard')).toHaveCount(delivered.length)
})

test('按关键词与作者各筛一档,面包屑与条数都跟着换', async ({ win }) => {
  const entries = await inboxFromCore(win)
  const counted = (await watchesFromCore(win)).map((w) => ({
    ...w, n: entries.filter((e) => listedUnder(e, 'watch').includes(w.id)).length,
  }))
  // At least two watches must have different counts, or this test could not tell whether filtering works.
  expect(new Set(counted.map((c) => c.n)).size).toBeGreaterThan(1)

  for (const w of counted) {
    await openInbox(win, w.id)
    await expect(win.locator('#crumb .cseg')).toHaveText(['收件', KIND[w.type], w.name])
    await expect(shown(win, '.desk-head .t')).toHaveText(`${KIND[w.type]} · ${w.name} · ${w.n}`)
    await expect(shown(win, '.pcard')).toHaveCount(w.n)
    // A watch's view has one group heading, naming that watch; a watch with no entries shows only the empty state.
    await expect(shown(win, '.collapsible-group')).toHaveCount(w.n === 0 ? 0 : 1)
    await expect(shown(win, '.empty-state')).toHaveCount(w.n === 0 ? 1 : 0)
    if (w.n > 0) expect(await groupTitles(win)).toEqual([`${KIND[w.type]} · ${w.name}`])
    await expect(win.locator(`[data-watchrow="${w.id}"]`)).toHaveClass(/\bon\b/)
  }
})

test('忽略一条:它进垃圾桶,恢复后回到推送屏原来的位置', async ({ win }) => {
  await openInbox(win, 'all')
  // allTextContents does not retry, so wait until every card in this view is drawn before reading.
  await expect(shown(win, '.pcard')).toHaveCount((await inboxFromCore(win)).length)
  const order = await cardTitles(win)
  const dropped = order[1]!

  await rowAction(shown(win, '.pcard').nth(1), '忽略')
  await expect(shown(win, '.pcard')).toHaveCount(order.length - 1)
  expect(await cardTitles(win)).toEqual(order.filter((t) => t !== dropped))

  // Read Core again: the entry really is in the trash, not just gone from the screen.
  const trash = await trashFromCore(win)
  expect(trash).toHaveLength(1)
  expect(trash[0]).toMatchObject({ kind: 'inbox', title: dropped })
  expect(await inboxFromCore(win)).toHaveLength(order.length - 1)

  await win.locator('[data-desk="trash"]').click()
  await expect(shown(win, '.section-heading')).toHaveText('论文推送 · 1')
  await expect(win.locator('.tgroup .trow .tt2')).toHaveText([dropped])
  await rowAction(win.locator('.tgroup .trow'), '恢复')

  await openInbox(win, 'all')
  await expect(shown(win, '.pcard')).toHaveCount(order.length)
  expect(await cardTitles(win)).toEqual(order)
  expect(await trashFromCore(win)).toHaveLength(0)
})

test('「全部忽略」只清空自己这一组,逐组清完出空态,忽略的都在垃圾桶里', async ({ win }) => {
  await openInbox(win, 'all')
  await expect(shown(win, '.pcard')).toHaveCount((await inboxFromCore(win)).length)
  const titles = await cardTitles(win)
  const groups = shown(win, '.collapsible-group')
  const dismissGroup = (group: Locator) =>
    group.locator('.collapsible-group-actions .btn').filter({ hasText: '全部忽略' }).click()
  const first = await groups.first().locator('.pcard h3').allTextContents()
  // The first group must leave other cards behind, or this test could not tell a group from the whole list.
  expect(first.length).toBeGreaterThan(0)
  expect(first.length).toBeLessThan(titles.length)

  await dismissGroup(groups.first())
  await expect(shown(win, '.pcard')).toHaveCount(titles.length - first.length)
  expect(await cardTitles(win)).toEqual(titles.filter((t) => !first.includes(t)))
  expect((await trashFromCore(win)).map((t) => t.title).sort()).toEqual([...first].sort())

  for (let left = await groups.count(); left > 0; left -= 1) {
    await dismissGroup(groups.first())
    await expect(groups).toHaveCount(left - 1)
  }
  await expect(shown(win, '.pcard')).toHaveCount(0)
  await expect(shown(win, '.empty-state')).toHaveCount(1)
  await expect(shown(win, '.desk-head .t')).toHaveText('论文推送 · 0')

  const trash = await trashFromCore(win)
  expect(trash.map((t) => t.title).sort()).toEqual([...titles].sort())
  expect(trash.every((t) => t.kind === 'inbox')).toBe(true)
  await expect(win.locator('#rowInboxAll .n')).toHaveCount(0)
})

test('入库:论文进库,卡片离开论文推送和它的条数,提示里的开始阅读打开那一篇', async ({ win }) => {
  await openInbox(win, 'all')
  const entries = await inboxFromCore(win)
  await expect(shown(win, '.pcard')).toHaveCount(entries.length)
  const before = await paperTotal(win)
  const title = (await cardTitles(win))[0]!

  await rowAction(shown(win, '.pcard').first(), '下载并入库')
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已入库')
  await expect(shown(win, '.pcard')).toHaveCount(entries.length - 1)
  expect(await cardTitles(win)).not.toContain(title)

  expect(await paperTotal(win)).toBe(before + 1)
  expect(await inboxFromCore(win)).toHaveLength(entries.length - 1)
  await expect(win.locator('#rowInboxAll .n')).toHaveText(String(entries.length - 1))
  await expect(win.locator('[data-desk="papers"] .n')).toHaveText(String(before + 1))

  // The paper the notice opens is the card's: the reader header shows the card's title.
  await win.locator('#notice .btn', { hasText: '开始阅读' }).click()
  await expect(win.locator('#crumb .cseg').last()).toHaveText(title)
})

/**
 * Imports directly, bypassing the UI, the PDF that adding the `longspec` inbox entry downloads, and
 * returns the paper once the import's metadata parse, which may still retitle it, has settled. The
 * import takes its title from the file name, so nothing yet tells it is the card's paper.
 */
async function importLongSpec(win: Page): Promise<{ id: string; title: string }> {
  const entry = (await inboxFromCore(win)).find((e) => e.id === 'longspec')!
  const bytes = [...minimalPdf(CANNED_NET[entry.pdf]!.pdf!)]
  const held = await win.evaluate((pdf) => (window as unknown as MeridianWindow).meridian.call(
    'papers.import', { filename: 'LongSpec.pdf', bytes: new Uint8Array(pdf) },
  ), bytes) as { paper: { id: string } }
  await expect.poll(async () => (await call<{ uploads: { step: string }[] }>(win, 'jobs.status', {})).uploads
    .every((job) => job.step === 'done' || job.step === 'failed')).toBe(true)
  return call<{ id: string; title: string }>(win, 'papers.get', { id: held.paper.id })
}

test('论文从别处进了库:它那张卡片离开论文推送和侧栏条数', async ({ win }) => {
  await openInbox(win, 'all')
  const entries = await inboxFromCore(win)
  await expect(shown(win, '.pcard')).toHaveCount(entries.length)
  await expect(shown(win, '.pcard[data-pid="longspec"]')).toHaveCount(1)

  // Once the imported paper records the card's arXiv id, it is recognized as the card's paper.
  const held = await importLongSpec(win)
  await expect(shown(win, '.pcard[data-pid="longspec"]')).toHaveCount(1)
  await call(win, 'papers.update', { id: held.id, patch: { identifier: 'arXiv:2607.01428' } })

  await expect(shown(win, '.pcard[data-pid="longspec"]')).toHaveCount(0)
  await expect(shown(win, '.pcard')).toHaveCount(entries.length - 1)
  await expect(win.locator('#rowInboxAll .n')).toHaveText(String(entries.length - 1))
})

test('入库撞上库里已有的同一份原文:不重复入库,卡片离开,提示里的开始阅读打开库里那一篇', async ({ win }) => {
  // Like every entry Core writes, this one names no paper. The user has imported directly the same PDF
  // that adding it downloads, under another title, so only the PDF's bytes tell it is the same paper.
  expect((await inboxFromCore(win)).find((e) => e.id === 'longspec')?.paper).toBe('')
  const held = await importLongSpec(win)
  await call(win, 'papers.update', { id: held.id, patch: { title: '我那一份 LongSpec' } })
  const before = await paperTotal(win)

  await openInbox(win, 'all')
  const card = shown(win, '.pcard[data-pid="longspec"]')
  await rowAction(card, '下载并入库')

  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('库里已有这一篇')
  await expect(card).toHaveCount(0)
  expect(await paperTotal(win)).toBe(before)
  expect((await inboxFromCore(win)).map((e) => e.id)).not.toContain('longspec')

  // That entry point really opens the vault's paper: the reader header shows that paper's full title.
  await win.locator('#notice .btn', { hasText: '开始阅读' }).click()
  await expect(win.locator('#crumb .cseg').last()).toHaveText('我那一份 LongSpec')
})

test.describe('这一条推送已经在别处入过库', () => {
  // Core's `jobs.status()` is polled every second (useJobs.ts) and bumps the vault revision on any
  // external write, including this test's own bypass call; a window that paints that update late lets
  // the poll win the race against the click on the stale card. See `showWindow` in app.ts.
  test.use({ showWindow: true })

  test('界面上还没刷新时再点「入库」:报进拒绝提示而不是 .page-error', async ({ win }) => {
    const entries = await inboxFromCore(win)
    const fresh = (await Promise.all(entries.filter((e) => !e.downloaded).map(async (e) =>
      ({ e, known: await inLibrary(win, e.paper) })))).find((x) => !x.known)!.e

    await openInbox(win, 'all')
    const card = shown(win, `.pcard[data-pid="${fresh.id}"]`)
    await expect(card.locator('[aria-label="下载并入库"]')).toHaveCount(1)

    // Add it directly, bypassing the UI: Core records the entry as added, but the UI has not
    // refetched, so the card still shows it as not added.
    await call(win, 'inbox.download', { id: fresh.id })

    await rowAction(card, '下载并入库')
    await expect(win.locator('#notice[data-tone="refusal"] .notice-text')).toHaveText('现在不能这样做')
    await expect(shown(win, '.page-error')).toHaveCount(0)
  })
})

test('下载并入库时显示进度环,完成后卡片离开论文推送', async ({ win }) => {
  await openInbox(win, 'all')
  const card = shown(win, '.pcard[data-pid="drafterlite"]')
  await rowAction(card, '下载并入库')
  await expect(card.locator('.icbtn.busy[aria-label="从 arXiv 下载中"] .ring')).toHaveCount(1)
  await expect(card).toHaveCount(0, { timeout: 10_000 })
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已入库')
  expect((await inboxFromCore(win)).map((entry) => entry.id)).not.toContain('drafterlite')
})

test('下载失败在卡片内给原因和重试,不占用全页错误', async ({ win }) => {
  await openInbox(win, 'all')
  const card = shown(win, '.pcard[data-pid="sequoia2"]')
  await rowAction(card, '下载并入库')
  await expect(card.locator('.paper-card-notice .inline-message-text')).toHaveText('下载失败 · 服务器出错')
  await expect(card.locator('[aria-label="下载并入库"]')).toHaveCount(1)
  await expect(shown(win, '.page-error')).toHaveCount(0)
  await card.locator('.paper-card-notice .inline-message-action .btn', { hasText: '重试' }).click()
  await expect(card.locator('.paper-card-notice .inline-message-text')).toHaveText('下载失败 · 服务器出错')
})

test('检查新论文按关注抓取一次,新论文进入相应分组且标题栏记下时间', async ({ win }) => {
  await openInbox(win, 'all')
  const before = await inboxFromCore(win)
  await shown(win, '.desk-head .btn').filter({ hasText: '检查新论文' }).click()
  // The vault's Mixtral of Experts records 2026 and arXiv's 2024, more than a year apart, so it is another paper.
  await expect(shown(win, '.pcard')).toHaveCount(before.length + 3)
  await expect(shown(win, '.desk-head .page-note')).toHaveText(/^上次检查 \d+月\d+日\d{2}:\d{2}$/)
  await expect(shown(win, '.desk-head .page-note .date-chip')).toHaveCount(2)
  expect((await cardTitles(win))[0]).toBe('Tree Width in Batched Serving')
  const fresh = shown(win, '.pcard').filter({ hasText: 'Tree Width in Batched Serving' })
  await expect(fresh.locator('.plabel')).toHaveText(['摘要'])
  await expect(win.locator('#rowInboxAll .n')).toHaveText(String(before.length + 3))
})

test('在一条关注那一档里检查新论文只抓这一条;再抓没有新的,屏头写没有新论文和这一次的时刻', async ({ win }) => {
  const before = await inboxFromCore(win)
  const elsewhere = before.filter((e) => !listedUnder(e, 'watch').includes('spec')).map((e) => e.id)
  await openInbox(win, 'spec')
  const shownBefore = await shown(win, '.pcard').count()
  await shown(win, '.desk-head .btn').filter({ hasText: '检查新论文' }).click()
  await expect(shown(win, '.pcard')).toHaveCount(shownBefore + 1)
  expect((await cardTitles(win))).toContain('Tree Width in Batched Serving')
  const after = await inboxFromCore(win)
  expect(after.filter((e) => !listedUnder(e, 'watch').includes('spec')).map((e) => e.id)).toEqual(elsewhere)

  await shown(win, '.desk-head .btn').filter({ hasText: '检查新论文' }).click()
  await expect(shown(win, '.desk-head .page-note')).toHaveText(/^没有新论文 · 上次检查 \d+月\d+日\d{2}:\d{2}$/)
  await expect(shown(win, '.pcard')).toHaveCount(shownBefore + 1)
  // The full check, which has not run, keeps its own status line.
  await openInbox(win, 'all')
  await expect(shown(win, '.desk-head .page-note')).not.toContainText('没有新论文')
})

test('在一个项目那一档里刷新发现只刷这个项目;没有新的时,提示写出它上次刷新的时刻', async ({ win }) => {
  await openInbox(win, 'discovery')
  await shown(win, '.desk-head .btn').filter({ hasText: '刷新发现' }).click()
  await expect.poll(async () => (await discoveryFromCore(win)).length).toBeGreaterThan(0)
  const project = listedUnder((await discoveryFromCore(win))[0]!, 'discovery')[0]!
  await win.locator(`[data-discovery-project="${project}"]`).click()
  const count = await shown(win, '.pcard').count()

  await shown(win, '.desk-head .btn').filter({ hasText: '刷新发现' }).click()
  await expect(win.locator('#notice[data-tone="success"] .notice-text'))
    .toHaveText(/^没有发现新的论文 · 上次刷新 \d+月\d+日\d{2}:\d{2} · /)
  await expect(shown(win, '.pcard')).toHaveCount(count)
})

test('存入稍后阅读:离开推送屏,排到队首,再移出', async ({ win }) => {
  const queued = await laterFromCore(win)
  const watches = await watchesFromCore(win)

  await win.locator('#rowLater').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['收件', '稍后阅读'])
  await expect(shown(win, '.desk-head .t')).toHaveText(`稍后阅读 · ${queued.length}`)
  await expect(shown(win, '.pcard')).toHaveCount(queued.length)

  // Grouped by date, the sections are the days Core computes; grouped by source, they are the sources
  // recorded when each entry was queued.
  // Unlike sectionHeads' targets, the grouping switch now lives in the page header, so a day heading's
  // text is already clean and needs no control-label stripping.
  const keyOf = (e: { day: string; source: string }, key: 'day' | 'source') => (key === 'day' ? e.day : shownSource(e.source))
  const heads = (key: 'day' | 'source') => [...new Set(queued.map((e) => keyOf(e, key)))]
    .map((k) => `${k} · ${queued.filter((e) => keyOf(e, key) === k).length}`)
  expect(await shown(win, '.day-heading').allTextContents()).toEqual(heads('day'))
  await shown(win, '.segmented-control>button').filter({ hasText: '按来源' }).click()
  await expect(shown(win, '.segmented-control>button').filter({ hasText: '按来源' })).toHaveAttribute('aria-checked', 'true')
  expect(await shown(win, '.day-heading').allTextContents()).toEqual(heads('source'))

  await openInbox(win, 'all')
  const entries = await inboxFromCore(win)
  await expect(shown(win, '.pcard')).toHaveCount(entries.length)
  const first = entries[0]!
  const title = (await cardTitles(win))[0]!
  await rowAction(shown(win, '.pcard').first(), '稍后阅读')
  await expect(shown(win, '.pcard')).toHaveCount(entries.length - 1)

  await win.locator('#rowLater').click()
  await expect(shown(win, '.desk-head .t')).toHaveText(`稍后阅读 · ${queued.length + 1}`)
  await expect(shown(win, '.pcard h3').first()).toHaveText(title)
  const watched = watches.find((w) => w.id === first.watch)!
  expect((await laterFromCore(win))[0]).toMatchObject({
    id: first.id, day: '今天', source: `${STORED_KIND[watched.type]} · ${watched.name}`,
  })

  await rowAction(shown(win, '.pcard').first(), '移出')
  await expect(shown(win, '.desk-head .t')).toHaveText(`稍后阅读 · ${queued.length}`)
  expect((await laterFromCore(win)).map((e) => e.id)).toEqual(queued.map((e) => e.id))

  // The removal went to the trash; restoring it puts the entry back at the head of the queue.
  expect(await trashFromCore(win)).toEqual([expect.objectContaining({ kind: 'later', title })])
  await win.locator('[data-desk="trash"]').click()
  await rowAction(win.locator('.tgroup .trow'), '恢复')
  await win.locator('#rowLater').click()
  await expect(shown(win, '.desk-head .t')).toHaveText(`稍后阅读 · ${queued.length + 1}`)
  expect((await laterFromCore(win)).map((e) => e.id)).toEqual([first.id, ...queued.map((e) => e.id)])
})

test('稍后阅读里有原文地址的条目可以直接开始阅读并在需要时先下载', async ({ win }) => {
  const queued = await call<{ id: string; paper: string; downloaded: boolean; pdf?: string }[]>(win, 'later.list', {})
  const entries = await call<{ id: string; paper: string; downloaded: boolean }[]>(win, 'inbox.list', {})
  const readable = new Set(queued.filter((entry) => entry.downloaded || entry.pdf !== undefined)
    .map((entry) => entry.id))

  await win.locator('#rowLater').click()
  await expect(shown(win, '.pcard')).toHaveCount(queued.length)
  for (const entry of queued) {
    await expect(shown(win, `.pcard[data-pid="${entry.id}"] [aria-label="开始阅读"]`))
      .toHaveCount(readable.has(entry.id) ? 1 : 0)
  }
  // Every queued entry can still be removed; only the entry point to the reader is missing on some.
  await expect(shown(win, '.pcard [aria-label="移出"]')).toHaveCount(queued.length)

  // Adding the same paper from Inmail gives the queued entry pointing at it a reader entry point too.
  const shared = queued.find((e) => !e.downloaded
    && entries.some((x) => x.id === e.id && !x.downloaded))!
  const source = entries.find((x) => x.paper === shared.paper)!
  await openInbox(win, 'all')
  await rowAction(shown(win, `.pcard[data-pid="${source.id}"]`), '下载并入库')
  await expect(shown(win, `.pcard[data-pid="${source.id}"]`)).toHaveCount(0)

  await win.locator('#rowLater').click()
  await expect(shown(win, `.pcard[data-pid="${shared.id}"] [aria-label="开始阅读"]`)).toHaveCount(1)
  await expect(shown(win, '.pcard [aria-label="开始阅读"]')).toHaveCount(readable.size)
})

test('关注管理:暂停、添加与移除都实时改侧栏与推送屏', async ({ win }) => {
  await openDeliverySettings(win)

  const watches = await watchesFromCore(win)
  await expect(settings(win, '.wrow')).toHaveCount(watches.length)
  await expect(settings(win, '.section-heading')).toContainText(['关键词', '作者'])

  // The category now has its own page-level heading above the two watch-type groups, so scope to the
  // group variant specifically: both groups (topics, authors) use the group size and neither draws a line.
  const groupHeads = settings(win, '.section-heading--group')
  await expect(groupHeads.nth(0)).toHaveCSS('font-size', '14px')
  await expect(groupHeads.nth(0)).toHaveCSS('border-top-width', '0px')
  await expect(groupHeads.nth(1)).toHaveCSS('font-size', '14px')
  await expect(groupHeads.nth(1)).toHaveCSS('border-top-width', '0px')

  // Pause: the sidebar row dims and keeps its count, and the entries already fetched stay.
  const entriesBefore = await inboxFromCore(win)
  const kept = entriesBefore.filter((e) => e.watch === 'spec').length
  const spec = settings(win, '.wrow').filter({ hasText: 'speculative decoding' })
  await expect(spec.locator('[role="switch"]')).toHaveAttribute('aria-checked', 'true')
  await spec.locator('[role="switch"]').click()
  await expect(spec.locator('[role="switch"]')).toHaveAttribute('aria-checked', 'false')
  await expect(spec.locator('.watch-paused')).toHaveText('已暂停')
  await expect(win.locator('[data-watchrow="spec"]')).toHaveClass(/\bdim\b/)
  await expect(win.locator('[data-watchrow="spec"] .n')).toHaveText(String(kept))
  expect((await inboxFromCore(win)).filter((e) => e.watch === 'spec')).toHaveLength(kept)
  await spec.locator('[role="switch"]').click()
  await expect(win.locator('[data-watchrow="spec"]')).not.toHaveClass(/\bdim\b/)

  // Add: the sidebar's topic group gains a row; its count, the papers its watches delivered, stays.
  const topics = watches.filter((w) => w.type === 'topic').length
  const topicIds = new Set(watches.filter((w) => w.type === 'topic').map((w) => w.id))
  const topicPapers = entriesBefore.filter((e) => topicIds.has(e.watch)).length
  expect(topicPapers).toBeGreaterThan(0)
  await settings(win, '.section-heading').filter({ hasText: '关键词' }).locator('.btn').click()
  await expect(settings(win, '.wrow')).toHaveCount(watches.length + 1)
  // A new watch lands first in its group, so the topic group's placeholder is the very first row.
  await expect(settings(win, '.wrow').first()).toHaveClass(/\bnewrow\b/)
  await settings(win, '.wrow.newrow input').fill('kv cache')
  await settings(win, '.wrow.newrow input').press('Enter')
  await expect(settings(win, '.wrow.newrow')).toHaveCount(0)
  await expect(settings(win, '.wrow')).toHaveCount(watches.length + 1)
  await expect(win.locator('#g-topics .nav-row')).toHaveCount(topics + 1)
  await expect(win.locator('[data-disc="topics"] .n')).toHaveText(String(topicPapers))

  // Removed: the sidebar row disappears, and its own pushes are cleared with it (the confirm dialog's
  // own wording says so); other watches' pushes are untouched.
  expect(kept).toBeGreaterThan(0)
  await rowAction(spec, '移除')
  // Removing a watch is destructive, so it now confirms first (ConfirmDialog.tsx).
  await win.locator('.modal.confirm .modal-actions>*').last().click()
  await expect(win.locator('[data-watchrow="spec"]')).toHaveCount(0)
  const survivors = entriesBefore.filter((e) => e.watch !== 'spec')
  await expect.poll(async () => (await inboxFromCore(win)).map((e) => e.id))
    .toEqual(survivors.map((e) => e.id))
  await win.keyboard.press('Escape')
  await openInbox(win, 'all')
  await expect(shown(win, '.pcard')).toHaveCount(survivors.length)
  expect(await groupTitles(win)).toEqual([...new Set(survivors.map((e) => shownSource(e.source)))])
})

test('关注管理:占位行按 Esc 撤掉,屏上没有旧的圆角添加框', async ({ win }) => {
  await openDeliverySettings(win)
  const watches = await watchesFromCore(win)
  await expect(settings(win, '.wrow')).toHaveCount(watches.length)

  // Esc removes the placeholder row; the old rounded add box is gone from this screen.
  await settings(win, '.section-heading').filter({ hasText: '作者' }).locator('.btn').click()
  await expect(settings(win, '.wrow')).toHaveCount(watches.length + 1)
  // The placeholder is styled as a .wrow: while it is open, every watch row here still has one height.
  // The divider between rows is the lower row's top border, which the first row of a list lacks, so
  // rows are compared without their borders.
  expect(await settings(win, '.wrow').evaluateAll((rows) => [...new Set(rows.map((r) => r.clientHeight))]))
    .toHaveLength(1)
  await settings(win, '.wrow.newrow input').press('Escape')
  await expect(settings(win, '.wrow.newrow')).toHaveCount(0)
  await expect(settings(win, '.wrow')).toHaveCount(watches.length)
  await expect(settings(win, '.mgr-add')).toHaveCount(0)
})

test('没填 Semantic Scholar key 时作者搜索写出缺 key，填了之后先用机构消歧,确认后保存稳定作者身份', async ({ win }) => {
  await openDeliverySettings(win)
  await settings(win, '.section-heading').filter({ hasText: '作者' }).locator('.btn').click()
  await settings(win, '.wrow.newrow input').fill('Alex Kim')
  await expect(settings(win, '.author-search-note .inline-message--error .inline-message-text')).toHaveText('搜索作者失败 · 没有 Semantic Scholar key')

  await call(win, 'delivery.setSemanticKey', { apiKey: 'fixture-key' })
  await settings(win, '.wrow.newrow input').fill('')
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
    identity: { source: 'semantic-scholar', affiliations: ['Stanford University'] },
  })
  const row = settings(win, `.wrow[data-w="${added!.id}"]`)
  await expect(row.locator('.author-id-state')).toHaveText('Stanford University')
})

test('没填 key 时关注建议从 arXiv 生成关键词与按姓名的作者,添加的作者是未确认身份', async ({ win }) => {
  await openDeliverySettings(win)
  const section = settings(win, '.watch-suggestions')
  await expect(section).not.toContainText('不调用模型')

  await section.locator('input').fill('我想关注批量推理中的动态验证与草稿树')
  await section.locator('.btn.pri').click()
  await expect(section.locator('.watch-suggestion-group')).toHaveCount(2)
  await expect(section).toContainText('batched inference')
  await expect(section).not.toContainText('h-index')
  const suggestedAuthor = section.locator('.watch-suggestion-row').filter({ hasText: 'Mei Lin' })
  await expect(suggestedAuthor).toContainText('2 篇相关论文')
  // A suggestion's add shows in its row's actions slot once the row is hovered.
  await suggestedAuthor.hover()
  await suggestedAuthor.locator('.row-actions .add-action', { hasText: '添加' }).click()
  await expect.poll(async () => (await watchesFromCore(win))
    .find((item) => item.type === 'author' && item.name === 'Mei Lin')).toMatchObject({ type: 'author' })
  expect((await watchesFromCore(win)).find((item) => item.name === 'Mei Lin')).not.toHaveProperty('identity')

  const suggestedTopic = section.locator('.watch-suggestion-row')
    .filter({ hasText: 'batched inference' }).first()
  await suggestedTopic.hover()
  await suggestedTopic.locator('.row-actions .add-action', { hasText: '添加' }).click()
  await expect.poll(async () => (await watchesFromCore(win))
    .some((item) => item.type === 'topic' && item.name === 'batched inference')).toBe(true)

  const projectResult = await call<{
    topics: { name: string }[]; authors: { name: string; id?: string }[]; paperCount: number
  }>(win, 'watch.suggest', { source: 'project', projectId: 'draft' })
  expect(projectResult.paperCount).toBeGreaterThan(0)
  expect(projectResult.topics.map((item) => item.name)).toContain('speculative decoding')
  expect(projectResult.authors[0]?.name).toBeTruthy()
  expect(projectResult.authors[0]?.id).toBeUndefined()

  // Every area of the project seeds the suggestions, not only its first.
  await call(win, 'project.update', { id: 'draft', patch: { topics: ['speculative decoding', 'kv cache eviction'] } })
  const areasResult = await call<{ topics: { name: string }[] }>(win, 'watch.suggest', { source: 'project', projectId: 'draft' })
  expect(areasResult.topics.map((item) => item.name)).toEqual(expect.arrayContaining(['speculative decoding', 'kv cache eviction']))

  await section.locator('.watch-suggestion-source').getByRole('radio', { name: '从项目生成' }).click()
  await section.locator('.btn.pri').click()
  await expect(section.locator('.watch-suggestion-row').first()).toBeVisible()
})

test('关注可原地编辑:保留原 id、暂停状态与已经收到的论文', async ({ win }) => {
  await openDeliverySettings(win)
  const before = await watchesFromCore(win)
  const inboxIds = (await inboxFromCore(win)).map((entry) => entry.id)

  const topic = before.find((item) => item.type === 'topic')!
  const topicRow = settings(win, `.wrow[data-w="${topic.id}"]`)
  await rowAction(topicRow, '编辑')
  await settings(win, `.wrow.editrow[data-w="${topic.id}"] input`).fill(`${topic.name} updated`)
  await settings(win, `.wrow.editrow[data-w="${topic.id}"] input`).press('Enter')
  await expect(settings(win, `.wrow[data-w="${topic.id}"] .nm`)).toHaveText(`${topic.name} updated`)

  const authorWatch = before.find((item) => item.type === 'author')!
  const authorRow = settings(win, `.wrow[data-w="${authorWatch.id}"]`)
  await rowAction(authorRow, '编辑')
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

/** The computed styles an input actually wears, picked where browser defaults and the app's rules clearly differ. */
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

test('关注管理:同一时间只开一个占位,点另一组的加号先存下上一个占位打的字', async ({ win }) => {
  await openDeliverySettings(win)
  const watches = await watchesFromCore(win)
  await expect(settings(win, '.wrow')).toHaveCount(watches.length)
  const topics = watches.filter((w) => w.type === 'topic').length

  await settings(win, '.section-heading').filter({ hasText: '关键词' }).locator('.btn').click()
  await settings(win, '.wrow.newrow input').fill('切组前存下的主题')
  await settings(win, '.section-heading').filter({ hasText: '作者' }).locator('.btn').click()

  // The topic typed in the first placeholder is saved as a watch before the author group's
  // placeholder opens. A new watch lands first in its group, so the author group's placeholder comes
  // right after the topic group's rows, the saved topic now among them.
  await expect(settings(win, '.wrow.newrow')).toHaveCount(1)
  await expect(settings(win, '.wrow')).toHaveCount(watches.length + 2)
  await expect(settings(win, '.wrow').nth(topics + 1)).toHaveClass(/\bnewrow\b/)
  await expect(settings(win, '.wrow.newrow input')).toHaveValue('')
  expect((await watchesFromCore(win)).map((w) => w.name)).toContain('切组前存下的主题')
})

test('关注管理:两下快回车只建出一条关注', async ({ win }) => {
  await openDeliverySettings(win)
  const watches = await watchesFromCore(win)
  await expect(settings(win, '.wrow')).toHaveCount(watches.length)

  const topics = watches.filter((w) => w.type === 'topic').length
  await settings(win, '.section-heading').filter({ hasText: '关键词' }).locator('.btn').click()
  await settings(win, '.wrow.newrow input').fill(TWICE_WATCH)
  // The placeholder and its text stay until the write returns. With two real presses, Core may finish
  // writing between them and the race never happens; two keydowns dispatched in one task always
  // collide, the second landing on a placeholder whose write is still in flight.
  await settings(win, '.wrow.newrow input').evaluate((el) => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })

  await expect(settings(win, '.wrow.newrow')).toHaveCount(0)
  await expect(settings(win, '.wrow')).toHaveCount(watches.length + 1)
  await expect(win.locator('#g-topics .nav-row')).toHaveCount(topics + 1)
  expect((await watchesFromCore(win)).filter((w) => w.name === TWICE_WATCH)).toHaveLength(1)
})

test.describe('关注管理:切到别的应用', () => {
  test('切到别的应用不算放弃:占位与打好的字都留着', async ({ app, win }) => {
    await openDeliverySettings(win)
    await settings(win, '.section-heading').filter({ hasText: '关键词' }).locator('.btn').click()
    const input = settings(win, '.wrow.newrow input')
    await input.fill('切走之前打的字')
    await expect(input).toBeFocused()
    const switcher = await appSwitcher(app, win)
    await input.evaluate((el) => {
      const seen: (string | null)[] = []
      ;(window as unknown as { focusouts: (string | null)[] }).focusouts = seen
      el.addEventListener('focusout', (e) => {
        const to = (e as FocusEvent).relatedTarget
        seen.push(to instanceof Element ? to.tagName : null)
      })
    })

    await switcher.away()

    await expect.poll(() => win.evaluate(() => document.hasFocus()), {
      message: '页面没有失去焦点,切走无从谈起',
    }).toBe(false)
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
  const count = (id: string) => entries.filter((e) => listedUnder(e, 'watch').includes(id)).length
  // A group counts each paper its watches delivered once.
  const papers = (type: string) => entries.filter((e) => watches.some((w) => w.type === type && listedUnder(e, 'watch').includes(w.id))).length

  const badges: [string, number][] = [
    ['#rowInboxAll .n', entries.length],
    ['[data-disc="topics"] .n', papers('topic')],
    ['[data-disc="authors"] .n', papers('author')],
    ['#rowLater .n', queued.length],
    ...watches.map((w): [string, number] => [`[data-watchrow="${w.id}"] .n`, count(w.id)]),
  ]
  // At least two counts must differ, or this test could not tell one badge from another.
  expect(new Set(badges.map(([, n]) => n)).size).toBeGreaterThan(1)

  for (const [sel, n] of badges) {
    // A zero count shows no badge, matching the demo's `n||''`.
    if (n === 0) await expect(win.locator(sel)).toHaveCount(0)
    else await expect(win.locator(sel)).toHaveText(String(n))
  }
})
