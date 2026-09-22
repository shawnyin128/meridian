import type { Page } from '@playwright/test'
import { expect, gotoPapers, test, type MeridianWindow } from './app.js'

/** The screen you entered is always hung, and the selector in the screen should be closed in the currently displayed screen. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

/** SEARCH_LIMIT of the contract: A maximum of so many items can be given in one search. */
const SEARCH_LIMIT = 8

/** The original article is stored in the fixture vault, and you need to filter it out first when entering the browser. */
const READABLE = 'STAR: SPECULATIVE DECODING'

/** Type in the sidebar search box and wait for the instant results panel to appear. */
async function search(win: Page, query: string): Promise<void> {
  await win.locator('#sSearch').fill(query)
  await win.locator('#sRes').waitFor()
}

/** The title of each row in the results panel. */
const rows = (win: Page) => win.locator('#sRes .rrow .rt')

/** Filter out the article from the article screen, click on the details panel, click "Start Reading", and stop on the reader. */
async function gotoReader(win: Page): Promise<void> {
  await gotoPapers(win)
  await win.locator('#libq').fill(READABLE)
  await expect(win.locator('.ptable tbody tr')).toHaveCount(1)
  await win.locator('.ptable tbody tr').click()
  await shown(win, '.pdetail [title="开始阅读"]').click()
  await shown(win, '.pdfpagebox').first().waitFor()
}

test('从动态屏搜:项目与论文两类各出一条,点项目那条进那个项目', async ({ win }) => {
  await search(win, 'EAGLE-2')
  await expect(rows(win)).toHaveText([
    '项目:复现 EAGLE-2',
    '论文:EAGLE-2: Faster Inference of Language Models with Dynamic Draft Trees',
  ])
  await expect(win.locator('#sRes .rrow .rm')).toHaveText(['进行中 · speculative decoding', '2026 arXiv'])

  await win.locator('#sRes .rrow', { hasText: '项目:' }).click()
  // demo's h.go(): close the panel before jumping
  await expect(win.locator('#sRes')).toHaveCount(0)
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', '复现 EAGLE-2'])
  await expect(shown(win, '.desk-head .t')).toHaveText('复现 EAGLE-2')
})

test('从论文屏搜:只命中会话那一类,点它进那条会话', async ({ win }) => {
  await gotoPapers(win)
  await search(win, '摊薄')
  await expect(rows(win)).toHaveText(['对话:摊薄的前提是共享前缀吗'])

  await win.locator('#sRes .rrow', { hasText: '对话:' }).click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['对话', '摊薄的前提是共享前缀吗'])
  await expect(shown(win, '.msg')).toHaveCount(2)
  await expect(win.locator('#chatList .chat-row.on .ct-t')).toHaveText('摊薄的前提是共享前缀吗')
})

test('从阅读器搜:全局侧栏连同全局搜索一起收起,阅读器里搜不了', async ({ win }) => {
  await gotoReader(win)
  await expect(win.locator('#crumb .cseg')).toHaveText(['我的库', '论文', 'STAR'])

  // When reading, the global navigation sidebar disappears as a whole (.main.reading>.sidebar{display:none}), and the global search becomes out of reach;
  // Same as .main.reading .sidebar of desktop/design/platform-shell-demo.html, the reader is not the same
  // Exceptional implementation details, but what this screen should look like
  await expect(win.locator('.sidebar')).toBeHidden()
  await expect(win.locator('#sSearch')).toBeHidden()
})

test('从 wiki 屏搜聚合:点那条进聚合页,面包屑带上级', async ({ win }) => {
  await win.locator('[data-desk="wiki"]').click()
  await search(win, 'Distillation-based')
  await expect(rows(win)).toHaveText(['方法:Distillation-based QAT'])

  await win.locator('#sRes .rrow').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['我的库', 'Wiki', 'Distillation-based QAT'])
  await expect(shown(win, '.desk-head .t')).toHaveText('Distillation-based QAT')

  await search(win, 'Rotation')
  await expect(rows(win).first()).toHaveText('方法:Rotation')
  await win.locator('#sRes .rrow').first().click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['我的库', 'Wiki', 'Outlier suppression', 'Rotation'])
})

