import type { Locator, Page } from '@playwright/test'
import { PAPER_PAGE } from '../apps/desktop/src/shared/vocabulary.js'
import { dshort, expect, test, type MeridianWindow } from './app.js'

/** The screen you entered is always hung, and the selector that is present on every screen, such as the screen header, should be stored in the currently displayed screen. */
const shown = (win: Page) => win.locator('.screenslot:not([hidden])')

const call = <T>(win: Page, method: string, params: unknown) => win.evaluate(
  ([m, p]) => (window as unknown as MeridianWindow).meridian.call(m as string, p) as Promise<T>,
  [method, params] as const,
)

type Ref = { id: string; title: string }
type Card = {
  id: string; kind: string; kindLabel: string; title: string; summary: string; updated: string
  childCount: number; memberCount: number; parentCount: number
}
type Home = {
  aggregationCount: number
  kinds: { key: string; label: string; count: number }[]
  roots: Card[]
}
type Cell = { value: string; page: number; quote: string }
type Aggregation = Card & {
  parents: Ref[]
  splitOn?: string
  children: Card[]
  columns: { key: string; label: string }[]
  rows: { paper: Ref; cells: Record<string, Cell> }[]
  body: string
}
type Paper = {
  id: string; title: string; short: string; body: string; memberships: { aggregation: Ref }[]
}

const homeFromCore = (win: Page) => call<Home>(win, 'wiki.home', {})
const aggFromCore = (win: Page, id: string) => call<Aggregation>(win, 'wiki.aggregation', { id })
const paperFromCore = (win: Page, id: string) => call<Paper>(win, 'wiki.paper', { id })
const paperTotal = (win: Page) =>
  call<{ total: number }>(win, 'papers.list', { page: 1, size: 1 }).then((r) => r.total)

const gotoWiki = (win: Page) => win.locator('[data-desk="wiki"]').click()
const crumbs = (win: Page) => win.locator('#crumb .cseg')

/** The words on the last line of a card: count and update date, formatted the same way as dates elsewhere in the app. */
const foot = (c: Card) =>
  `${c.childCount > 0 ? `${c.childCount} 细分 · ` : ''}${c.memberCount} 篇 · 更新 ${dshort(c.updated)}`

test('侧栏「Wiki」进 wiki 屏:标题与角标都是聚合总数,分节只有名字', async ({ win }) => {
  const home = await homeFromCore(win)
  await gotoWiki(win)

  await expect(crumbs(win)).toHaveText(['我的库', 'Wiki'])
  await expect(shown(win).locator('.desk-head .t')).toHaveText(`Wiki · ${home.aggregationCount}`)
  await expect(win.locator('[data-desk="wiki"] .n')).toHaveText(String(home.aggregationCount))
  await expect(shown(win).locator('.desk-head .back')).toHaveCount(0)
  expect(await shown(win).locator('.section-heading').allTextContents())
    .toEqual([...home.kinds.map((k) => k.label), '论文'])

  // There is one grid for each kind of aggregation. There is only the root node in the grid, and the count of the last row is according to the contract.
  for (const [at, kind] of home.kinds.entries()) {
    const cards = shown(win).locator('.wkgrid').nth(at).locator('.wkcard')
    const roots = home.roots.filter((c) => c.kind === kind.key)
    expect(await cards.locator('.tt').allTextContents()).toEqual(roots.map((c) => c.title))
    expect(await cards.locator('.wf').allTextContents()).toEqual(roots.map(foot))
  }

  // Centering rules apply to direct child elements: grid centered, not against padding
  const grid = (await shown(win).locator('.wkgrid').first().boundingBox())!
  const body = (await shown(win).locator('.desk-body').boundingBox())!
  expect(grid.x).toBeGreaterThan(body.x + 24)

  // The paper is paginated, and the total number on the pagination bar is the number of papers in the entire library.
  await expect(shown(win).locator('.pginfo')).toHaveText(`共 ${await paperTotal(win)} 条`)
})

test('实体类型标签按类型上底色:聚合一种,论文另一种', async ({ win }) => {
  const home = await homeFromCore(win)
  await gotoWiki(win)

  const aggKind = shown(win).locator('.wkgrid').first().locator('.wkcard .wkind').first()
  const paperKind = shown(win).locator('.wkgrid').nth(home.kinds.length).locator('.wkcard .wkind').first()
  await expect(aggKind).toHaveClass(/\bk-wiki\b/)
  await expect(paperKind).toHaveClass(/\bk-paper\b/)

  const ground = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor)
  const [agg, paper] = [await ground(aggKind), await ground(paperKind)]
  console.log(`类型标签底色:聚合 ${agg},论文 ${paper}`)
  expect(agg, '类型标签该有自己的浅色底').not.toBe('rgba(0, 0, 0, 0)')
  expect(paper, '类型标签该有自己的浅色底').not.toBe('rgba(0, 0, 0, 0)')
  expect(agg, '两种实体该是两种底色').not.toBe(paper)
})

