import type { Page } from '@playwright/test'
import { expect, test } from './app.js'

/** Visited screens stay mounted, so selectors are scoped to the screen shown. */
const shown = (win: Page) => win.locator('.screenslot:not([hidden])')

/** The four window sizes under test: laptop, default, full HD and 2K. */
const SIZES: [number, number][] = [[1280, 720], [1440, 900], [1920, 1080], [2560, 1440]]

/** The ratio of an element to the width of the desktop area (.desk-body). */
async function ratio(win: Page, selector: string): Promise<number> {
  const body = (await shown(win).locator('.desk-body').boundingBox())!
  const el = (await shown(win).locator(selector).first().boundingBox())!
  return el.width / body.width
}

/** There is no horizontal overflow in the desktop area: the scroll width does not exceed the visual width. */
async function noOverflow(win: Page): Promise<void> {
  const [scroll, client] = await shown(win).locator('.desk-body').evaluate((el) => [el.scrollWidth, el.clientWidth])
  expect(scroll, '桌面区横向溢出').toBeLessThanOrEqual(client + 1)
}

/** The --pagew tokens.css gives a window this wide: 1080 when narrow, 1320 when medium, 1560 when wide. */
const pagewOf = (width: number): string => (width >= 2000 ? '1560px' : width >= 1600 ? '1320px' : '1080px')

/** The --chatw tokens.css gives a window this wide: 720 when narrow, 880 when medium, 1000 when wide. */
const chatwOf = (width: number): string => (width >= 2000 ? '1000px' : width >= 1600 ? '880px' : '720px')

/** A fixture chat with messages: the column width must be measured on a .msgs that holds messages. */
const CHAT_WITH_MESSAGES = '摊薄的前提是共享前缀吗'

/** The chat screen has no .desk-body; its scroll container, .stream, must not overflow horizontally either. */
async function noStreamOverflow(win: Page): Promise<void> {
  const [scroll, client] = await shown(win).locator('.stream').evaluate((el) => [el.scrollWidth, el.clientWidth])
  expect(scroll, '对话屏横向溢出').toBeLessThanOrEqual(client + 1)
}

test('四档窗口下主内容随窗口变宽,比例不低于下限,不横向溢出', async ({ win, app }) => {
  // Each size visits five screens, and an offscreen window waits two seconds for every actionability check.
  test.slow()
  for (const [w, h] of SIZES) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setSize(size.w, size.h), { w, h })
    // The OS may shrink the window to fit the screen, so the size tier comes from the actual viewport width.
    const width = await win.evaluate(() => window.innerWidth)
    await expect.poll(() => win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pagew').trim()))
      .toBe(pagewOf(width))
    const wide = width >= 1600

    // Wiki home: the card grid fills the content column, which takes more than 60% of the desktop area.
    await win.locator('[data-desk="wiki"]').click()
    await shown(win).locator('.wkgrid .wkcard').first().waitFor()
    expect(await ratio(win, '.wkgrid'), `${w} wiki 首页`).toBeGreaterThan(0.6)
    await noOverflow(win)
    // Scrollbar: the track is 12px wide. .desk-body has scrollbar-gutter: stable, so the gutter is always
    // there and the check need not wait for content to overflow vertically.
    const gutter = await shown(win).locator('.desk-body')
      .evaluate((el) => (el as HTMLElement).offsetWidth - el.clientWidth)
    expect(gutter, `${w} 桌面区滚动条轨道宽度`).toBe(12)

    // Wiki page: Text pages use the reading width and still occupy more than 45% of the desktop area.
    await shown(win).locator('[data-wk="topics/quantization"]').click()
    await shown(win).locator('.wkmain .md').waitFor()
    expect(await ratio(win, '.wkpage'), `${w} wiki 页`).toBeGreaterThan(0.45)
    await noOverflow(win)

    // Paper table: like the other list screens, the table takes this size's --pagew or the whole desktop
    // content box when that is narrower; the table scrolls by itself, but the desktop area does not.
    await win.locator('[data-desk="papers"]').click()
    await shown(win).locator('.ptable tbody tr').first().waitFor()
    const [table, expected] = await shown(win).locator('.libwide').evaluate((element) => {
      const parent = element.parentElement!
      const style = getComputedStyle(parent)
      const available = parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const cap = parseFloat(getComputedStyle(element).getPropertyValue('--pagew'))
      return [element.getBoundingClientRect().width, Math.min(available, cap)]
    })
    expect(table, `${w} 论文表`).toBeCloseTo(expected!, 0)
    await noOverflow(win)

    // Recent Changes: entries fill the content column at this size's --pagew, and the actions revealed on
    // hover do not push a row out of the desktop area.
    await win.locator('[data-desk="changelog"]').click()
    await shown(win).locator('.crow').first().waitFor()
    expect(await ratio(win, '.crow'), `${w} 最近变动`).toBeGreaterThan(0.6)
    await shown(win).locator('.crow').first().hover()
    await expect(shown(win).locator('.crow .cact').first()).toHaveCSS('opacity', '1')
    await noOverflow(win)

    // Project list and details
    await win.locator('[data-desk="resproj"]').click()
    await shown(win).locator('.projpanel').first().waitFor()
    expect(await ratio(win, '.projpanel'), `${w} 项目列表`).toBeGreaterThan(0.6)
    await noOverflow(win)
    await win.locator('[data-proj="draft"]').click()
    await shown(win).locator('.wkpage').waitFor()
    expect(await ratio(win, '.wkpage'), `${w} 项目详情`).toBeGreaterThan(0.45)
    await noOverflow(win)

    // Chat screen: the message column uses --chatw, not --pagew. At all four sizes 92% of .stream is wider
    // than --chatw, so the width measured is the tier's own value; the other operand of min() never applies.
    await win.locator('#chatList .chat-row', { hasText: CHAT_WITH_MESSAGES }).click()
    await shown(win).locator('.msgs .mwrap').first().waitFor()
    const chatw = chatwOf(width)
    await expect.poll(() => win.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--chatw').trim())).toBe(chatw)
    const column = (await shown(win).locator('.msgs .mwrap').first().boundingBox())!
    expect(column.width, `${w} 对话屏消息列`).toBeCloseTo(parseFloat(chatw), 0)
    await noStreamOverflow(win)

    // A wide window uses the large card, with a three-line summary.
    await win.locator('[data-desk="wiki"]').click()
    await shown(win).locator('.wkgrid .wkcard').first().waitFor()
    await expect(shown(win).locator('.wkcard .wm').first()).toHaveCSS('-webkit-line-clamp', wide ? '3' : '2')
  }
})