test('从最近变动屏搜:命中多于上限时只出 SEARCH_LIMIT 条,点论文那条进论文屏并筛到它', async ({ win }) => {
  await win.locator('[data-desk="changelog"]').click()
  await search(win, 'draft')

  const listed = await rows(win).allInnerTexts()
  expect(listed).toHaveLength(SEARCH_LIMIT)
  // The sorting is Aggregation → Project → Session → Paper, and the later categories are squeezed out first; no page of aggregation has draft in the title.
  expect(listed.map((t) => t.split(':')[0])).toEqual([
    '项目', '论文', '论文', '论文', '论文', '论文', '论文', '论文',
  ])

  const title = 'EAGLE-2: Faster Inference of Language Models with Dynamic Draft Trees'
  await win.locator('#sRes .rrow', { hasText: title }).click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['我的库', '论文'])
  // demo Fill in the title of that article into the filter box and redraw the table
  await expect(win.locator('#libq')).toHaveValue(title)
  await expect(shown(win, '.ptable tbody tr')).toHaveCount(1)
  await expect(shown(win, '.ptable tbody tr td.pt-title')).toHaveText(title)
})

test('只命中某几类时就只出那几类,清空与 Escape 都收起面板', async ({ win }) => {
  await search(win, '对话:')
  await expect(rows(win)).toHaveText(['对话:摊薄的前提是共享前缀吗', '对话:宽树在我们集群上还成立吗'])

  await search(win, 'Distillation-based')
  await expect(rows(win)).toHaveText(['方法:Distillation-based QAT'])

  // Demo's Escape peeling: the panel is retracted, and the typed words are retained.
  await win.keyboard.press('Escape')
  await expect(win.locator('#sRes')).toHaveCount(0)
  await expect(win.locator('#sSearch')).toHaveValue('Distillation-based')

  // A word that does not hit any of them will not open the panel; the same goes for clearing it.
  await win.locator('#sSearch').fill('这几个字库里没有')
  await expect(win.locator('#sRes')).toHaveCount(0)
  await win.locator('#sSearch').fill('')
  await expect(win.locator('#sRes')).toHaveCount(0)
})

test('搜索跨边界的只有命中的那几条,不是整库', async ({ win }) => {
  const size = await win.evaluate(async () => {
    const call = (method: string, params: unknown) =>
      (window as unknown as MeridianWindow).meridian.call(method, params)
    // The word "paper" hits every paper in the database, which is the largest category that can be hit by the search.
    const hits = await call('search.query', { query: '论文' }) as unknown[]
    const whole = await call('papers.list', { page: 1, size: 200 }) as { rows: unknown[]; total: number }
    return {
      命中条数: hits.length,
      命中字节: JSON.stringify(hits).length,
      全库论文数: whole.total,
      单次取两百篇的字节: JSON.stringify(whole.rows).length,
    }
  })
  console.log(`一次搜索跨边界的规模 ${JSON.stringify(size)}`)

  expect(size.命中条数).toBe(SEARCH_LIMIT)
  expect(size.全库论文数).toBeGreaterThan(SEARCH_LIMIT * 10)
  // The few hits are more than an order of magnitude smaller than the entire database.
  expect(size.命中字节 * 10).toBeLessThan(size.单次取两百篇的字节)

  // That layer of the interface also only has the upper limit of lines.
  await search(win, '论文')
  await expect(win.locator('#sRes .rrow')).toHaveCount(SEARCH_LIMIT)
})

test('从对话屏搜项目:进那个项目,返回钮回到刚才那条会话', async ({ win }) => {
  const row = win.locator('#chatList .chat-row').first()
  const title = await row.locator('.ct-t').innerText()
  await row.click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['对话', title])

  await search(win, 'EAGLE-2')
  await win.locator('#sRes .rrow', { hasText: '项目:' }).click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', '复现 EAGLE-2'])

  // The source is the conversation screen, and the return button will return to that conversation.
  await shown(win, '.desk-head .back').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['对话', title])
  await expect(win.locator('#chatList .chat-row.on .ct-t')).toHaveText(title)
})
