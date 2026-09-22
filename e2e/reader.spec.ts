import type { Page } from '@playwright/test'
import { expect, gotoPapers, test, type MeridianWindow } from './app.js'

/** The screen you entered remains hanging, and the selector on the reader should be closed in the currently displayed screen. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

const call = <T>(win: Page, method: string, params: unknown) => win.evaluate(
  ([m, p]) => (window as unknown as MeridianWindow).meridian.call(m as string, p) as Promise<T>,
  [method, params] as const,
)

/** Each page of the original text in the fixture vault is 612 × 792 pt. */
const PAGE = { width: 612, height: 792 }

/** Demo paintPdf: When scaling 1, the page width is first reduced to 830, and then the screen is displayed according to the device pixel ratio. */
const FIT = Math.min(830 / PAGE.width, 1.6)

/**
 * The corresponding papers and page numbers of the three original texts in the fixture vault are all in
 * `apps/desktop/src/core/fixtures/vault/sources/papers/`. The number of pages in the three copies is different from each other, draw how many pages
 * Just indicate which part is parsed.
 */
const READABLE = { title: 'STAR: SPECULATIVE DECODING', pages: 2 }
/** The specdec item in the inbox points to after downloading it into the database. */
const INGESTED = { entry: 'specdec', pages: 3 }
/** Later, read the article pointed to by the Mixtral item in the queue, which is already in the library. */
const QUEUED = { entry: 'mixtral', pages: 5 }

/** "The same article is still there when you read it again." The position where the use case is scrolled must be within the page after zooming in one level. */
const SCROLLED = 400

/** The number of library writes made by the use case "Write the library elsewhere without re-parsing" while the browser is still hanging. */
const VAULT_WRITES = 5

/** The two articles read back using the use case of changing the article: both are in the library, both have the original text, the number of pages drawn is different, and the changed article can be recognized. */
const SWITCHED = [READABLE, { title: 'Mixtral of Experts', pages: QUEUED.pages }]

/** Filter out the article with this title from the article table and click on its details panel. */
async function selectPaper(win: Page, title: string): Promise<void> {
  await win.locator('#libq').fill(title)
  await expect(win.locator('.ptable tbody tr')).toHaveCount(1)
  await win.locator('.ptable tbody tr').click()
}

/** Go to the article screen, filter out that article and click on its details panel. */
async function selectReadable(win: Page): Promise<void> {
  await gotoPapers(win)
  await selectPaper(win, READABLE.title)
}

/** Filter out the article from the paper table, click on the details panel, and then click "Start Reading". */
async function openFromPapers(win: Page): Promise<void> {
  await selectReadable(win)
  await shown(win, '.pdetail [title="开始阅读"]').click()
}

/**
 * Each page drawn in the reader: the width and height of the frame, the number of ink dots (opaque and dark pixels) on the screen,
 * How many pixels have not been drawn at all (fully transparent), and how many pixels there are in total on one page. Unpainted canvas is completely transparent
 * For black, just counting "dark pixels" will treat it as if the entire page is full of ink, so count both.
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
 * Assert that the reader draws exactly the parsed PDF: exactly pages, each page is the page size according to the appropriate width ratio
 * The shrunken frame has been painted on the entire page, has ink, and is not a solid color. Return the number measured on each page.
 */
