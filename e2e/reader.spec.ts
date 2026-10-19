import type { Page } from '@playwright/test'
import { expect, gotoPapers, settle, test, type MeridianWindow } from './app.js'

/** Visited screens stay mounted, so reader selectors are scoped to the screen shown. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

const call = <T>(win: Page, method: string, params: unknown) => win.evaluate(
  ([m, p]) => (window as unknown as MeridianWindow).meridian.call(m as string, p) as Promise<T>,
  [method, params] as const,
)

/** Each page of the original text in the fixture vault is 612 × 792 pt. */
const PAGE = { width: 612, height: 792 }

/** The reader's fit scale: zoom 1 fits a page to 830px wide, at most 1.6×, before the device pixel ratio. */
const FIT = Math.min(830 / PAGE.width, 1.6)

/**
 * The papers and page counts of the three source PDFs in the fixture vault, all under
 * `apps/desktop/src/core/fixtures/vault/sources/papers/`. The three page counts differ, so the
 * number of pages drawn shows which one was parsed.
 */
const READABLE = { title: 'STAR: SPECULATIVE DECODING', pages: 2 }
/** The readable paper's full title, which the reader's head and breadcrumb show. */
const READABLE_TITLE = 'STAR: SPECULATIVE DECODING WITH SEARCHABLE DRAFTING AND TARGET-AWARE REFINEMENT FOR MULTIMODAL GENERATION'
/** The paper the inbox entry specdec points to, once it is downloaded into the vault. */
const INGESTED = { entry: 'specdec', pages: 3 }
/** The paper the Read Later entry mixtral points to, already in the vault. */
const QUEUED = { entry: 'mixtral', pages: 5 }

/** Where the test that reopens a paper scrolls to; it must lie within the pages after one zoom-in. */
const SCROLLED = 400

/** How many vault writes the no-re-parse test makes elsewhere while the reader stays mounted. */
const VAULT_WRITES = 5

/**
 * The two papers the switching tests read: both in the vault with a source PDF, and with different
 * page counts, so the pages drawn show which paper is on screen.
 */
const SWITCHED = [READABLE, { title: 'Mixtral of Experts', pages: QUEUED.pages }]

/** Filters the paper table to this title and clicks the row to open its detail panel. */
async function selectPaper(win: Page, title: string): Promise<void> {
  await win.locator('#libq').fill(title)
  await expect(win.locator('.ptable tbody tr')).toHaveCount(1)
  await win.locator('.ptable tbody tr').click()
}

/** Goes to Papers, filters to the readable paper and opens its detail panel. */
async function selectReadable(win: Page): Promise<void> {
  await gotoPapers(win)
  await selectPaper(win, READABLE.title)
}

/** Opens the readable paper's detail panel from the paper table, then clicks "Start reading". */
async function openFromPapers(win: Page): Promise<void> {
  await selectReadable(win)
  await shown(win, '.pdetail [title="开始阅读"]').click()
}

/**
 * For each page drawn in the reader: its box's width and height, the ink pixels on the canvas (opaque
 * and dark), the pixels never drawn (fully transparent), and the page's total pixels. An unpainted
 * canvas is transparent black, so counting dark pixels alone would read a blank page as all ink;
 * hence both counts.
 */
const inked = (win: Page) => shown(win, '.pdfpagebox').evaluateAll((boxes) => boxes.map((box) => {
  const canvas = box.querySelector('canvas')!
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let ink = 0
  let untouched = 0
  for (let at = 0; at < data.length; at += 4) {
    if (data[at + 3] === 0) untouched += 1
    else if (data[at]! < 250) ink += 1
  }
  return {
    width: box.clientWidth, height: box.clientHeight, ink, untouched, pixels: data.length / 4,
  }
}))

/**
 * Asserts the reader draws exactly the parsed PDF: `pages` pages, each in a box of the page size
 * scaled by the fit ratio, painted all over, with ink, and not a solid color. Returns each page's
 * measurements.
 */
