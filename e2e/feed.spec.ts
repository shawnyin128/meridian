import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test, type MeridianWindow } from './app.js'

/** The screen you entered is always hung, and selectors that are present on every screen such as items should be included in the currently displayed screen. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

const DEMO = resolve(import.meta.dirname, 'fixtures/platform-shell-demo.html')

/** The first four items are the prose text, and the fifth item is the briefing block. */
const PROSE = 4

/**
 * Extract the several dynamics of `start()` from the demo source file: the source, the original HTML text of the body and the HTML after removing the tags
 * Text, moment. The expected value is taken from the demo itself, not copied by hand. Only found in the function body of `start()`: elsewhere
 * `feedItem` is appended at runtime and does not belong to the dynamic flow when implemented.
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

/** Bypass the interface and call `feed.list` directly to get the source of every update in the library. */
const sourcesFromCore = (win: Page) => win.evaluate(async () => {
  const entries = await (window as unknown as MeridianWindow).meridian
    .call('feed.list', {}) as { source: string }[]
  return entries.map((e) => e.source)
})

/** Each dynamic `data-src` on the screen is in the order on the screen. */
const sourcesOnScreen = (win: Page) => shown(win, '.fitem')
  .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset['src'] ?? ''))

/** textContent of a dynamic text. `innerText` will fold the blanks according to the rendering, and read the original text for word-by-word comparison. */
const bodyText = (win: Page, at: number) =>
  shown(win, '.fitem .fbody').nth(at).evaluate((el) => el.textContent ?? '')

test('应用落在动态屏,侧栏与面包屑都指着它', async ({ win }) => {
  await expect(win.locator('#crumb .cseg')).toHaveText(['动态'])
  await expect(win.locator('#rowFeed')).toHaveClass(/\bon\b/)
  await expect(win.locator('.sidebar .srow.on')).toHaveCount(1)
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

  // The fifth text is the presentation block: the subtitle, the red mark, the text, and the button of that thing are extracted from the HTML of the demo.
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

test('五个筛选档各自的条数与按来源分档的计数一致', async ({ win }) => {
  const sources = await sourcesFromCore(win)
  const count = (src: string) => sources.filter((s) => s === src).length
  const chips: [string, number][] = [
    ['全部', sources.length],
    ['Meridian', count('steward')],
    ['我', count('me')],
    ['实验', count('lab')],
    ['收件', count('inbox')],
  ]
  // At least the number of entries in the two levels is different, otherwise this test will have no discernible effect on screening.
  expect(new Set(chips.map(([, n]) => n)).size).toBeGreaterThan(1)

  for (const [label, expected] of chips) {
    expect(expected).toBeGreaterThan(0)
    await shown(win, '.feedbar .segmented-control>button').filter({ hasText: label }).first().click()
    await expect(shown(win, '.fitem')).toHaveCount(expected)
    // The filtering of the demo compares the source of the entries one by one. The date segment has no source and is hidden as soon as it is filtered.
    await expect(shown(win, '.day-heading')).toHaveCount(label === '全部' ? 2 : 0)
  }
})
