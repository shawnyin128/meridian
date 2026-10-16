import type { Page } from '@playwright/test'
import { expect, gotoPapers, test, type MeridianWindow } from './app.js'

/** Visited screens stay mounted, so selectors are scoped to the screen shown. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

/** The contract's SEARCH_LIMIT: the most results one search returns. */
const SEARCH_LIMIT = 8

/** A paper whose source PDF is in the fixture vault; the paper table is filtered to it to open the reader. */
const READABLE = 'STAR: SPECULATIVE DECODING'

/** Type in the sidebar search box and wait for the instant results panel to appear. */
async function search(win: Page, query: string): Promise<void> {
  await win.locator('#sSearch').fill(query)
  await win.locator('#sRes').waitFor()
}

/** The title of each row in the results panel. */
const rows = (win: Page) => win.locator('#sRes .rrow .rt')

/** Filters Papers to that paper, opens its detail panel, clicks "Start reading" and waits in the reader. */
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
  // As the demo's h.go() does, the panel closes before navigating.
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
  await expect(win.locator('#crumb .cseg')).toHaveText([
    '我的库', '论文', 'STAR: SPECULATIVE DECODING WITH SEARCHABLE DRAFTING AND TARGET-AWARE REFINEMENT FOR MULTIMODAL GENERATION',
  ])

  // While reading, the whole global sidebar is hidden (.main.reading>.sidebar{display:none}), taking
  // the global search with it. This matches .main.reading .sidebar in
  // e2e/fixtures/platform-shell-demo.html: it is how this screen should look, not a reader quirk.
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
  // Groups come in the order aggregation page, project, chat, paper, and later groups are cut first; no
  // aggregation page has draft in its title.
  expect(listed.map((t) => t.split(':')[0])).toEqual([
    '项目', '论文', '论文', '论文', '论文', '论文', '论文', '论文',
  ])

  const title = 'EAGLE-2: Faster Inference of Language Models with Dynamic Draft Trees'
  await win.locator('#sRes .rrow', { hasText: title }).click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['我的库', '论文'])
  // As in the demo, the paper's title fills the filter box and the table redraws.
  await expect(win.locator('#libq')).toHaveValue(title)
  await expect(shown(win, '.ptable tbody tr')).toHaveCount(1)
  await expect(shown(win, '.ptable tbody tr td.pt-title')).toHaveText(title)
})

test('只命中某几类时就只出那几类,清空与 Escape 都收起面板', async ({ win }) => {
  await search(win, '对话:')
  await expect(rows(win)).toHaveText(['对话:摊薄的前提是共享前缀吗', '对话:宽树在我们集群上还成立吗'])

  await search(win, 'Distillation-based')
  await expect(rows(win)).toHaveText(['方法:Distillation-based QAT'])

  // Escape peels one layer, as in the demo: the panel closes and the typed text stays.
  await win.keyboard.press('Escape')
  await expect(win.locator('#sRes')).toHaveCount(0)
  await expect(win.locator('#sSearch')).toHaveValue('Distillation-based')

  // A query with no hits does not open the panel, and neither does clearing it.
  await win.locator('#sSearch').fill('这几个字库里没有')
  await expect(win.locator('#sRes')).toHaveCount(0)
  await win.locator('#sSearch').fill('')
  await expect(win.locator('#sRes')).toHaveCount(0)
})

test('搜索跨边界的只有命中的那几条,不是整库', async ({ win }) => {
  const size = await win.evaluate(async () => {
    const call = (method: string, params: unknown) =>
      (window as unknown as MeridianWindow).meridian.call(method, params)
    // The query, Chinese for "paper", matches every paper in the vault, the largest group a search can hit.
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
  // The hits are more than an order of magnitude smaller than a 200-paper page of the vault.
  expect(size.命中字节 * 10).toBeLessThan(size.单次取两百篇的字节)

  // The results panel also shows only SEARCH_LIMIT rows.
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

  // The project was opened from the chat screen, so the back button returns to that chat.
  await shown(win, '.desk-head .back').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['对话', title])
  await expect(win.locator('#chatList .chat-row.on .ct-t')).toHaveText(title)
})