async function expectPainted(win: Page, pages: number) {
  await expect(shown(win, '.pdfpagebox')).toHaveCount(pages)
  await expect(shown(win, '.pdfpagebox[data-painted="1"]')).toHaveCount(pages)
  const painted = await inked(win)

  // The page count and page size can only come from the parsed PDF, not from boxes the UI sets itself.
  expect(painted).toHaveLength(pages)
  for (const page of painted) {
    expect(page.width).toBe(Math.floor(PAGE.width * FIT))
    expect(page.height).toBe(Math.floor(PAGE.height * FIT))
    // The whole page is drawn, on a white background, with text on it: together these show this PDF was drawn.
    expect(page.untouched).toBe(0)
    expect(page.ink).toBeGreaterThan(0)
    expect(page.ink).toBeLessThan(page.pixels)
  }
  return painted
}

test('论文详情面板的「开始阅读」进阅读器,vault 里的 PDF 真的解析并画了出来', async ({ win }) => {
  await openFromPapers(win)
  console.log(`阅读器画出的页 ${JSON.stringify(await expectPainted(win, READABLE.pages))}`)
})

test('阅读器右栏平滑展开并在收起后只保留工具轨', async ({ win }) => {
  await openFromPapers(win)
  const side = shown(win, '.reader-side')
  await expect(side).toHaveClass(/\bcollapsed\b/)
  expect(await side.evaluate((element) => getComputedStyle(element).transitionProperty))
    .toContain('flex-basis')

  await shown(win, '.reader-rail [title="元数据"]').click()
  await expect(side).not.toHaveClass(/\bcollapsed\b/)
  await expect.poll(() => side.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(300)
  expect(await side.locator('.paper-meta').evaluate((element) => getComputedStyle(element).animationName))
    .toContain('detail-panel-content-in')

  await shown(win, '.reader-rail [title="元数据"]').click()
  await expect(side).toHaveClass(/\bcollapsed\b/)
  await expect.poll(() => side.evaluate((element) => element.getBoundingClientRect().width))
    .toBeLessThan(60)
})

test('对话栏右缘的把手悬停显形、拖动在 240–480px 间调宽、单击收起成窄边；窄边、Ctrl+B 与标题栏按钮都能再开合', async ({ win }) => {
  await openFromPapers(win)
  const chat = shown(win, '.paper-chat')
  const grip = shown(win, '.paper-chat > #rrgrip')
  const edge = win.locator('.paper-chat-edge')
  const width = () => chat.evaluate((element) => element.getBoundingClientRect().width)
  const opacity = () => chat.evaluate((element) => getComputedStyle(element).opacity)
  const dragBy = async (dx: number) => {
    const box = (await grip.boundingBox())!
    const y = box.y + box.height / 2
    await win.mouse.move(box.x + box.width / 2, y)
    await win.mouse.down()
    await win.mouse.move(box.x + box.width / 2 + dx, y, { steps: 5 })
    await win.mouse.up()
  }

  await grip.hover()
  await expect.poll(() => grip.evaluate((element) => getComputedStyle(element, '::after').opacity)).toBe('1')
  await dragBy(400)
  expect(await width()).toBe(480)
  await dragBy(-400)
  expect(await width()).toBe(240)

  // A press without moving is a click on the grip, which collapses the chat.
  await grip.click()
  await expect(edge).toBeVisible()
  await settle(chat)
  expect(await opacity()).toBe('0')
  await edge.click()
  await expect(edge).toHaveCount(0)
  await settle(chat)
  expect(await opacity()).toBe('1')
  expect(await width()).toBe(240)

  await win.keyboard.press('Control+b')
  await expect(edge).toBeVisible()
  await win.locator('#sbBtn').click()
  await expect(edge).toHaveCount(0)
})

test('先排好所有页的框,再从视口附近开始画;第一页先于其余页画完', async ({ win }) => {
  await selectReadable(win)
  await win.evaluate(() => {
    const order: number[] = []
    let boxesBeforeFirstPaint = -1
    const observer = new MutationObserver(() => {
      document.querySelectorAll<HTMLElement>('.pdfpagebox[data-painted="1"]').forEach((box) => {
        const page = Number(box.dataset['page'])
        if (!order.includes(page)) {
          if (order.length === 0) boxesBeforeFirstPaint = document.querySelectorAll('.pdfpagebox').length
          order.push(page)
        }
      })
    })
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-painted'] })
    ;(window as unknown as { __paintOrder: () => { order: number[]; boxesBeforeFirstPaint: number } }).__paintOrder =
      () => ({ order, boxesBeforeFirstPaint })
  })
  await shown(win, '.pdetail [title="开始阅读"]').click()
  await expectPainted(win, READABLE.pages)
  const seen = await win.evaluate(() => (window as unknown as { __paintOrder: () => { order: number[]; boxesBeforeFirstPaint: number } }).__paintOrder())
  expect(seen.boxesBeforeFirstPaint).toBe(READABLE.pages)
  expect(seen.order[0]).toBe(1)
  expect(seen.order).toHaveLength(READABLE.pages)
})

/**
 * Records every Worker the page creates and terminates from now on. Each parse starts one Worker and
 * destroying its document terminates it, so the difference of the two counts is the documents alive.
 */
const recordWorkers = (win: Page) => win.evaluate(() => {
  const made: string[] = []
  const killed: string[] = []
  Object.assign(window, { madeWorkers: made, killedWorkers: killed })
  const Real = window.Worker
  window.Worker = class extends Real {
    src: string
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options)
      this.src = String(url)
      made.push(this.src)
    }

    override terminate(): void {
      killed.push(this.src)
      super.terminate()
    }
  } as unknown as typeof Worker
})

