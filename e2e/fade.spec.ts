import { expect, gotoPapers, test, type MeridianWindow } from './app.js'
import type { Locator, Page } from '@playwright/test'

/** Width of the fade zone in px; must equal the one in `--clipfade` in tokens.css. */
const FADE = 28

/** The row background's transition (`--t-fast`, 120ms) plus a frame; sample after it ends, not mid-transition. */
const SETTLE = 180

/** Two over-long chat titles, one Latin and one Chinese: each is wider on one line than the sidebar's 320px maximum. */
const LONG_TITLES = [
  ['拉丁', 'Compositional Generalization of Retrieval Augmented Language Models Under Distribution Shift'],
  ['中文', '检索增强语言模型在分布偏移之下的组合泛化能力究竟还成不成立这个问题的再检验'],
] as const

/** One screenshot's measurements: background, rightmost column's background, ink per column; colors are `0xrrggbb`. */
type Shot = { bg: number; tail: number; ink: number[] }

/**
 * Screenshots the element, decodes the image in the page, and measures its background and per-column
 * ink over the pixels the element paints. The background is the most frequent color in the image. A
 * column's ink is the largest channel difference between any of its pixels and the background: 0 for
 * bare background, about 200 for solid text.
 */
async function shoot(win: Page, target: Locator): Promise<Shot> {
  const png = (await target.screenshot()).toString('base64')
  const box = (await target.boundingBox())!
  return win.evaluate(async ([b64, rect]) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    // Playwright clips the screenshot to the box's enclosing whole CSS pixels, while Chromium paints
    // the box from its edges rounded to the nearest device pixel: at a fractional edge the image has
    // a row or column outside the element.
    const dpr = devicePixelRatio
    const painted = (from: number, size: number) =>
      [from, from + size].map((edge) => Math.round(edge * dpr) - Math.floor(from) * dpr) as [number, number]
    const [x0, x1] = painted(rect.x, rect.width)
    const [y0, y1] = painted(rect.y, rect.height)
    const { data, width, height } = ctx.getImageData(x0, y0, x1 - x0, y1 - y0)

    const rgb = (x: number, y: number): number => {
      const i = (y * width + x) * 4
      return data[i]! * 65536 + data[i + 1]! * 256 + data[i + 2]!
    }
    const mode = (colors: number[]): number => {
      const seen = new Map<number, number>()
      for (const c of colors) seen.set(c, (seen.get(c) ?? 0) + 1)
      let best = 0
      let most = -1
      for (const [c, n] of seen) if (n > most) { best = c; most = n }
      return best
    }
    const apart = (a: number, b: number): number => Math.max(
      Math.abs((a >> 16) - (b >> 16)),
      Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)),
      Math.abs((a & 255) - (b & 255)))

    const all: number[] = []
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) all.push(rgb(x, y))
    const bg = mode(all)

    const last: number[] = []
    for (let y = 0; y < height; y++) last.push(rgb(width - 1, y))

    const ink: number[] = []
    for (let x = 0; x < width; x++) {
      let d = 0
      for (let y = 0; y < height; y++) d = Math.max(d, apart(rgb(x, y), bg))
      ink.push(d)
    }
    return { bg, tail: mode(last), ink }
  }, [png, box] as const)
}

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
const apart = (a: number, b: number): number => Math.max(
  Math.abs((a >> 16) - (b >> 16)),
  Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)),
  Math.abs((a & 255) - (b & 255)))

/**
 * Measures the fade of one title and logs the numbers to stdout. `backdrop` is the row or bar the title
 * sits in; its background is the color the faded tail should reveal. Returns that background so
 * callers can compare states.
 * The check is the ratio of ink in two samples of the same text, mask on and mask off: `--clipfade` is
 * a linear ramp over the fade zone, so about half the ink should remain there on average, and the mask
 * is opaque outside it, so all the ink should remain.
 * `pose` puts the row back into the state under test. An element screenshot moves the pointer away, so
 * a hover starts to fade after the first shot and the three shots would see three backgrounds; posing
 * before every shot keeps them consistent.
 */