test('根节点卡进聚合页,子聚合再进一层带上级,返回按历史退', async ({ win }) => {
  const home = await homeFromCore(win)
  const root = home.roots.find((c) => c.childCount > 0)!
  const agg = await aggFromCore(win, root.id)
  await gotoWiki(win)
  await shown(win).locator(`.wkgrid [data-wk="${root.id}"]`).click()

  await expect(crumbs(win)).toHaveText(['我的库', 'Wiki', agg.title])
  await expect(shown(win).locator('.desk-head .t')).toHaveText(agg.title)
  await expect(shown(win).locator('.desk-head .back')).toHaveCount(1)
  // The fixed areas are at the front (segmentation, paper comparison), each with a management entrance, and the header of the text is the page name plus "Edit"
  expect(await shown(win).locator('.wkmain .section-heading').allTextContents())
    .toEqual([`细分${agg.kindLabel}${agg.kindLabel}`, '论文对比论文', `${agg.title}编辑`])
  // The section headers are the same as those in the main area: 15px, the first section "Subdivision..." is free of line, and the non-first section "Paper Comparison" draws a top line
  const mainHeads = shown(win).locator('.wkmain .section-heading')
  await expect(mainHeads.nth(0)).toHaveCSS('font-size', '15px')
  await expect(mainHeads.nth(0)).toHaveCSS('border-top-width', '0px')
  await expect(mainHeads.nth(1)).toHaveCSS('font-size', '15px')
  await expect(mainHeads.nth(1)).toHaveCSS('border-top-width', '1px')
  // The text is rendered using markdown: its secondary headings are the ones written on the page.
  expect(await shown(win).locator('.wkmain .md h2').allTextContents())
    .toEqual(agg.body.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3)))
  await expect(shown(win).locator('.wkgrid .wkcard')).toHaveCount(agg.children.length)
  await expect(shown(win).locator('.wkside .pv').nth(0)).toHaveText(agg.kindLabel)
  await expect(shown(win).locator('.wkside .pv').nth(1))
    .toHaveText(`${agg.memberCount} 篇 · ${agg.childCount} 细分`)

  // The sub-aggregation goes one level further: the middle of the breadcrumb is its first parent
  const child = agg.children[0]!
  const opened = await aggFromCore(win, child.id)
  await shown(win).locator(`.wkgrid [data-wk="${child.id}"]`).click()
  await expect(crumbs(win)).toHaveText(['我的库', 'Wiki', opened.parents[0]!.title, opened.title])
  await shown(win).locator('.desk-head .back').click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText(agg.title)

  // The "Wiki" section of Breadcrumbs returns to the homepage
  await crumbs(win).filter({ hasText: 'Wiki' }).click()
  await expect(crumbs(win)).toHaveText(['我的库', 'Wiki'])
})

test('对照表的行是成员论文,格子按契约的列排,悬停看原文;行头进论文页,归属按聚合分组', async ({ win }) => {
  const agg = await aggFromCore(win, 'topics/ptq-weight-only')
  expect(agg.rows.length).toBeGreaterThan(2)
  await gotoWiki(win)
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await shown(win).locator('[data-wk="topics/ptq"]').click()
  await shown(win).locator('[data-wk="topics/ptq-weight-only"]').click()
  await expect(crumbs(win)).toHaveText(['我的库', 'Wiki', 'PTQ', agg.title])

  const table = shown(win).locator('table.cmp')
  expect(await table.locator('thead th:not(.rx):not(.th-add)').allTextContents())
    .toEqual(['论文', ...agg.columns.map((c) => c.label)])
  expect(await table.locator('tbody tr td.rh').allTextContents()).toEqual(agg.rows.map((r) => r.paper.title))
  // The empty grid is a short horizontal line, and the grid with a value has a page number superscript.
  const first = agg.rows[0]!
  expect(await table.locator('tbody tr').first().locator('td:not(.rh):not(.rx)').allTextContents()).toEqual(
    agg.columns.map((c) => {
      const cell = first.cells[c.key]
      return cell === undefined ? '—' : `${cell.value}p${cell.page}`
    }),
  )
  // Hovering a box reveals the original text it quoted.
  const filled = agg.columns.find((c) => first.cells[c.key] !== undefined)!
  await table.locator('tbody tr').first().locator('.anc').first().hover()
  await expect(win.locator('#wktip')).toContainText(first.cells[filled.key]!.quote)

  // [[id]] without an alias in the text uses the interface name of that page as text.
  expect(await shown(win).locator('.wkmain .md .wl').allTextContents()).toContain('GPTQ')

  // Enter the thesis page
  await table.locator(`[data-wk="${first.paper.id}"]`).click()
  const paper = await paperFromCore(win, first.paper.id)
  await expect(crumbs(win)).toHaveText(['我的库', 'Wiki', paper.short])
  await expect(shown(win).locator('.desk-head .t')).toHaveText(paper.short)
  expect(await shown(win).locator('.wkside .section-heading').allTextContents()).toEqual(['属性', '归属', '目录'])
  // The header of the sidebar panel is another set, one size smaller than the main area and no line is drawn: 14px, no top line
  const sideHeads = shown(win).locator('.wkside .section-heading')
  await expect(sideHeads.first()).toHaveCSS('font-size', '14px')
  await expect(sideHeads.first()).toHaveCSS('border-top-width', '0px')
  await expect(shown(win).locator('.memb')).toHaveCount(paper.memberships.length)
  expect(await shown(win).locator('.memb .tagchip').allTextContents())
    .toEqual(paper.memberships.map((m) => m.aggregation.title))
  await expect(shown(win).locator('.memb .wkind').first()).toHaveClass(/\bk-wiki\b/)

  // The aggregation chip in the attribution returns to that table; returns to the paper page according to history
  const back = paper.memberships[0]!.aggregation
  await shown(win).locator(`.memb [data-wk="${back.id}"]`).click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText(back.title)
  await shown(win).locator('.desk-head .back').click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText(paper.short)
})