/** Worker addresses that have been created (`made`) or destroyed (`killed`) by pdf.js after `recordWorkers`. */
const pdfWorkers = async (win: Page, of: 'made' | 'killed' = 'made') => (await win.evaluate(
  (key) => (window as unknown as Record<string, string[]>)[key]!, `${of}Workers`))
  .filter((url) => url.includes('pdf.worker'))

test('解析跑在 pdf.js 起的 Worker 里,没有退回主线程', async ({ win }) => {
  await selectReadable(win)
  // When a Worker cannot start, pdf.js silently falls back to parsing on the main thread, so record each
  // Worker created from here on.
  await recordWorkers(win)

  await shown(win, '.pdetail [title="开始阅读"]').click()
  await expect(shown(win, '.pdfpagebox')).toHaveCount(READABLE.pages)

  const made = await pdfWorkers(win)
  console.log(`阅读器建的 Worker ${JSON.stringify(made)}`)
  expect(made).toHaveLength(1)
})

test('别处写库不会把原文重解析一遍', async ({ win }) => {
  await selectReadable(win)
  await recordWorkers(win)
  await shown(win, '.pdetail [title="开始阅读"]').click()
  await expect(shown(win, '.pdfpagebox')).toHaveCount(READABLE.pages)
  expect(await pdfWorkers(win)).toHaveLength(1)

  // Each pause or resume of a watch in Watch settings is a vault write. The reader stays mounted, only
  // hidden behind this screen; re-fetching on every write would start one more worker per write and
  // never destroy the replaced document. The global sidebar is collapsed while reading, so leave
  // through the reader's own back button, then open Watch settings from the Inbox screen.
  await shown(win, '.paper-chat-head .back').click()
  await win.locator('[data-inbox="all"]').click()
  await shown(win, '[title="关注设置"]').click()
  const watched = win.locator('.setdlg .wrow').first()
  for (let n = 0; n < VAULT_WRITES; n += 1) {
    const pausing = n % 2 === 0
    await watched.locator('.btn', { hasText: pausing ? '暂停' : '恢复' }).click()
    await expect(watched.locator('.src')).toHaveCount(pausing ? 1 : 0)
  }

  // Back in the reader: the pages are drawn as before, and the PDF is not parsed again.
  await win.keyboard.press('Escape')
  await win.locator('[data-desk="papers"]').click()
  await shown(win, '.pdetail [title="开始阅读"]').click()
  await expectPainted(win, READABLE.pages)
  const made = await pdfWorkers(win)
  console.log(`${VAULT_WRITES} 次库写之后阅读器建的 Worker ${JSON.stringify(made)}`)
  expect(made).toHaveLength(1)
})

