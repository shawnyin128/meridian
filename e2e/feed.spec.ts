import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { belowHeader, expect, test, type MeridianWindow } from './app.js'

/** Screens stay mounted once visited, so selectors every screen has, such as items, are scoped to the visible one. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

const DEMO = resolve(import.meta.dirname, 'fixtures/platform-shell-demo.html')

/** The demo's first four feed items are plain text; the fifth is the briefing block. */
const PROSE = 4

/**
 * Extracts the feed items the demo's `start()` creates: source, raw HTML of the body, body text with
 * tags removed, and time. Expected values come from the demo itself rather than being copied by hand.
 * Only the body of `start()` is searched: the demo's other `feedItem` calls append items at runtime
 * and are not part of the initial feed.
 */
function feedItemsFromDemo(): { source: string; html: string; text: string; time: string }[] {
  const demo = readFileSync(DEMO, 'utf8')
  const body = /function start\(\)\{([\s\S]*?)\n\}/.exec(demo)
  if (!body) throw new Error('demo 里找不到 start() 的函数体')
  return [...body[1]!.matchAll(/feedItem\('(\w+)',`([\s\S]*?)`,'([^']*)'\)/g)].map((m) => ({
    source: m[1]!,
    html: m[2]!,
    text: m[2]!.replace(/<[^>]+>/g, ''),
    time: m[3]!,
  }))
}

/** Calls `feed.list` directly, bypassing the UI, and returns the source of every feed item in the vault. */
const sourcesFromCore = (win: Page) => win.evaluate(async () => {
  const entries = await (window as unknown as MeridianWindow).meridian
    .call('feed.list', {}) as { source: string }[]
  return entries.map((e) => e.source)
})

/** The `data-src` of every feed item on screen, in screen order. */
const sourcesOnScreen = (win: Page) => shown(win, '.fitem')
  .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset['src'] ?? ''))

/** One feed item's body as raw textContent for an exact match; `innerText` would collapse whitespace as rendered. */
const bodyText = (win: Page, at: number) =>
  shown(win, '.fitem .fbody').nth(at).evaluate((el) => el.textContent ?? '')

test('应用落在动态屏,侧栏与面包屑都指着它', async ({ win }) => {
  await expect(win.locator('#crumb .cseg')).toHaveText(['动态'])
  await expect(win.locator('#rowFeed')).toHaveClass(/\bon\b/)
  await expect(win.locator('#sidebar .nav-row.on')).toHaveCount(1)
  await expect(shown(win, '.feedcol')).toHaveCount(1)
})

test('屏上的条目数与 feed.list 一致,来源逐条对上', async ({ win }) => {
  const sources = await sourcesFromCore(win)
  expect(sources.length).toBeGreaterThan(0)
  await expect(shown(win, '.fitem')).toHaveCount(sources.length)
  expect(await sourcesOnScreen(win)).toEqual(sources)
})

test('条目的来源、时刻与正文和 demo 源文件里的原文逐字相同', async ({ win }) => {
  const demo = feedItemsFromDemo()
  expect(demo).toHaveLength(PROSE + 1)

  // The demo lists the oldest entry first; the feed shows the newest first.
  const onScreen = (demoAt: number) => demo.length - 1 - demoAt
  const sources = await sourcesFromCore(win)
  expect(sources).toEqual([...demo].reverse().map((d) => d.source))
  await expect(shown(win, '.fitem')).toHaveCount(demo.length)

  for (let at = 0; at < PROSE; at++) {
    expect(await bodyText(win, onScreen(at))).toBe(demo[at]!.text)
    await expect(shown(win, '.fitem .ftime').nth(onScreen(at))).toHaveText(demo[at]!.time)
  }

  // The fifth item is the briefing block: its heading, and the red tag, title and button of its one
  // item, are all taken from the demo's HTML.
  const brief = demo[PROSE]!.html
  const pick = (re: RegExp) => {
    const hit = re.exec(brief)
    expect(hit, `demo 的简报块里没有匹配 ${re.source} 的部分`).not.toBeNull()
    return hit![1]!
  }
  await expect(shown(win, '.brief .bh')).toHaveText(pick(/<div class="bh">([^<]*)<\/div>/))
  await expect(shown(win, '.brief .bitem .tag')).toHaveText(pick(/<span class="tag conf">([^<]*)<\/span>/))
  await expect(shown(win, '.brief .bitem .t')).toHaveText(pick(/<span class="t">([^<]*)<\/span>/))
  await expect(shown(win, '.brief .bitem .go .btn')).toHaveText(pick(/id="briefConf">([^<]*)<\/button>/))
  await expect(shown(win, '.fitem .ftime').nth(onScreen(PROSE))).toHaveText(demo[PROSE]!.time)
})

test('五个筛选档各自的条数与按来源分档的计数一致,筛过的条目照样分在各自的日期标题下', async ({ win }) => {
  const entries = await win.evaluate(async () => (window as unknown as MeridianWindow).meridian
    .call('feed.list', {}) as Promise<{ source: string; day: string }[]>)
  const chips: [string, string | null][] = [['全部', null], ['Meridian', 'steward'], ['我', 'me'], ['实验', 'lab'], ['收件', 'inbox']]
  const kept = (source: string | null) => entries.filter((e) => source === null || e.source === source)
  // At least two filters must yield different counts, or this test could not tell whether filtering works.
  expect(new Set(chips.map(([, source]) => kept(source).length)).size).toBeGreaterThan(1)

  for (const [label, source] of chips) {
    expect(kept(source).length).toBeGreaterThan(0)
    await shown(win, '.page-toolbar .segmented-control>button').filter({ hasText: label }).first().click()
    await expect(shown(win, '.fitem')).toHaveCount(kept(source).length)
    await expect(shown(win, '.day-heading')).toHaveCount(new Set(kept(source).map((e) => e.day)).size)
  }
})

test('动态的第一项和别的屏的第一项一样，从屏头下同一处开始', async ({ win }) => {
  await win.locator('[data-desk="changelog"]').click()
  const elsewhere = await belowHeader(shown(win, '.desk-body > :first-child'))
  await win.locator('[data-desk="feed"]').click()
  expect(await belowHeader(shown(win, '.desk-body > .msgs > :first-child'))).toBeCloseTo(elsewhere, 0)
})