test('首页论文卡进论文页;个人理解与 Wiki 内容分层,没内化的正文仍能直接编辑', async ({ win }) => {
  await gotoWiki(win)
  const cards = shown(win).locator('.wkgrid').last().locator('.wkcard')
  // evaluateAll does not wait: wait for the cards to arrive first, otherwise zero cards will be read on the home page before they are retrieved.
  await cards.first().waitFor()
  const ids = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-wk')!))
  const id = ids.find((wk) => !/^\d{4}\.\d{5}$/.test(wk.slice(PAPER_PAGE.length)))!
  expect(id).toBeDefined()
  const paper = await paperFromCore(win, id)
  await shown(win).locator(`.wkgrid [data-wk="${id}"]`).click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText(paper.short)
  expect(paper.body).toBe('')
  await expect(shown(win).locator('.paper-understanding')).toBeVisible()
  await expect(shown(win).locator('.wkmain .section-heading')).toHaveText(['个人理解', 'Wiki 内化内容编辑'])
  await expect(shown(win).locator('.wkmain .md .empty-state')).toHaveText('还没有生成 Wiki 内化内容。')
  await expect(shown(win).locator('.wkmain .acts')).toHaveText('编辑')
  await expect(shown(win).locator('.wkside .empty-state')).toHaveText('还没有归到任何一页下。')
  // "Go to the paper list to view" jump to the paper screen and fill in its title into the filter box; there are QuaRot and SpinQuant in the fixture.
  // A page of a paper with the same name copied from an old library, so the number of lines filtered out can only be asserted to be non-zero.
  await shown(win).locator('.macts .btn').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['我的库', '论文'])
  await expect(win.locator('#libq')).toHaveValue(paper.title)
  // The title can be drawn as soon as the filter box is filled in, but the rows have to wait until papers.list comes back, so the number of rows has to wait and not be counted on the spot.
  await expect(win.locator('.screenslot:not([hidden]) .ptable tbody tr')).not.toHaveCount(0)
})

test('论文页的属性里年份与发表分两行,各写各的', async ({ win }) => {
  await gotoWiki(win)
  const cards = shown(win).locator('.wkgrid').last().locator('.wkcard')
  await cards.first().waitFor()
  // The default paper format on the home page is 12 articles per page, arranged by title, and the arXiv number fixture with publication year and source does not fall on the first page;
  // Turn to the maximum page size to ensure that you can get one article
  await shown(win).locator('.pagebar .segmented-control>button', { hasText: '48 / 页' }).click()
  await expect(cards).toHaveCount(48)
  const ids = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-wk')!))
  // The arXiv numbered articles come from fixtures with publication year and source, so both lines have something to compare with.
  const id = ids.find((wk) => /^\d{4}\.\d{5}$/.test(wk.slice(PAPER_PAGE.length)))!
  expect(id).toBeDefined()
  const paper = await call<{ short: string; year?: number; venue: string }>(win, 'wiki.paper', { id })
  expect(paper.year).toBeDefined()
  expect(paper.venue).not.toBe('')
  await shown(win).locator(`.wkgrid [data-wk="${id}"]`).click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText(paper.short)
  const props = shown(win).locator('.wkside .wkprops')
  // Year and publication use InlineMetadataField (InlineField.tsx): the value button (.metadata-editable)
  // sits inside a wrapping .metadata-field span, which is the actual sibling right after .pk.
  await expect(props.locator('.pk:text-is("年份") + .metadata-field .metadata-editable')).toHaveText(String(paper.year))
  await expect(props.locator('.pk:text-is("发表") + .metadata-field .metadata-editable')).toHaveText(paper.venue)
})