test('换一篇读,新篇解析期间屏上没有上一篇的页', async ({ win }) => {
  await gotoPapers(win)
  await selectPaper(win, READABLE.title)
  await shown(win, '.pdetail [title="开始阅读"]').click()
  await expectPainted(win, READABLE.pages)
  await shown(win, '.paper-chat-head .back').click()
  await selectPaper(win, SWITCHED[1]!.title)

  // Watch every DOM change from the click onwards: once the header names the new paper, the sheet may be empty or
  // hold the new page count, never the previous paper's pages.
  await win.evaluate(([staleCount, nextTitle]) => {
    const seen = { stale: false, cleared: false }
    const check = () => {
      const head = document.querySelector('.paper-chat-head')?.textContent ?? ''
      if (!head.includes(nextTitle as string)) return
      const boxes = document.querySelectorAll('.pdfpagebox').length
      if (boxes === staleCount) seen.stale = true
      if (boxes === 0) seen.cleared = true
    }
    new MutationObserver(check).observe(document.body, { subtree: true, childList: true, characterData: true })
    ;(window as unknown as { __switchSeen: typeof seen }).__switchSeen = seen
  }, [READABLE.pages, 'Mixtral'] as const)
  await shown(win, '.pdetail [title="开始阅读"]').click()
  await expectPainted(win, SWITCHED[1]!.pages)

  const seen = await win.evaluate(() => (window as unknown as { __switchSeen: { stale: boolean; cleared: boolean } }).__switchSeen)
  expect(seen.stale).toBe(false)
  expect(seen.cleared).toBe(true)
})

