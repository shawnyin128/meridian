import { expect, gotoPapers, test, type MeridianWindow } from './app.js'
import type { Locator, Page } from '@playwright/test'

/** The width of the fade area is the same number as `--clipfade` in tokens.css. */
const FADE = 28

/** The transition time of the line background color (`--t-fast` 120ms) plus one frame margin. You must wait for it to finish before taking a sample, otherwise the color will be measured halfway. */
const SETTLE = 180

/** Two extra-long session titles, one each in Latin and Chinese: no line breaks, and the full width before truncation exceeds the 320px upper limit of the sidebar. */
const LONG_TITLES = [
  ['拉丁', 'Compositional Generalization of Retrieval Augmented Language Models Under Distribution Shift'],
  ['中文', '检索增强语言模型在分布偏移之下的组合泛化能力究竟还成不成立这个问题的再检验'],
] as const

/** Things measured in a screenshot: the background color, the background color of the rightmost column, and the ink color of each column. The color is `0xrrggbb`. */
type Shot = { bg: number; tail: number; ink: number[] }

/**
 * Return the screenshot of the element to the page to decode it and measure its background color and column-by-column ink color. The background color is the color that appears most in the entire image.
 * The ink color of a certain column is the maximum channel difference between all pixels in the column and the background color - the background color itself is 0, and the whole word is about two hundred.
 */
async function shoot(win: Page, target: Locator): Promise<Shot> {
  const png = (await target.screenshot()).toString('base64')
  return win.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)

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
  }, png)
}

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
const apart = (a: number, b: number): number => Math.max(
  Math.abs((a >> 16) - (b >> 16)),
  Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)),
  Math.abs((a & 255) - (b & 255)))

/**
 * Measures the fade of a title and writes the measured number to stdout. `backdrop` is the row/column where the title is located,
 * Its background color is the color that should be revealed after the title fades out. Returns the background color of `backdrop` for cross-state comparison.
 * The criterion is the ratio of the ink color of two samples of the same text with the mask turned on and the mask turned off: `--clipfade` in the fade-out area is a line
 * For a linear slope, only half of the ink should be left on average; the mask should be opaque outside the fade-out area, which should be fine at all.
 * `pose` puts the measured row back to its proper state. Taking a screenshot of an element picture will move the pointer away, so the hover state is in the first picture.
 * After drawing, start to go back. The three background colors will be measured in the three pictures. Replace each picture once before, and the three pictures will be consistent.
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
  // The fade must be a mask, not a layer of background color stacked on top: there are two sets of background colors for hover and selection in the row, and the layered color will be exposed if the background is changed.
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
 * In the uncropped title, the ratio of ink colors sampled twice when the mask switch is turned on. The fade area should be 1 when it falls outside the tail of the text:
 * Once the masked element shrinks to the width of text, the tail of the short title will fall into the fade-out area, and the number will drop.
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
  expect(await fullInk(win, '侧栏-短标题', row.locator('.ct-t')), '短标题该原样显示').toBe(1)

  await gotoPapers(win)
  const leaf = win.locator('#crumb .cseg').last()
  await expect(leaf).toHaveText('论文')
  expect(await fullInk(win, '面包屑-短末段', leaf), '短末段该原样显示').toBe(1)
})

// Measure three places for each type of text, one switch mask for each place, and eighteen element screenshots for one use case. The screenshot requires the compositor to give one frame,
// When the window is not on the screen, one picture takes one second, which cannot be accommodated in the thirty-second use case budget.
test.describe(() => {
  test.use({ showWindow: true })

  test('长标题裁掉之后向右渐隐,不留省略号,底色不受影响', async ({ win }) => {
    const sidebar = () => win.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width)
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

      const hovered = await measureFade(win, `侧栏-${script}-hover`, row, row.locator('.ct-t'),
        () => row.hover())
      expect(await sidebar(), `${script} 长标题不该顶宽侧栏`).toBe(before)

      // Click on this line to select it; the pointer will hover when it is left on the line. Move it into the text area and measure again.
      await row.click()
      const chosen = await measureFade(win, `侧栏-${script}-选中`, row, row.locator('.ct-t'),
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