test('项目详情的关联 chip 也进对应的聚合页', async ({ win }) => {
  const project = await call<{
    relations: { items: { id: string; text: string; page?: string }[] }[]
  }>(win, 'project.get', { id: 'draft' })
  const chip = project.relations.flatMap((r) => r.items).find((i) => i.page !== undefined)!
  expect(chip).toBeDefined()

  await win.locator('[data-desk="resproj"]').click()
  await win.locator('[data-proj="draft"]').click()

  await shown(win).locator(`.wkrel .tagchip[data-wk="${chip.page}"]`).click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText((await aggFromCore(win, chip.page!)).title)
  await shown(win).locator('.desk-head .back').click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText('draft 效率')
})

test('右栏目录列正文的标题,点一条把它滚进视口', async ({ win, app }) => {
  // The window is lowered, making this page really want to scroll. What is given is the height of the content area, not the height of the outer frame: after the window has no borders, the only difference between the two is
  // A 1px side, and the premise of this one "the first title is above the viewport" measures the content area, so give it directly so that it doesn't drift.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1200, 440))
  const agg = await aggFromCore(win, 'topics/ptq-weight-only')
  await gotoWiki(win)
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await shown(win).locator('[data-wk="topics/ptq"]').click()
  await shown(win).locator('[data-wk="topics/ptq-weight-only"]').click()
  // This page will not be rendered until the data is retrieved. Wait for it to appear on the screen before reading the directory.
  await expect(shown(win).locator('.desk-head .t')).toHaveText(agg.title)

  const heads = agg.body.split('\n').filter((l) => /^#{1,3}\s/.test(l)).map((l) => l.replace(/^#+\s+/, ''))
  expect(heads.length).toBeGreaterThan(1)
  const toc = shown(win).locator('.wktoc li')
  expect(await toc.allTextContents()).toEqual(heads)

  // Scroll to the bottom first, and the first title of the text will be at the top of the viewport; click on the first item in the table of contents, and it will return to the top of the viewport.
  const body = shown(win).locator('.desk-body')
  await body.evaluate((el) => { el.scrollTop = el.scrollHeight })
  const top = (await body.boundingBox())!.y
  const first = shown(win).locator('.wkmain .md h2').first()
  expect((await first.boundingBox())!.y).toBeLessThan(top)
  await toc.first().click()
  await expect(toc.first()).toHaveClass(/\bon\b/)
  const y = (await first.boundingBox())!.y
  expect(y).toBeGreaterThanOrEqual(top - 1)
  expect(y).toBeLessThan(top + 60)
})

test('正文抬头的「编辑」把正文换成原文,「保存」后按 markdown 渲染,目录跟着;撤销后恢复', async ({ win }) => {
  await gotoWiki(win)
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  const before = (await aggFromCore(win, 'topics/quantization')).body
  await shown(win).locator('.wkmain .acts').click()
  const box = shown(win).locator('.md.src')
  await expect(box).toBeFocused()
  await expect(box).toHaveText(before)
  await box.press('Control+End')
  await box.pressSequentially('\n\n## 端到端加的一节\n\n一句 **加粗** 的话,公式 $x^2$。')
  await shown(win).locator('.wkmain .acts').click()

  await expect(shown(win).locator('.wkmain .md h2', { hasText: '端到端加的一节' })).toHaveCount(1)
  await expect(shown(win).locator('.wkmain .md strong')).toHaveText('加粗')
  await expect(shown(win).locator('.wkmain .md .katex')).toHaveCount(1)
  await expect(shown(win).locator('.wktoc li', { hasText: '端到端加的一节' })).toHaveCount(1)
  await expect(shown(win).locator('.md.src')).toHaveCount(0)
  expect((await aggFromCore(win, 'topics/quantization')).body).toContain('## 端到端加的一节')

  const changes = await call<{ id: string; title: string; undoable: boolean }[]>(win, 'changelog.list', {})
  expect(changes[0]).toMatchObject({ title: 'Wiki · 「Quantization」· 改了正文', undoable: true })
  await call(win, 'changelog.undo', { id: changes[0]!.id })
  // What you cancel is the contract, and this screen doesn’t know about it; change the screen and come back to get it again.
  await win.locator('[data-desk="papers"]').click()
  await gotoWiki(win)
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await expect(shown(win).locator('.wkmain .md h2', { hasText: '端到端加的一节' })).toHaveCount(0)
  expect((await aggFromCore(win, 'topics/quantization')).body).toBe(before)
})

test('Esc 放弃这一次编辑,正文照旧', async ({ win }) => {
  await gotoWiki(win)
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  const before = (await aggFromCore(win, 'topics/quantization')).body
  await shown(win).locator('.wkmain .acts').click()
  await shown(win).locator('.md.src').pressSequentially('改了又不要')
  await win.keyboard.press('Escape')
  await expect(shown(win).locator('.md.src')).toHaveCount(0)
  await expect(shown(win).locator('.wkmain .acts')).toHaveText('编辑')
  expect((await aggFromCore(win, 'topics/quantization')).body).toBe(before)
})

test('细分:挂上已有的同类聚合,拿掉;新名字回车新建一页', async ({ win }) => {
  await gotoWiki(win)
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText('Quantization')
  const cards = shown(win).locator('.wkmain .wkgrid .wkcard')
  const n = await cards.count()

  // After clicking +, there will be a placeholder card immediately at the end of the grid, and the input box will grow in the card.
  await shown(win).locator('.wkmain .section-heading', { hasText: '细分主题' }).locator('.btn').click()
  await expect(cards).toHaveCount(n + 1)
  await expect(cards.last()).toHaveClass(/\bnewcard\b/)
  await expect(cards.last().locator('.pickin')).toHaveCount(1)
  await expect(cards.last().locator('.wkind')).toHaveClass(/\bk-wiki\b/)
  // The placeholder card is wearing the card's own clothes: it is the same width and height as the real card next to it, it is not a separate search box.
  const real = (await cards.nth(n - 1).boundingBox())!
  const holder = (await cards.last().boundingBox())!
  expect(holder.width).toBe(real.width)
  expect(holder.height).toBe(real.height)
  // If there is no writing on the last line of the placeholder card, that line still occupies the same height as the last line of the real card.
  expect((await cards.last().locator('.wf').boundingBox())!.height)
    .toBe((await cards.nth(n - 1).locator('.wf').boundingBox())!.height)
  const row = shown(win).locator('.pickin')
  await row.pressSequentially('KV cache')
  await expect(win.locator('.pickhits li')).toHaveCount(1)
  await expect(row).toHaveAttribute('aria-busy', 'false')
  await row.press('Enter')
  await expect(cards).toHaveCount(n + 1)
  await expect(shown(win).locator('.wkmain .wkgrid .newcard')).toHaveCount(0)
  await expect(shown(win).locator('.wkmain .wkgrid [data-wk="topics/kv-cache-quantization"]')).toHaveCount(1)
  expect((await aggFromCore(win, 'topics/kv-cache-quantization')).parents.map((p) => p.id)).toContain('topics/quantization')

  await shown(win).locator('.wkmain .wkgrid [data-wk="topics/kv-cache-quantization"]').hover()
  await shown(win).locator('.wkmain .wkgrid [data-wk="topics/kv-cache-quantization"] .rx').click()
  await expect(cards).toHaveCount(n)
  expect((await aggFromCore(win, 'topics/kv-cache-quantization')).parents.map((p) => p.id)).not.toContain('topics/quantization')

  // Esc to remove the entire placeholder card
  await shown(win).locator('.wkmain .section-heading', { hasText: '细分主题' }).locator('.btn').click()
  await expect(cards).toHaveCount(n + 1)
  await shown(win).locator('.pickin').press('Escape')
  await expect(cards).toHaveCount(n)

  await shown(win).locator('.wkmain .section-heading', { hasText: '细分主题' }).locator('.btn').click()
  await shown(win).locator('.pickin').pressSequentially('端到端新建的主题')
  await expect(win.locator('.pickhits li')).toHaveCount(0)
  await expect(shown(win).locator('.pickin')).toHaveAttribute('aria-busy', 'false')
  await shown(win).locator('.pickin').press('Enter')
  await expect(cards).toHaveCount(n + 1)
  await shown(win).locator('.wkmain .wkgrid [data-wk="topics/端到端新建的主题"]').click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText('端到端新建的主题')
  await expect(shown(win).locator('.wkside .tagchip[data-wk="topics/quantization"]')).toHaveCount(1)
  const changes = await call<{ title: string; undoable: boolean }[]>(win, 'changelog.list', {})
  expect(changes.slice(0, 3).map((c) => c.title)).toEqual([
    'Wiki · 新建 端到端新建的主题,归在 Quantization 下',
    'Wiki · 把 KV cache quantization 从 Quantization 下移出',
    'Wiki · 把 KV cache quantization 归到 Quantization 下',
  ])

  const latest = await call<{ id: string; title: string; undoable: boolean }[]>(win, 'changelog.list', {})
  expect(latest[0]).toMatchObject({ title: 'Wiki · 新建 端到端新建的主题,归在 Quantization 下', undoable: true })
  await call(win, 'changelog.undo', { id: latest[0]!.id })
  expect((await aggFromCore(win, 'topics/quantization')).children.map((c) => c.id)).not.toContain('topics/端到端新建的主题')
  const afterUndo = await call<{ title: string }[]>(win, 'changelog.list', {})
  expect(afterUndo[0]!.title).toBe('撤销:Wiki · 新建 端到端新建的主题,归在 Quantization 下')
})

test('论文对比:加一篇论文,拿掉;改列——改名生效,删有格子的列被拒', async ({ win }) => {
  const agg = await aggFromCore(win, 'topics/ptq-weight-only')
  await gotoWiki(win)
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await shown(win).locator('[data-wk="topics/ptq"]').click()
  await shown(win).locator('[data-wk="topics/ptq-weight-only"]').click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText(agg.title)
  const rows = shown(win).locator('table.cmp tbody tr')
  const n = agg.rows.length

  // After clicking +, there will be an extra line at the end of the table body. The head of the line is the input box, and the remaining cells are short horizontal lines.
  await shown(win).locator('.wkmain .section-heading', { hasText: '论文对比' }).locator('[title="添加论文"]').click()
  await expect(rows).toHaveCount(n + 1)
  await expect(rows.last()).toHaveClass(/\bnewrow\b/)
  expect(await rows.last().locator('td:not(.rh):not(.rx)').allTextContents()).toEqual(agg.columns.map(() => '—'))
  // The placeholder row pins the height of the single real row; the QuIP (papers/2307.13304) row does not wrap under the default window width, use it as a reference
  const quipIdx = agg.rows.findIndex((r) => r.paper.id === 'papers/2307.13304')
  const real = (await rows.nth(quipIdx).boundingBox())!
  const holder = (await rows.last().boundingBox())!
  expect(Math.abs(holder.height - real.height)).toBeLessThan(0.5)
  await shown(win).locator('.pickin').pressSequentially('QuaRot')
  await expect(win.locator('.pickhits li').first()).toContainText('QuaRot')
  await expect(shown(win).locator('.pickin')).toHaveAttribute('aria-busy', 'false')
  await shown(win).locator('.pickin').press('Enter')
  await expect(rows).toHaveCount(n + 1)
  await expect(shown(win).locator('table.cmp tbody tr.newrow')).toHaveCount(0)
  const added = shown(win).locator('table.cmp tbody tr', { hasText: 'QuaRot' })
  expect(await added.locator('td:not(.rh):not(.rx)').allTextContents()).toEqual(agg.columns.map(() => '—'))

  await added.hover()
  await added.locator('td.rx').click()
  await expect(rows).toHaveCount(n)

  await shown(win).locator('table.cmp thead').hover()
  await shown(win).locator('table.cmp thead [title="列设置"]').click()
  const editor = win.locator('[data-radix-popper-content-wrapper] .coledit')
  // There are no words on the gears. After unfolding, there must be a place to explain what is being changed.
  await expect(editor.locator('.ch')).toHaveText('列设置')
  await expect(editor.locator('.row input')).toHaveCount(agg.columns.length)
  await editor.locator('.row input').first().fill('比特')
  await editor.locator('.btn.pri').click()
  await expect(shown(win).locator('table.cmp thead th').nth(1)).toHaveText('比特')
  // The first column contains cells filled in by members: deleting it was rejected by Core, the header remained unchanged, and the editor kept it.
  await shown(win).locator('table.cmp thead').hover()
  await shown(win).locator('table.cmp thead [title="列设置"]').click()
  await editor.locator('.row .btn').first().click()
  await editor.locator('.btn.pri').click()
  await expect(win.locator('#toast')).toContainText('不在新的列里')
  await expect(shown(win).locator('.ipcerror')).toHaveCount(0)
  await expect(shown(win).locator('table.cmp thead th').nth(1)).toHaveText('比特')
  await expect(editor).toHaveCount(1)
})

test('论文对比:提案在路上时连着点另一行「从这一页移出」,第二下不发', async ({ win }) => {
  const agg = await aggFromCore(win, 'topics/ptq-weight-only')
  expect(agg.rows.length).toBeGreaterThan(1)
  await gotoWiki(win)
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await shown(win).locator('[data-wk="topics/ptq"]').click()
  await shown(win).locator('[data-wk="topics/ptq-weight-only"]').click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText(agg.title)
  const rows = shown(win).locator('table.cmp tbody tr')
  await expect(rows).toHaveCount(agg.rows.length)
  const [removed, spared] = agg.rows

  // The two clicks are on different member rows, leaving only one microtask between them.
  await win.evaluate(async () => {
    const cells = document.querySelectorAll('table.cmp tbody tr td.rx')
    ;(cells[0] as HTMLElement).click()
    await Promise.resolve()
    ;(cells[1] as HTMLElement).click()
  })

  await expect(rows).toHaveCount(agg.rows.length - 1)
  await expect(shown(win).locator('.ipcerror')).toHaveCount(0)
  expect(await win.locator('#toast').textContent()).toBe('')
  const changes = await call<{ title: string }[]>(win, 'changelog.list', {})
  expect(changes.filter((c) => c.title === `Wiki · 把 ${removed!.paper.title} 从 ${agg.title} 移出`)).toHaveLength(1)
  expect(changes.filter((c) => c.title === `Wiki · 把 ${spared!.paper.title} 从 ${agg.title} 移出`)).toHaveLength(0)
})

test('内容列与卡片按窗口宽度分档:窄窗口 1080 与小卡,宽窗口 1560 与大卡,中间不连续缩放', async ({ win, app }) => {
  const tier = () => win.evaluate(() => {
    const css = getComputedStyle(document.documentElement)
    return { pagew: css.getPropertyValue('--pagew').trim(), cardw: css.getPropertyValue('--cardw').trim() }
  })
  await gotoWiki(win)
  const grid = shown(win).locator('.wkgrid').first()
  expect(await tier()).toEqual({ pagew: '1080px', cardw: '230px' })
  expect((await grid.boundingBox())!.width).toBeLessThanOrEqual(1080)

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1700, 900))
  await expect.poll(async () => (await tier()).pagew).toBe('1320px')
  expect(await tier()).toEqual({ pagew: '1320px', cardw: '280px' })

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(2100, 900))
  await expect.poll(async () => (await tier()).pagew).toBe('1560px')
  expect(await tier()).toEqual({ pagew: '1560px', cardw: '320px' })
  expect((await grid.boundingBox())!.width).toBeGreaterThan(1500)
  // The summary of the card is three lines in wide format
  await expect(shown(win).locator('.wkcard .wm').first()).toHaveCSS('-webkit-line-clamp', '3')
})