// These tests take twenty actions over five papers, and before each one Playwright waits for the
// element to be stable, comparing its position in two consecutive frames. Offscreen a frame takes one
// second, so each wait takes two, and twenty of them do not fit the 30-second test budget.
test.describe(() => {
  test.use({ showWindow: true })

  test('换篇时留着最近两篇的解析结果,第三篇进来时销毁最早那一篇', async ({ win }) => {
    await gotoPapers(win)
    await recordWorkers(win)

    // A: open the first readable paper and leave.
    await selectPaper(win, READABLE.title)
    await shown(win, '.pdetail [title="开始阅读"]').click()
    await expectPainted(win, READABLE.pages)
    await shown(win, '.paper-chat-head .back').click()
    await expect(shown(win, '.ptable')).toHaveCount(1)

    // B: open a second readable paper and leave; the cache now holds A and B.
    await selectPaper(win, SWITCHED[1]!.title)
    await shown(win, '.pdetail [title="开始阅读"]').click()
    await expectPainted(win, SWITCHED[1]!.pages)
    await shown(win, '.paper-chat-head .back').click()
    await expect(shown(win, '.ptable')).toHaveCount(1)

    // C: download the inbox entry and open it; the cache is full, so this evicts A.
    const entries = await call<{ id: string; title: string; paper: string }[]>(win, 'inbox.list', {})
    const target = entries.find((e) => e.id === INGESTED.entry)!
    await win.locator('#rowInboxAll').click()
    await shown(win, `.pcard[data-pid="${target.id}"] [title="下载并入库"]`).click()
    await shown(win, `.pcard[data-pid="${target.id}"] [title="开始阅读"]`).click()
    await expectPainted(win, INGESTED.pages)
    await shown(win, '.paper-chat-head .back').click()

    // A again: no longer cached, so it is re-parsed and evicts B.
    await gotoPapers(win)
    await selectPaper(win, READABLE.title)
    await shown(win, '.pdetail [title="开始阅读"]').click()
    await expectPainted(win, READABLE.pages)

    const made = await pdfWorkers(win)
    const killed = await pdfWorkers(win, 'killed')
    console.log(`A、B、C、A 四次进入阅读器后 pdf.js 起了 ${made.length} 个 worker、销毁了 ${killed.length} 个`)
    // A, B, C, A: C evicts A, then A evicts B, so four documents were parsed and two are alive.
    expect(made).toHaveLength(4)
    expect(made.length - killed.length).toBe(2)
  })

  test('回到刚读过的那一篇,用留着的解析结果,不再起 worker', async ({ win }) => {
    await gotoPapers(win)
    await recordWorkers(win)

    await selectPaper(win, READABLE.title)
    await shown(win, '.pdetail [title="开始阅读"]').click()
    await expectPainted(win, READABLE.pages)
    await shown(win, '.paper-chat-head .back').click()
    await expect(shown(win, '.ptable')).toHaveCount(1)

    await selectPaper(win, SWITCHED[1]!.title)
    await shown(win, '.pdetail [title="开始阅读"]').click()
    await expectPainted(win, SWITCHED[1]!.pages)
    await shown(win, '.paper-chat-head .back').click()
    await expect(shown(win, '.ptable')).toHaveCount(1)

    await selectPaper(win, READABLE.title)
    await shown(win, '.pdetail [title="开始阅读"]').click()
    await expectPainted(win, READABLE.pages)

    const made = await pdfWorkers(win)
    const killed = await pdfWorkers(win, 'killed')
    expect(made).toHaveLength(2)
    expect(killed).toHaveLength(0)
  })

  test('留着解析结果的论文被删掉后,它的 worker 跟着销毁', async ({ win }) => {
    await gotoPapers(win)
    await recordWorkers(win)

    await selectPaper(win, READABLE.title)
    await shown(win, '.pdetail [title="开始阅读"]').click()
    await expectPainted(win, READABLE.pages)
    await shown(win, '.paper-chat-head .back').click()
    await expect(shown(win, '.ptable')).toHaveCount(1)

    await selectPaper(win, SWITCHED[1]!.title)
    await shown(win, '.pdetail [title="开始阅读"]').click()
    await expectPainted(win, SWITCHED[1]!.pages)
    await shown(win, '.paper-chat-head .back').click()
    await expect(shown(win, '.ptable')).toHaveCount(1)

    // The reader still holds the second paper; the first one is only kept in the cache.
    await selectPaper(win, READABLE.title)
    await win.locator('.ptable tbody tr').hover()
    await win.locator('.ptable tbody tr .rowx').click()
    await expect(win.locator('#banner span')).toHaveText('已移入垃圾桶 · 7 天内可恢复')

    await expect.poll(async () => (await pdfWorkers(win, 'killed')).length).toBe(1)
    expect(await pdfWorkers(win)).toHaveLength(2)
  })
})

test('阅读器顶栏与面包屑写的是这一篇,面包屑上一段回到论文屏', async ({ win }) => {
  await openFromPapers(win)

  await expect(shown(win, '.paper-chat-head strong')).toHaveText(`${READABLE_TITLE} · 阅读中`)
  await expect(win.locator('#crumb .cseg')).toHaveText(['我的库', '论文', READABLE_TITLE])
  // Of the segments taken from the screen the reader came from, only the last is a link, back to that screen.
  await expect(win.locator('#crumb .cseg.link')).toHaveText(['论文'])

  await win.locator('#crumb .cseg.link', { hasText: '论文' }).click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['我的库', '论文'])
  await expect(shown(win, '.ptable')).toHaveCount(1)
})

test('返回钮回到来路那一屏,阅读器里读到哪一篇还留着', async ({ win }) => {
  await openFromPapers(win)
  await expect(shown(win, '.pdfpagebox')).toHaveCount(READABLE.pages)

  await shown(win, '.paper-chat-head .back').click()
  await expect(shown(win, '.ptable')).toHaveCount(1)

  await shown(win, '.pdetail [title="开始阅读"]').click()
  await expect(shown(win, '.paper-chat-head strong')).toHaveText(`${READABLE_TITLE} · 阅读中`)
  await expect(shown(win, '.pdfpagebox')).toHaveCount(READABLE.pages)
})