async function measureFade(win: Page, label: string, backdrop: Locator, target: Locator,
  pose: () => Promise<void>): Promise<number> {
  const box = (await target.boundingBox())!
  const shape = await target.evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
    mask: getComputedStyle(el).maskImage,
    ellipsis: getComputedStyle(el).textOverflow,
    color: getComputedStyle(el).backgroundColor,
    image: getComputedStyle(el).backgroundImage,
  }))
  expect(shape.scroll, `${label} 的文字要真的超出盒子`).toBeGreaterThan(shape.client)
  expect(shape.mask, `${label} 要挂着 --clipfade`).toContain('linear-gradient')
  expect(shape.ellipsis, `${label} 不该再出省略号`).toBe('clip')
  // The fade must be a mask, not a background color painted over the text: the row has separate hover
  // and selected backgrounds, and a painted color would show once the background changes.
  expect(shape.color, `${label} 不该自己画底色`).toBe('rgba(0, 0, 0, 0)')
  expect(shape.image, `${label} 不该自己画底色`).toBe('none')

  const sample = async (of: Locator): Promise<Shot> => {
    await pose()
    await win.waitForTimeout(SETTLE)
    return shoot(win, of)
  }
  const masked = await sample(target)
  await target.evaluate((el) => { (el as HTMLElement).style.maskImage = 'none' })
  const bare = await sample(target)
  await target.evaluate((el) => { (el as HTMLElement).style.maskImage = '' })
  const under = await sample(backdrop)

  const scale = masked.ink.length / box.width
  const edge = Math.round(masked.ink.length - FADE * scale)
  const inside = sum(masked.ink.slice(edge)) / sum(bare.ink.slice(edge))
  const outside = sum(masked.ink.slice(0, edge)) / sum(bare.ink.slice(0, edge))
  const rightmost = masked.ink[masked.ink.length - 1]! / bare.ink[bare.ink.length - 1]!

  console.log(`FADE ${label} 盒宽=${box.width}px 图宽=${masked.ink.length}px`
    + ` 渐隐区留墨=${inside.toFixed(3)} 区外留墨=${outside.toFixed(3)}`
    + ` 最右一列留墨=${rightmost.toFixed(3)} 尾端底色=${hex(masked.tail)} 行底色=${hex(under.bg)}`)
  console.log(`FADE ${label}   开遮罩逐列墨色(最后 ${FADE}px)`
    + ` ${JSON.stringify(masked.ink.slice(edge))}`)
  console.log(`FADE ${label}   关遮罩逐列墨色(最后 ${FADE}px)`
    + ` ${JSON.stringify(bare.ink.slice(edge))}`)

  expect(outside, `${label} 渐隐区之外的墨色该一点不差`).toBeGreaterThan(0.97)
  expect(inside, `${label} 渐隐区该按线性斜坡掉到一半上下`).toBeGreaterThan(0.3)
  expect(inside, `${label} 渐隐区该按线性斜坡掉到一半上下`).toBeLessThan(0.7)
  // The ramp has 0.5/28 opacity left at the center of the last pixel, so "barely" instead of "none at all"
  expect(rightmost, `${label} 最右一列该几乎不剩墨`).toBeLessThan(0.05)
  expect(apart(masked.tail, under.bg), `${label} 渐隐尾端露出的该是行自己的底色`)
    .toBeLessThanOrEqual(6)
  return under.bg
}

/**
 * For an untruncated title, the ratio of ink with the mask on to ink with it off. It stays close to 1
 * while the fade zone lies past the end of the text; if the masked element shrinks to the text's width,
 * the short title's tail falls into the fade zone and the ratio drops.
 */
async function fullInk(win: Page, label: string, target: Locator): Promise<number> {
  const shape = await target.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
  expect(shape.scroll, `${label} 该是没被裁的短标题`).toBeLessThanOrEqual(shape.client)

  const masked = await shoot(win, target)
  await target.evaluate((el) => { (el as HTMLElement).style.maskImage = 'none' })
  const bare = await shoot(win, target)
  await target.evaluate((el) => { (el as HTMLElement).style.maskImage = '' })

  const kept = sum(masked.ink) / sum(bare.ink)
  console.log(`FADE ${label} 盒宽=${shape.client}px 文字宽=${shape.scroll}px 留墨=${kept.toFixed(3)}`)
  return kept
}

test('短标题一点不被渐隐吃掉', async ({ win }) => {
  await win.locator('#chatList .chat-row').first().waitFor()
  await win.evaluate(() => (window as unknown as MeridianWindow).meridian
    .call('chat.create', { title: '短', named: true }))
  await win.reload()

  const row = win.locator('#chatList .chat-row').filter({ hasText: '短' })
  await expect(row).toHaveCount(1)
  expect(await fullInk(win, '侧栏-短标题', row.locator('.fade-text')), '短标题该原样显示').toBeGreaterThan(0.97)

  await gotoPapers(win)
  const leaf = win.locator('#crumb .cseg').last()
  await expect(leaf).toHaveText('论文')
  expect(await fullInk(win, '面包屑-短末段', leaf), '短末段该原样显示').toBeGreaterThan(0.97)
})

// Two scripts, three places each, three screenshots per place (mask on, mask off, backdrop): eighteen
// element screenshots in one test case, each waiting for a frame from the compositor; see `showWindow` in app.ts.
test.describe(() => {
  test.use({ showWindow: true })

  test('长标题裁掉之后向右渐隐,不留省略号,底色不受影响', async ({ win }) => {
    const sidebar = () => win.locator('#sidebar').evaluate((el) => el.getBoundingClientRect().width)
    await win.locator('#chatList .chat-row').first().waitFor()
    const before = await sidebar()

    for (const [, title] of LONG_TITLES) {
      await win.evaluate((t) => (window as unknown as MeridianWindow).meridian
        .call('chat.create', { title: t, named: true }), title)
    }
    await win.reload()

    for (const [script, title] of LONG_TITLES) {
      const row = win.locator('#chatList .chat-row').filter({ hasText: title })
      await expect(row).toHaveCount(1)

      const hovered = await measureFade(win, `侧栏-${script}-hover`, row, row.locator('.fade-text'),
        () => row.hover())
      expect(await sidebar(), `${script} 长标题不该顶宽侧栏`).toBe(before)

      // Click the row to select it; a pointer left on the row would add hover, so move it into the
      // content area before measuring.
      await row.click()
      const chosen = await measureFade(win, `侧栏-${script}-选中`, row, row.locator('.fade-text'),
        () => win.mouse.move(900, 600))
      expect(await sidebar(), `${script} 长标题不该顶宽侧栏`).toBe(before)
      expect(hex(chosen), 'hover 与选中本来就是两种底色,量到的该是两个值').not.toBe(hex(hovered))

      const leaf = win.locator('#crumb .cseg').last()
      await expect(leaf).toHaveText(title)
      await measureFade(win, `面包屑-${script}`, win.locator('.titlebar'), leaf,
        () => win.mouse.move(900, 600))
    }
  })
})
