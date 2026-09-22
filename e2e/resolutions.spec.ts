import type { Page } from '@playwright/test'
import { expect, test } from './app.js'

/** The screen you entered is always hanging, and the selector should be closed in the currently displayed screen. */
const shown = (win: Page) => win.locator('.screenslot:not([hidden])')

/** Four windows to be tested: notebook, default, full HD, and 2K. */
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

/** The window should be given the settings according to tokens.css --pagew: narrow range 1080, medium range 1320, wide range 1560. */
const pagewOf = (width: number): string => (width >= 2000 ? '1560px' : width >= 1600 ? '1320px' : '1080px')

/** The window should be given according to the gears of tokens.css --chatw: narrow gear 720, medium gear 880, wide gear 1000. */
const chatwOf = (width: number): string => (width >= 2000 ? '1000px' : width >= 1600 ? '880px' : '720px')

/** The session with messages in the fixture: the column width should be measured in the .msgs that actually has messages. */
const CHAT_WITH_MESSAGES = '摊薄的前提是共享前缀吗'

/** The dialog screen does not have a .desk-body, and its scrolling container is a .stream; horizontal overflow is also not allowed. */
async function noStreamOverflow(win: Page): Promise<void> {
  const [scroll, client] = await shown(win).locator('.stream').evaluate((el) => [el.scrollWidth, el.clientWidth])
  expect(scroll, '对话屏横向溢出').toBeLessThanOrEqual(client + 1)
}

test('四档窗口下主内容随窗口变宽,比例不低于下限,不横向溢出', async ({ win, app }) => {
  // Go through each of the five screens; the window that is not on the screen needs to wait two seconds for each operability.
  test.slow()
  for (const [w, h] of SIZES) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setSize(size.w, size.h), { w, h })
    // The system may push the window back to the screen size, and the position is calculated based on the actual viewport width.
    const width = await win.evaluate(() => window.innerWidth)
    await expect.poll(() => win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pagew').trim()))
      .toBe(pagewOf(width))
    const wide = width >= 1600

    // Wiki home page: The card grid covers the content columns; the content columns account for more than 60% of the desktop area
    await win.locator('[data-desk="wiki"]').click()
    await shown(win).locator('.wkgrid .wkcard').first().waitFor()
    expect(await ratio(win, '.wkgrid'), `${w} wiki 首页`).toBeGreaterThan(0.6)
    await noOverflow(win)
    // Scroll bar decision: The track is closed at 12px. .desk-body is scrollbar-gutter:stable, this width is permanent,
    // You don’t have to wait for the content to really overflow vertically to get it.
    const gutter = await shown(win).locator('.desk-body')
      .evaluate((el) => (el as HTMLElement).offsetWidth - el.clientWidth)
    expect(gutter, `${w} 桌面区滚动条轨道宽度`).toBe(12)

    // Wiki page: Text pages use the reading width and still occupy more than 45% of the desktop area.
    await shown(win).locator('[data-wk="topics/quantization"]').click()
    await shown(win).locator('.wkmain .md').waitFor()
    expect(await ratio(win, '.wkpage'), `${w} wiki 页`).toBeGreaterThan(0.45)
    await noOverflow(win)

    // Paper table: The table covers the desktop area; the table scrolls by itself, but the desktop area does not scroll.
    await win.locator('[data-desk="papers"]').click()
    await shown(win).locator('.ptable tbody tr').first().waitFor()
    expect(await ratio(win, '.libwide'), `${w} 论文表`).toBeGreaterThan(0.9)
    await noOverflow(win)

    // Recent changes: The content column of the file is covered with entries --pagew. The action of revealing the content when hovering does not push the row out of the desktop area.
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

    // Dialog screen: The message column is the one with --chatw, not --pagew. 92% of .stream in fourth gear are wider than --chatw,
    // So what is measured is the value of the gear itself, and the other half of min() does not have its turn here.
    await win.locator('#chatList .chat-row', { hasText: CHAT_WITH_MESSAGES }).click()
    await shown(win).locator('.msgs .mwrap').first().waitFor()
    const chatw = chatwOf(width)
    await expect.poll(() => win.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--chatw').trim())).toBe(chatw)
    const column = (await shown(win).locator('.msgs .mwrap').first().boundingBox())!
    expect(column.width, `${w} 对话屏消息列`).toBeCloseTo(parseFloat(chatw), 0)
    await noStreamOverflow(win)

    // The card is in a large format under a wide window: three lines of summary
    await win.locator('[data-desk="wiki"]').click()
    await shown(win).locator('.wkgrid .wkcard').first().waitFor()
    await expect(shown(win).locator('.wkcard .wm').first()).toHaveCSS('-webkit-line-clamp', wide ? '3' : '2')
  }
})