test('从别的屏再进 Wiki 落在首页,已经在 wiki 屏时再点侧栏也回到首页', async ({ win }) => {
  const home = await homeFromCore(win)
  await gotoWiki(win)
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText('Quantization')

  // Clicking the sidebar again is also an entry: it returns to the home page, even from inside Wiki itself.
  await gotoWiki(win)
  await expect(shown(win).locator('.desk-head .t')).toHaveText(`Wiki · ${home.aggregationCount}`)

  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await win.locator('[data-desk="papers"]').click()
  await gotoWiki(win)
  await expect(crumbs(win)).toHaveText(['我的库', 'Wiki'])
  await expect(shown(win).locator('.desk-head .t')).toHaveText(`Wiki · ${home.aggregationCount}`)
})

test('论文对比:在表头末尾就地建一列,建完没有配置层', async ({ win }) => {
  test.slow()
  await gotoWiki(win)
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await shown(win).locator('[data-wk="topics/ptq"]').click()
  await shown(win).locator('[data-wk="topics/ptq-weight-only"]').click()
  const table = shown(win).locator('table.cmp')
  // This page has to wait for wiki.aggregation to come back before drawing the table. allTextContents does not wait for elements, so wait for the table to appear on the screen first.
  await table.waitFor()
  const heads = () => table.locator('thead th:not(.rx):not(.th-add)').allTextContents()
  const before = await heads()

  await table.locator('thead').hover()
  await table.locator('thead [title="新增列"]').click()
  await expect(table.locator('thead th.th-new')).toHaveCount(1)
  // The placeholder column also has a blank space in each row of the table body. The number of cells in the table is not correct.
  expect(await table.locator('tbody tr').first().locator('td').count())
    .toBe(before.length + 2)
  await table.locator('thead th.th-new input').fill('新列')
  await table.locator('thead th.th-new input').press('Enter')
  await expect.poll(heads).toEqual([...before, '新列'])
  await expect(table.locator('thead th.th-new')).toHaveCount(0)
  // The columns on this page only have names. The names have been filled in just now, so no layers will pop up after they are created.
  await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(0)

  // Rename and delete are in the column settings of the gear and are treated the same as other columns.
  await table.locator('thead').hover()
  await table.locator('thead [title="列设置"]').click()
  const editor = win.locator('[data-radix-popper-content-wrapper] .coledit')
  // The editor has one column and one row, and does not include the heading "paper"; before contains "paper", so the number of the two is exactly equal.
  await expect(editor.locator('.row input')).toHaveCount(before.length)
  await editor.locator('.row input').last().fill('新列 2')
  await editor.locator('.btn.pri').click()
  await expect.poll(heads).toEqual([...before, '新列 2'])

  // Column names that have the same name as existing columns will not be submitted: the placeholders and typed words will be retained.
  await table.locator('thead').hover()
  await table.locator('thead [title="新增列"]').click()
  await table.locator('thead th.th-new input').fill('新列 2')
  await table.locator('thead th.th-new input').press('Enter')
  await expect(table.locator('thead th.th-new')).toHaveCount(1)
  await expect(table.locator('thead th.th-new input')).toHaveValue('新列 2')
  // Remove the placeholder and then count the headers: the selector of `heads` only excludes .rx and .th-add, and the placeholder th.th-new will be used by it.
  // Count in (the text is an empty string), so the number of columns can only be compared after the placeholders are gone.
  await table.locator('thead th.th-new input').press('Escape')
  await expect(table.locator('thead th.th-new')).toHaveCount(0)
  await expect.poll(heads).toEqual([...before, '新列 2'])

  // Open the placeholder again and press Esc. The number of columns remains unchanged.
  await table.locator('thead').hover()
  await table.locator('thead [title="新增列"]').click()
  await table.locator('thead th.th-new input').press('Escape')
  await expect(table.locator('thead th.th-new')).toHaveCount(0)
  await expect.poll(heads).toEqual([...before, '新列 2'])

  // When typing the plus sign for paper comparison on the keyboard, pointerdown will not be sent, and the placeholder column cannot be removed by clicking Cancel; the two placeholders cannot be opened at the same time.
  await table.locator('thead').hover()
  await table.locator('thead [title="新增列"]').click()
  await expect(table.locator('thead th.th-new')).toHaveCount(1)
  await shown(win).locator('.wkmain .section-heading', { hasText: '论文对比' })
    .locator('[title="添加论文"]').press('Enter')
  await expect(table.locator('tbody tr.newrow')).toHaveCount(1)
  await expect(table.locator('thead th.th-new')).toHaveCount(0)
  // The number of cells in the placeholder row is consistent with the real row
  expect(await table.locator('tbody tr.newrow').locator('td').count())
    .toBe(await table.locator('tbody tr').first().locator('td').count())
})