test('同一篇再进来,读到哪儿、放大到几倍都留着', async ({ win }) => {
  await openFromPapers(win)
  await expectPainted(win, READABLE.pages)

  await shown(win, '.zoomctl [title="放大"]').click()
  await expect(shown(win, '.zoomctl .zoom-reset')).toHaveText('120%')
  // Settling the zoom moves the scroll to keep the page point at the zoom position in place, so wait
  // until the whole paper is drawn, then two more frames, before scrolling to the position to remember.
  await expect.poll(async () => {
    const pages = await inked(win)
    return pages.length === READABLE.pages && pages.every((p) => p.untouched === 0)
  }).toBe(true)
  await win.evaluate(() => new Promise<null>((done) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done(null)))))
  await shown(win, '.pdfwrap').evaluate((el, top) => { el.scrollTop = top }, SCROLLED)
  await expect(shown(win, '.pdfwrap')).toHaveJSProperty('scrollTop', SCROLLED)

  await shown(win, '.paper-chat-head .back').click()
  await expect(shown(win, '.ptable')).toHaveCount(1)
  await shown(win, '.pdetail [title="开始阅读"]').click()

  await expect(shown(win, '.zoomctl .zoom-reset')).toHaveText('120%')
  await expect(shown(win, '.pdfwrap')).toHaveJSProperty('scrollTop', SCROLLED)
  await expect(shown(win, '.pdfpagebox').first())
    .toHaveJSProperty('clientWidth', Math.floor(PAGE.width * FIT * 1.2))
})

test('同一篇再进来按当下的库重取,不吃上一次的结果', async ({ win }) => {
  const entries = await call<{ id: string; title: string; paper: string }[]>(win, 'inbox.list', {})
  const target = entries.find((e) => e.id === INGESTED.entry)!

  await win.locator('#rowInboxAll').click()
  await shown(win, `.pcard[data-pid="${target.id}"] [title="下载并入库"]`).click()
  await shown(win, `.pcard[data-pid="${target.id}"] [title="开始阅读"]`).click()
  await expectPainted(win, INGESTED.pages)

  // Delete the paper from Papers: the reader stays open on the same paper, which is no longer in the vault.
  await shown(win, '.paper-chat-head .back').click()
  await gotoPapers(win)
  await win.locator('#libq').fill(target.title.slice(0, 24))
  await expect(win.locator('.ptable tbody tr')).toHaveCount(1)
  await win.locator('.ptable tbody tr td').last().hover()
  await win.locator('.ptable tbody tr .rowx').click()
  await expect(win.locator('.ptable tbody tr')).toHaveCount(0)

  await win.locator('#rowInboxAll').click()
  await shown(win, `.pcard[data-pid="${target.id}"] [title="开始阅读"]`).click()
  await expect(shown(win, '.pdfload')).toHaveText(`论文不存在：${target.paper}`)

  // Restored from the Trash, the same paper opens without the earlier error. The global sidebar is
  // collapsed while reading, so leave through the back button.
  await shown(win, '.paper-chat-head .back').click()
  await win.locator('[data-desk="trash"]').click()
  await win.locator('.tgroup .trow .btn', { hasText: '恢复' }).click()
  await win.locator('#rowInboxAll').click()
  await shown(win, `.pcard[data-pid="${target.id}"] [title="开始阅读"]`).click()
  await expect(shown(win, '.pdfload')).toHaveCount(0)
  await expect(shown(win, '.pdfpagebox')).toHaveCount(INGESTED.pages)
})

