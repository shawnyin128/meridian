import type { Locator, Page } from '@playwright/test'
import { expect, test } from './app.js'

// The thumb is read from the painted pixels, which only a window that paints has.
test.use({ showWindow: true })

/** How long a scrollbar stays after its area last scrolled (SCROLLBAR_IDLE_MS) plus the slow fade, --t-slow, and a margin. */
const GONE_AFTER = 1000 + 280 + 300

/**
 * The largest channel difference, 0 to 255, between any pixel of the area's vertical scrollbar strip
 * and the strip's most frequent colour: about 0 for a bare strip, tens with a thumb drawn on it.
 */
async function thumbInk(win: Page, area: Locator): Promise<number> {
  const strip = await area.evaluate((el) => {
    const box = el.getBoundingClientRect()
    return { x: box.left + el.clientLeft + el.clientWidth, y: box.top, width: box.right - box.left - el.clientLeft - el.clientWidth, height: box.height }
  })
  const png = (await win.screenshot({ clip: strip })).toString('base64')
  return win.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const counts = new Map<number, number>()
    for (let i = 0; i < data.length; i += 4) {
      const rgb = data[i]! * 65536 + data[i + 1]! * 256 + data[i + 2]!
      counts.set(rgb, (counts.get(rgb) ?? 0) + 1)
    }
    const ground = [...counts].sort((a, b) => b[1] - a[1])[0]![0]
    let most = 0
    for (let i = 0; i < data.length; i += 4) {
      most = Math.max(most, Math.abs(data[i]! - (ground >> 16)), Math.abs(data[i + 1]! - ((ground >> 8) & 255)),
        Math.abs(data[i + 2]! - (ground & 255)))
    }
    return most
  }, png)
}

/** Scrolls `area` with the wheel, the pointer on its content, away from its scrollbar. */
async function wheel(win: Page, area: Locator): Promise<void> {
  const box = (await area.boundingBox())!
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await win.mouse.wheel(0, 120)
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme === 'light' ? '亮色' : '暗色'}下侧栏和页面正文的滚动条静止时不显示,滚动时出现,停下约一秒后消失`, async ({ app, win }) => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1440, 480))
    await win.evaluate((dark) => {
      if (dark) document.documentElement.dataset.theme = 'dark'
      else delete document.documentElement.dataset.theme
    }, theme === 'dark')
    const sidebar = win.locator('.nav-pane-rows')
    const body = win.locator('.screenslot:not([hidden]) .desk-body').first()
    await body.locator('*').first().waitFor()

    for (const [name, area] of [['侧栏', sidebar], ['正文', body]] as const) {
      await expect.poll(() => area.evaluate((el) => el.scrollHeight > el.clientHeight), `${name}能滚动`).toBe(true)
      expect(await area.getAttribute('data-scrolling'), `${name}静止`).toBeNull()
      expect(await thumbInk(win, area), `${name}静止时滚动条处的墨迹`).toBeLessThan(8)

      await wheel(win, area)
      await expect(area, `${name}滚动后`).toHaveAttribute('data-scrolling', '')
      await expect.poll(() => thumbInk(win, area), `${name}滚动后滚动条处的墨迹`).toBeGreaterThan(30)

      await win.waitForTimeout(GONE_AFTER)
      expect(await area.getAttribute('data-scrolling'), `${name}停下之后`).toBeNull()
      expect(await thumbInk(win, area), `${name}停下之后滚动条处的墨迹`).toBeLessThan(8)
    }
  })
}

test('指针停在滚动条上或拖着滑块时滚动条一直显示,离开或松开约一秒后消失', async ({ app, win }) => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1440, 480))
  const body = win.locator('.screenslot:not([hidden]) .desk-body').first()
  await expect.poll(() => body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  const box = (await body.boundingBox())!
  const bar = await body.evaluate((el) => el.getBoundingClientRect().left + el.clientLeft + el.clientWidth + 6)

  await win.mouse.move(bar, box.y + 20)
  await expect(body).toHaveAttribute('data-scrolling', '')
  await win.waitForTimeout(GONE_AFTER)
  await expect(body, '指针停在滚动条上').toHaveAttribute('data-scrolling', '')
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await win.waitForTimeout(GONE_AFTER)
  expect(await body.getAttribute('data-scrolling'), '指针离开之后').toBeNull()

  await win.mouse.move(bar, box.y + 20)
  await win.mouse.down()
  await win.mouse.move(bar - 300, box.y + 120, { steps: 5 })
  await expect.poll(() => body.evaluate((el) => el.scrollTop), '拖动滑块会滚动').toBeGreaterThan(0)
  await win.waitForTimeout(GONE_AFTER)
  await expect(body, '按住滑块').toHaveAttribute('data-scrolling', '')
  await win.mouse.up()
  await win.waitForTimeout(GONE_AFTER)
  expect(await body.getAttribute('data-scrolling'), '松开之后').toBeNull()
})

test('减少动态效果时滚动条不淡入淡出,直接出现和消失', async ({ app, win }) => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1440, 480))
  await win.emulateMedia({ reducedMotion: 'reduce' })
  const body = win.locator('.screenslot:not([hidden]) .desk-body').first()
  await expect.poll(() => body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  const thumb = () => body.evaluate((el) => getComputedStyle(el).getPropertyValue('--sb-thumb'))
  const shown = await win.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.color = 'var(--sbthumb)'
    document.body.append(probe)
    const colour = getComputedStyle(probe).color
    probe.remove()
    return colour
  })
  // Two frames: long enough for a 1ms transition to end, far shorter than the fades it replaces.
  const settled = (on: boolean) => body.evaluate((el, show) => new Promise<string>((done) => {
    if (show) el.setAttribute('data-scrolling', '')
    else el.removeAttribute('data-scrolling')
    requestAnimationFrame(() => requestAnimationFrame(() => done(getComputedStyle(el).getPropertyValue('--sb-thumb'))))
  }), on)
  expect(await thumb()).toBe('rgba(0, 0, 0, 0)')
  expect(await settled(true), '出现').toBe(shown)
  expect(await settled(false), '消失').toBe('rgba(0, 0, 0, 0)')
})