async function expectPainted(win: Page, pages: number) {
  await expect(shown(win, '.pdfpagebox')).toHaveCount(pages)
  await expect(shown(win, '.pdfpagebox[data-painted="1"]')).toHaveCount(pages)
  const painted = await inked(win)

  // The number of pages and page size can only come from the parsed PDF, not the boxes set by the interface itself.
  expect(painted).toHaveLength(pages)
  for (const page of painted) {
    expect(page.width).toBe(Math.floor(PAGE.width * FIT))
    expect(page.height).toBe(Math.floor(PAGE.height * FIT))
    // The entire page has been drawn, the bottom is white, and there are words on it: The three lines together indicate that the drawing is this PDF
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
 * From this moment on, record every Worker that has been created and destroyed on the page. Parse one at a time and destroy that document
 * Terminate, so the difference between the two numbers is the number of copies of the document that are still alive at this moment.
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
  // When the Worker cannot be started, pdf.js will silently return to the main thread for analysis, so write down each Worker created in this paragraph.
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

  // Push focus pause/resume in the settings, each time it is a library write; the reader is always hanging (just closed behind this screen),
  // Following writing and re-fetching, one more worker will be created for each write, and the deleted copy will not be destroyed. The global sidebar is retracted while reading,
  // You must first use the reader's own back button to exit the screen, and then open the push settings from the incoming screen.
  await shown(win, '.paper-chat-head .back').click()
  await win.locator('[data-inbox="all"]').click()
  await shown(win, '[title="关注设置"]').click()
  const watched = win.locator('.setdlg .wrow').first()
  for (let n = 0; n < VAULT_WRITES; n += 1) {
    const pausing = n % 2 === 0
    await watched.locator('.btn', { hasText: pausing ? '暂停' : '恢复' }).click()
    await expect(watched.locator('.src')).toHaveCount(pausing ? 1 : 0)
  }

  // Back to the reader: The drawing is still the same, and the analysis is not run again.
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

// Twenty times for five different chapters, each time you have to wait for Playwright to determine whether the element is stable: which criterion compares the two adjacent frames?
// Position, when the window is not on the screen, one frame is one second, one frame is two seconds, and the thirty-second use case budget cannot fit twenty frames.
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

  await expect(shown(win, '.paper-chat-head strong')).toHaveText('STAR · 阅读中')
  await expect(win.locator('#crumb .cseg')).toHaveText(['我的库', '论文', 'STAR'])
  // Among the borrowed paragraphs, only the last paragraph can be clicked. It is the entrance to the screen where you came from.
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
  await expect(shown(win, '.paper-chat-head strong')).toHaveText('STAR · 阅读中')
  await expect(shown(win, '.pdfpagebox')).toHaveCount(READABLE.pages)
})

test('同一篇再进来,读到哪儿、放大到几倍都留着', async ({ win }) => {
  await openFromPapers(win)
  await expectPainted(win, READABLE.pages)

  await shown(win, '.zoomctl [title="放大"]').click()
  await expect(shown(win, '.zoomctl span')).toHaveText('120%')
  // The final step in redrawing is to stop the scrolling back to the original proportions, wait for the entire article to be drawn in the new proportions, and then wait two frames before scrolling to the position you want to remember.
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

  await expect(shown(win, '.zoomctl span')).toHaveText('120%')
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

  // Delete this article from the paper screen. The reader is still open and I am reading the same article, but it is no longer in the library.
  await shown(win, '.paper-chat-head .back').click()
  await gotoPapers(win)
  await win.locator('#libq').fill(target.title.slice(0, 24))
  await expect(win.locator('.ptable tbody tr')).toHaveCount(1)
  await win.locator('.ptable tbody tr td').last().hover()
  await win.locator('.ptable tbody tr .rowx').click()
  await expect(win.locator('.ptable tbody tr')).toHaveCount(0)

  await win.locator('#rowInboxAll').click()
  await shown(win, `.pcard[data-pid="${target.id}"] [title="开始阅读"]`).click()
  await expect(shown(win, '.pdfload')).toHaveText(`论文不存在:${target.paper}`)

  // After restoring from the trash can and then entering the same article, the last error report will disappear; when reading, the global sidebar is retracted, and you can use the return button to leave the screen.
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
  await expect(shown(win, '.zoomctl span')).toHaveText('100%')

  await shown(win, '.zoomctl [title="放大"]').click()
  await expect(shown(win, '.zoomctl span')).toHaveText('120%')
  await expect(shown(win, '.pdfpagebox').first())
    .toHaveJSProperty('clientWidth', Math.floor(PAGE.width * FIT * 1.2))
})

test('收件里下载入库那一条的「开始阅读」进阅读器,入库那一篇的原文真的画了出来', async ({ win }) => {
  const entries = await call<{ id: string; title: string; paper: string; downloaded: boolean }[]>(
    win, 'inbox.list', {})
  const target = entries.find((e) => !e.downloaded)!
  expect(target.id).toBe(INGESTED.entry)
  // What you get when entering the library is the ID that the paper in the library should have. The ID of the receiving entry is not the paper ID.
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