test('这一节没有成员时没有表,也就没有列入口', async ({ win }) => {
  await gotoWiki(win)
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await expect(shown(win).locator('table.cmp')).toHaveCount(0)
  await expect(shown(win).locator('.th-add')).toHaveCount(0)
  // All that is left on the letterhead is the plus sign of the related paper: the gears follow the watch, and if there is no watch, there is no such thing.
  const head = shown(win).locator('.wkmain .section-heading', { hasText: '论文对比' })
  await expect(head.locator('button')).toHaveCount(1)
  await expect(head.locator('button')).toHaveAttribute('title', '添加论文')
})

test('细分:名字里没有字母数字时占位与打好的字都留着', async ({ win }) => {
  await gotoWiki(win)
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  // The count elements are not equal: the page name in the screen header means that wiki.aggregation is back, and the subdivision card can be counted correctly at this time
  await expect(shown(win).locator('.desk-head .t')).toHaveText('Quantization')
  const cards = shown(win).locator('.wkmain .wkgrid .wkcard')
  const n = await cards.count()

  // Pure punctuation is not required. slug:slugOf uses \p{L}, and the Chinese characters are left as they are (see slug.test.ts)
  await shown(win).locator('.wkmain .section-heading', { hasText: '细分主题' }).locator('.btn').click()
  await shown(win).locator('.pickin').pressSequentially('!!!')
  await expect(shown(win).locator('.pickin')).toHaveAttribute('aria-busy', 'false')
  await shown(win).locator('.pickin').press('Enter')

  // Submission rejected: The original words are put into the toast, and the placeholder card and the words inside are retained. People can change them on the spot and then enter.
  await expect(win.locator('#toast')).toHaveText('名字里得有字母或数字')
  await expect(shown(win).locator('.ipcerror')).toHaveCount(0)
  await expect(cards).toHaveCount(n + 1)
  await expect(cards.last()).toHaveClass(/\bnewcard\b/)
  await expect(shown(win).locator('.pickin')).toHaveValue('!!!')

  await shown(win).locator('.pickin').fill('kv paging')
  await expect(shown(win).locator('.pickin')).toHaveAttribute('aria-busy', 'false')
  await shown(win).locator('.pickin').press('Enter')
  await expect(shown(win).locator('.wkmain .wkgrid .newcard')).toHaveCount(0)
  await expect(cards).toHaveCount(n + 1)
  await expect(shown(win).locator('.wkmain .wkgrid [data-wk="topics/kv-paging"]')).toHaveCount(1)
})