test('放大一档,页面按新的比例重画,百分比跟着变', async ({ win }) => {
  await openFromPapers(win)
  await expect(shown(win, '.pdfpagebox')).toHaveCount(READABLE.pages)
  await expect(shown(win, '.zoomctl .zoom-reset')).toHaveText('100%')

  await shown(win, '.zoomctl [title="放大"]').click()
  await expect(shown(win, '.zoomctl .zoom-reset')).toHaveText('120%')
  await expect(shown(win, '.pdfpagebox').first())
    .toHaveJSProperty('clientWidth', Math.floor(PAGE.width * FIT * 1.2))
})

test('收件里下载入库那一条的「开始阅读」进阅读器,入库那一篇的原文真的画了出来', async ({ win }) => {
  const entries = await call<{ id: string; title: string; paper: string; downloaded: boolean }[]>(
    win, 'inbox.list', {})
  const target = entries.find((e) => !e.downloaded)!
  expect(target.id).toBe(INGESTED.entry)
  // `paper` is the ID the paper gets once added to the vault; the inbox entry's own ID is not a paper ID.
  expect(target.paper).toMatch(/^paper-pdf-[0-9a-f]{12}$/)

  await win.locator('#rowInboxAll').click()
  await shown(win, `.pcard[data-pid="${target.id}"] [title="下载并入库"]`).click()
  await shown(win, `.pcard[data-pid="${target.id}"] [title="开始阅读"]`).click()

  await expect(win.locator('#crumb .cseg'))
    .toHaveText(['收件', '论文推送', target.title.split(':')[0]!])
  console.log(`收件入库那一篇画出的页 ${JSON.stringify(await expectPainted(win, INGESTED.pages))}`)
})

test('从某一条关注那一档进阅读器,面包屑是那一档的三段加这一篇', async ({ win }) => {
  const watches = await call<{ id: string; type: string; name: string }[]>(win, 'watch.list', {})
  const watched = watches[0]!
  const entries = await call<{ id: string; title: string; watch: string }[]>(win, 'inbox.list', {})
  const target = entries.find((e) => e.watch === watched.id)!

  await win.locator(`[data-inbox="${watched.id}"]`).click()
  await shown(win, `.pcard[data-pid="${target.id}"] [title="下载并入库"]`).click()
  await shown(win, `.pcard[data-pid="${target.id}"] [title="开始阅读"]`).click()

  await expect(win.locator('#crumb .cseg'))
    .toHaveText(['收件', '主题', watched.name, target.title.split(':')[0]!])
  await expect(win.locator('#crumb .cseg.link')).toHaveText([watched.name])
})

test('稍后阅读里指着库内一篇的那条,「开始阅读」把那一篇的原文画了出来', async ({ win }) => {
  const queued = await call<{ id: string; title: string; paper: string }[]>(win, 'later.list', {})
  const target = queued.find((e) => e.id === QUEUED.entry)!

  await win.locator('#rowLater').click()
  await shown(win, `.pcard[data-pid="${target.id}"] [title="开始阅读"]`).click()

  await expect(win.locator('#crumb .cseg'))
    .toHaveText(['收件', '稍后阅读', target.title.split(':')[0]!])
  console.log(`稍后阅读那一篇画出的页 ${JSON.stringify(await expectPainted(win, QUEUED.pages))}`)
})

test('内化到 Wiki 先展示完整费用范围,明确确认后才消费一次授权计划', async ({ win }) => {
  await openFromPapers(win)
  await shown(win, '.reader-rail [title="内化到 Wiki"]').click()
  await expect(shown(win, '.wiki-ingest')).toContainText('生成一份可审核的 Wiki 提案')

  await shown(win, '.wiki-ingest .harness-trigger').click()
  const dialog = win.locator('[role="alertdialog"]')
  await expect(dialog).toContainText('本地或演示流程，不会产生 API 费用')
  await expect(dialog).toContainText('当前论文')
  await expect(dialog).not.toContainText('预计输入')
  await expect(dialog).not.toContainText('运行上限')
  await expect(shown(win, '.wiki-ingest')).not.toContainText('授权门验证完成')

  await dialog.getByRole('button', { name: '开始生成' }).click()
  await expect(shown(win, '.wiki-ingest')).toContainText('授权门验证完成')
})
