import type { Locator, Page } from '@playwright/test'
import { PAPER_PAGE } from '../apps/desktop/src/shared/vocabulary.js'
import { dshort, expect, expectWholeInRail, parkPointer, test, textBox, type MeridianWindow } from './app.js'

/** Visited screens stay mounted, so selectors every screen has, like the header, target the shown one. */
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
/** The input of the placeholder a + opens in place: a subtopic card or a comparison row. */
const pickInput = (win: Page) => shown(win).locator('.wkmain :is(.newcard, tr.newrow) .inedit')

/** The words on the last line of a card: count and update date, formatted the same way as dates elsewhere in the app. */
const foot = (c: Card) =>
  `${c.childCount > 0 ? `${c.childCount} 细分 · ` : ''}${c.memberCount} 篇 · 更新 ${dshort(c.updated)}`

test('侧栏「Wiki」进 wiki 屏:标题与角标都是聚合总数,分节只有名字', async ({ win }) => {
  const home = await homeFromCore(win)
  await gotoWiki(win)

  await expect(crumbs(win)).toHaveText(['我的库', 'Wiki'])
  await expect(shown(win).locator('.desk-head .t')).toHaveText(`Wiki · ${home.aggregationCount}`)
  await expect(win.locator('[data-desk="wiki"] .nav-row-count')).toHaveText(String(home.aggregationCount))
  await expect(shown(win).locator('.desk-head .back')).toHaveCount(0)
  // A kind with no root page shows no heading of its own.
  const kinds = home.kinds.filter((k) => home.roots.some((c) => c.kind === k.key))
  expect(await shown(win).locator('.section-heading').allTextContents())
    .toEqual([...kinds.map((k) => k.label), '论文'])

  // One grid per aggregation kind, holding only its root pages, with footer counts from the contract.
  for (const [at, kind] of kinds.entries()) {
    const cards = shown(win).locator('.wkgrid').nth(at).locator('.wkcard')
    const roots = home.roots.filter((c) => c.kind === kind.key)
    expect(await cards.locator('.tt').allTextContents()).toEqual(roots.map((c) => c.title))
    expect(await cards.locator('.wf').allTextContents()).toEqual(roots.map(foot))
  }

  // The centering rule applies to direct children: the grid is centered, not flush against the padding.
  const grid = (await shown(win).locator('.wkgrid').first().boundingBox())!
  const body = (await shown(win).locator('.desk-body').boundingBox())!
  expect(grid.x).toBeGreaterThan(body.x + 24)

  // Papers are paginated, and the pager's total is the number of papers in the whole vault.
  await expect(shown(win).locator('.pginfo')).toHaveText(`共 ${await paperTotal(win)} 条`)
})

test('实体类型标签是中性的标签底:聚合和论文同一种底色', async ({ win }) => {
  const home = await homeFromCore(win)
  await gotoWiki(win)

  const aggKind = shown(win).locator('.wkgrid').first().locator('.wkcard .wkind').first()
  const paperKind = shown(win).locator('.wkgrid').nth(home.kinds.length).locator('.wkcard .wkind').first()
  await expect(aggKind).toHaveClass(/\btag--neutral\b/)
  await expect(paperKind).toHaveClass(/\btag--neutral\b/)

  const ground = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor)
  const [agg, paper] = [await ground(aggKind), await ground(paperKind)]
  console.log(`类型标签底色:聚合 ${agg},论文 ${paper}`)
  expect(agg, '类型标签该有自己的浅色底').not.toBe('rgba(0, 0, 0, 0)')
  expect(paper, '类型标签该有自己的浅色底').not.toBe('rgba(0, 0, 0, 0)')
  expect(agg, '两种实体都是中性的标签底').toBe(paper)
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
  // The fixed sections come first (subpages, Paper comparison, Findings), each with its own action,
  // and the body's header is the page name plus "Edit".
  expect(await shown(win).locator('.wkmain .section-heading').allTextContents())
    .toEqual([`细分${agg.kindLabel}${agg.kindLabel}`, '论文对比论文', '结论结论', `${agg.title}编辑`])
  // Section headers use the main-area style, 15px: the first one, subpages, has no top rule, and a later
  // one such as Paper comparison draws one.
  const mainHeads = shown(win).locator('.wkmain .section-heading')
  await expect(mainHeads.nth(0)).toHaveCSS('font-size', '15px')
  await expect(mainHeads.nth(0)).toHaveCSS('border-top-width', '0px')
  await expect(mainHeads.nth(1)).toHaveCSS('font-size', '15px')
  await expect(mainHeads.nth(1)).toHaveCSS('border-top-width', '1px')
  // The body is rendered as Markdown: its h2 headings are the ones written in the page.
  expect(await shown(win).locator('.wkmain .md h2').allTextContents())
    .toEqual(agg.body.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3)))
  await expect(shown(win).locator('.wkgrid .wkcard')).toHaveCount(agg.children.length)
  await expect(shown(win).locator('.split-rail .property-value').nth(0)).toHaveText(agg.kindLabel)
  await expect(shown(win).locator('.split-rail .property-value').nth(2))
    .toHaveText(`${agg.memberCount} 篇 · ${agg.childCount} 细分`)

  // A child aggregation goes one level deeper: the breadcrumb's middle segment is its first parent.
  const child = agg.children[0]!
  const opened = await aggFromCore(win, child.id)
  await shown(win).locator(`.wkgrid [data-wk="${child.id}"]`).click()
  await expect(crumbs(win)).toHaveText(['我的库', 'Wiki', opened.parents[0]!.title, opened.title])
  await shown(win).locator('.desk-head .back').click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText(agg.title)

  // The breadcrumb's Wiki segment returns to the Wiki home.
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
  expect(await table.locator('thead th:not(.table-actions)').allTextContents())
    .toEqual(['论文', ...agg.columns.map((c) => c.label)])
  expect(await table.locator('tbody tr td.rh').allTextContents()).toEqual(agg.rows.map((r) => r.paper.title))
  // An empty cell shows a dash, and a filled cell ends with its anchor, p.N.
  const first = agg.rows[0]!
  expect(await table.locator('tbody tr').first().locator('td:not(.rh):not(.table-actions)').allTextContents()).toEqual(
    agg.columns.map((c) => {
      const cell = first.cells[c.key]
      return cell === undefined ? '—' : `${cell.value} p.${cell.page}`
    }),
  )
  // Hovering a cell's anchor, or reaching it with Tab from the row head, shows the source text it quotes
  // in the shared tooltip.
  const filled = agg.columns.find((c) => first.cells[c.key] !== undefined)!
  const anchor = table.locator('tbody tr').first().locator('.source-anchor').first()
  await anchor.hover()
  await expect(win.locator('[role="tooltip"]')).toContainText(first.cells[filled.key]!.quote)
  await parkPointer(win)
  await table.locator('tbody tr').first().locator('td.rh [data-wk]').focus()
  await win.keyboard.press('Tab')
  await expect(anchor).toBeFocused()
  await expect(win.locator('[role="tooltip"]')).toContainText(first.cells[filled.key]!.quote)

  // An [[id]] link without an alias in the body shows that page's display name.
  expect(await shown(win).locator('.wkmain .md .entity-link--page').allTextContents()).toContain('GPTQ')

  // Open the paper page.
  await table.locator(`[data-wk="${first.paper.id}"]`).click()
  const paper = await paperFromCore(win, first.paper.id)
  await expect(crumbs(win)).toHaveText(['我的库', 'Wiki', paper.title])
  await expect(shown(win).locator('.desk-head .t')).toHaveText(paper.title)
  expect(await shown(win).locator('.split-rail .section-heading').allTextContents()).toEqual(['属性', '归属', '反向链接', '目录'])
  // Side panel headers have their own style, one size smaller than the main area and without a rule:
  // 14px, no top border.
  const sideHeads = shown(win).locator('.split-rail .section-heading')
  await expect(sideHeads.first()).toHaveCSS('font-size', '14px')
  await expect(sideHeads.first()).toHaveCSS('border-top-width', '0px')
  await expect(shown(win).locator('.memb')).toHaveCount(paper.memberships.length)
  expect(await shown(win).locator('.memb .tagchip').allTextContents())
    .toEqual(paper.memberships.map((m) => m.aggregation.title))
  await expect(shown(win).locator('.memb .wkind').first()).toHaveClass(/\btag--neutral\b/)

  // An aggregation chip under Location in Wiki opens that page's table; back returns to the paper page.
  const back = paper.memberships[0]!.aggregation
  await shown(win).locator(`.memb [data-wk="${back.id}"]`).click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText(back.title)
  await shown(win).locator('.desk-head .back').click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText(paper.title)
})

test('首页论文卡进论文页;个人理解与 Wiki 内容分层,没内化的正文仍能直接编辑', async ({ win }) => {
  await gotoWiki(win)
  const cards = shown(win).locator('.wkgrid').last().locator('.wkcard')
  // evaluateAll does not wait, so wait for the cards first; otherwise it reads zero before they load.
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
  await expect(shown(win).locator('.wkmain > .empty-state')).toHaveText('—')
  await expect(shown(win).locator('.wkmain .section-heading-actions > .btn:not(.add-action)', { hasText: '编辑' })).toHaveCount(1)
  await expect(shown(win).locator('.split-rail .empty-state')).toHaveText('—')
  // "View in the paper list" goes to Papers with the title in the filter box. In the fixture, QuaRot and
  // SpinQuant each have a same-named paper page copied from an old vault, so the filtered row count can
  // only be asserted non-zero.
  await shown(win).locator('.desk-head .page-actions .btn', { hasText: '去论文列表查看' }).click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['我的库', '论文'])
  await expect(win.locator('#libq')).toHaveValue(paper.title)
  // The filter box fills at once, but rows wait for papers.list to return, so poll the row count rather
  // than reading it once.
  await expect(win.locator('.screenslot:not([hidden]) .ptable tbody tr')).not.toHaveCount(0)
})

test('论文页的属性里年份与发表分两行,各写各的', async ({ win }) => {
  await gotoWiki(win)
  const cards = shown(win).locator('.wkgrid').last().locator('.wkcard')
  await cards.first().waitFor()
  // The home page shows 12 papers per page by default, sorted by title, and the arXiv-numbered fixtures
  // with a year and venue are not on the first page; the largest page size is sure to include one.
  await shown(win).locator('.pagebar .segmented-control>button', { hasText: '48 / 页' }).click()
  await expect(cards).toHaveCount(48)
  const ids = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-wk')!))
  // arXiv-numbered papers come from fixtures with a year and venue, so both rows have a value to compare.
  const id = ids.find((wk) => /^\d{4}\.\d{5}$/.test(wk.slice(PAPER_PAGE.length)))!
  expect(id).toBeDefined()
  const paper = await call<{ title: string; year?: number; venue: string }>(win, 'wiki.paper', { id })
  expect(paper.year).toBeDefined()
  expect(paper.venue).not.toBe('')
  await shown(win).locator(`.wkgrid [data-wk="${id}"]`).click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText(paper.title)
  const props = shown(win).locator('.split-rail .property-list')
  // Year and publication use InlineMetadataField (InlineField.tsx): the value button (.metadata-editable)
  // sits inside a wrapping .metadata-field span, inside the property's value after its label.
  await expect(props.locator('.property-label:text-is("年份") + .property-value > .metadata-field .metadata-editable')).toHaveText(String(paper.year))
  await expect(props.locator('.property-label:text-is("发表") + .property-value > .metadata-field .metadata-editable')).toHaveText(paper.venue)
})

test('论文页右栏的多行和单行值进入编辑时,编辑框整个露在右栏里,右栏不横向滚动,字不挪位', async ({ win }) => {
  await gotoWiki(win)
  await shown(win).locator('.wkgrid').last().locator('.wkcard').first().click()
  const side = shown(win).locator('.split-rail')
  for (const key of ['标题', '年份']) {
    const field = side.locator(`.property-label:text-is("${key}") + .property-value > .metadata-field`)
    const value = field.locator('.metadata-editable')
    const before = await textBox(value)

    await value.click()
    const input = field.locator('.metadata-input')
    await expectWholeInRail(side, input)
    expect((await textBox(input)).left).toBe(before.left)
    await input.press('Escape')
    await expect(input).toHaveCount(0)
  }
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
  // Lower the window so this page really scrolls. Set the content height, not the outer frame: in a
  // frameless window the two differ only by a 1px border, and this test's premise, "the first heading is
  // above the viewport", measures the content area, so setting it directly keeps it from drifting.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1200, 340))
  const agg = await aggFromCore(win, 'topics/ptq-weight-only')
  await gotoWiki(win)
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await shown(win).locator('[data-wk="topics/ptq"]').click()
  await shown(win).locator('[data-wk="topics/ptq-weight-only"]').click()
  // The page renders only after its data arrives; wait for it before reading the table of contents.
  await expect(shown(win).locator('.desk-head .t')).toHaveText(agg.title)

  const heads = agg.body.split('\n').filter((l) => /^#{1,3}\s/.test(l)).map((l) => l.replace(/^#+\s+/, ''))
  expect(heads.length).toBeGreaterThan(1)
  const toc = shown(win).locator('.wktoc li')
  expect(await toc.allTextContents()).toEqual(heads)

  // Scroll the main column to its bottom so the body's first heading is above its top; clicking the first
  // contents entry brings it back to the top of the column.
  const body = shown(win).locator('.wkmain')
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
  await shown(win).locator('.wkmain .section-heading-actions > .btn:not(.add-action)', { hasText: '编辑' }).click()
  const box = shown(win).locator('.md.src')
  await expect(box).toBeFocused()
  await expect(box).toHaveText(before)
  await box.press('Control+End')
  await box.pressSequentially('\n\n## 端到端加的一节\n\n一句 **加粗** 的话,公式 $x^2$。')
  await shown(win).locator('.wkmain .section-heading-actions > .btn:not(.add-action)', { hasText: '保存' }).click()

  await expect(shown(win).locator('.wkmain .md h2', { hasText: '端到端加的一节' })).toHaveCount(1)
  await expect(shown(win).locator('.wkmain .md strong')).toHaveText('加粗')
  await expect(shown(win).locator('.wkmain .md .katex')).toHaveCount(1)
  await expect(shown(win).locator('.wktoc li', { hasText: '端到端加的一节' })).toHaveCount(1)
  await expect(shown(win).locator('.md.src')).toHaveCount(0)
  expect((await aggFromCore(win, 'topics/quantization')).body).toContain('## 端到端加的一节')

  const changes = await call<{ id: string; title: string; undoable: boolean }[]>(win, 'changelog.list', {})
  expect(changes[0]).toMatchObject({ title: 'Wiki · 「Quantization」· 改了正文', undoable: true })
  await call(win, 'changelog.undo', { id: changes[0]!.id })
  // The undo goes through the contract, which this screen does not see; switch screens and back to refetch.
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
  await shown(win).locator('.wkmain .section-heading-actions > .btn:not(.add-action)', { hasText: '编辑' }).click()
  await shown(win).locator('.md.src').pressSequentially('改了又不要')
  await win.keyboard.press('Escape')
  await expect(shown(win).locator('.md.src')).toHaveCount(0)
  await expect(shown(win).locator('.wkmain .section-heading-actions > .btn:not(.add-action)', { hasText: '编辑' })).toHaveCount(1)
  expect((await aggFromCore(win, 'topics/quantization')).body).toBe(before)
})

test('细分:挂上已有的同类聚合,拿掉;新名字回车新建一页', async ({ win }) => {
  await gotoWiki(win)
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText('Quantization')
  const cards = shown(win).locator('.wkmain .wkgrid .wkcard')
  const n = await cards.count()

  // Clicking + adds a placeholder card at the end of the grid at once, with the input inside the card.
  await shown(win).locator('.wkmain .section-heading', { hasText: '细分主题' }).locator('.btn').click()
  await expect(cards).toHaveCount(n + 1)
  await expect(cards.last()).toHaveClass(/\bnewcard\b/)
  await expect(cards.last().locator('.inedit')).toHaveCount(1)
  await expect(cards.last().locator('.wkind')).toHaveClass(/\btag--neutral\b/)
  // The placeholder is a card: as wide and tall as the real card beside it, not a separate search box.
  const real = (await cards.nth(n - 1).boundingBox())!
  const holder = (await cards.last().boundingBox())!
  expect(holder.width).toBe(real.width)
  expect(holder.height).toBe(real.height)
  // The placeholder's footer is empty but still as tall as a real card's footer.
  expect((await cards.last().locator('.wf').boundingBox())!.height)
    .toBe((await cards.nth(n - 1).locator('.wf').boundingBox())!.height)
  const row = pickInput(win)
  await row.pressSequentially('KV cache')
  await expect(win.locator('.pickhits .rrow')).toHaveCount(1)
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
  await pickInput(win).press('Escape')
  await expect(cards).toHaveCount(n)

  await shown(win).locator('.wkmain .section-heading', { hasText: '细分主题' }).locator('.btn').click()
  await pickInput(win).pressSequentially('端到端新建的主题')
  await expect(win.locator('.pickhits .rrow')).toHaveCount(0)
  await expect(pickInput(win)).toHaveAttribute('aria-busy', 'false')
  await pickInput(win).press('Enter')
  await expect(cards).toHaveCount(n + 1)
  await shown(win).locator('.wkmain .wkgrid [data-wk="topics/端到端新建的主题"]').click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText('端到端新建的主题')
  await expect(shown(win).locator('.split-rail .tagchip[data-wk="topics/quantization"]')).toHaveCount(1)
  const changes = await call<{ title: string; undoable: boolean }[]>(win, 'changelog.list', {})
  expect(changes.slice(0, 3).map((c) => c.title)).toEqual([
    'Wiki · 新建 端到端新建的主题，归在 Quantization 下',
    'Wiki · 把 KV cache quantization 从 Quantization 下移出',
    'Wiki · 把 KV cache quantization 归到 Quantization 下',
  ])

  const latest = await call<{ id: string; title: string; undoable: boolean }[]>(win, 'changelog.list', {})
  expect(latest[0]).toMatchObject({ title: 'Wiki · 新建 端到端新建的主题，归在 Quantization 下', undoable: true })
  await call(win, 'changelog.undo', { id: latest[0]!.id })
  expect((await aggFromCore(win, 'topics/quantization')).children.map((c) => c.id)).not.toContain('topics/端到端新建的主题')
  const afterUndo = await call<{ title: string }[]>(win, 'changelog.list', {})
  expect(afterUndo[0]!.title).toBe('撤销：Wiki · 新建 端到端新建的主题，归在 Quantization 下')
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

  // Clicking + adds a row at the end of the table body: its header cell is the input, the other cells dashes.
  await shown(win).locator('.wkmain .section-heading', { hasText: '论文对比' }).locator('[aria-label="添加论文"]').click()
  await expect(rows).toHaveCount(n + 1)
  await expect(rows.last()).toHaveClass(/\bnewrow\b/)
  expect(await rows.last().locator('td:not(.rh):not(.table-actions)').allTextContents()).toEqual(agg.columns.map(() => '—'))
  const holder = (await rows.last().boundingBox())!
  await pickInput(win).pressSequentially('QuaRot')
  await expect(win.locator('.pickhits .rrow').first()).toContainText('QuaRot')
  await expect(pickInput(win)).toHaveAttribute('aria-busy', 'false')
  await pickInput(win).press('Enter')
  await expect(rows).toHaveCount(n + 1)
  await expect(shown(win).locator('table.cmp tbody tr.newrow')).toHaveCount(0)
  const added = shown(win).locator('table.cmp tbody tr', { hasText: 'QuaRot' })
  await expect(added.locator('td:not(.rh):not(.table-actions)')).toHaveText(agg.columns.map(() => '—'))
  // The placeholder row is as tall as the one-line row that takes its place, both the table's last row.
  await expect(rows.last()).toHaveText(/QuaRot/)
  expect(Math.abs((await added.boundingBox())!.height - holder.height)).toBeLessThan(0.5)

  await added.hover()
  await added.locator('td.table-actions').click()
  await expect(rows).toHaveCount(n)

  await shown(win).locator('table.cmp thead').hover()
  await shown(win).locator('table.cmp thead [aria-label="列设置"]').click()
  const editor = win.locator('[data-radix-popper-content-wrapper] .coledit')
  // The gear has no label, so the opened editor must say what it changes.
  await expect(editor.locator('.ch')).toHaveText('列设置')
  await expect(editor.locator('.row input')).toHaveCount(agg.columns.length)
  await editor.locator('.row input').first().fill('比特')
  await editor.locator('.btn.pri').click()
  await expect(shown(win).locator('table.cmp thead th').nth(1)).toHaveText('比特')
  // The first column has cells filled for member papers: Core rejects deleting it, the header stays, and
  // the editor stays open.
  await shown(win).locator('table.cmp thead').hover()
  await shown(win).locator('table.cmp thead [aria-label="列设置"]').click()
  await editor.locator('.row .icbtn').first().click()
  await editor.locator('.btn.pri').click()
  await expect(win.locator('#notice[data-tone="refusal"] .notice-text')).toHaveText('还有内容在用')
  await expect(shown(win).locator('.page-error')).toHaveCount(0)
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
    const cells = document.querySelectorAll('table.cmp tbody tr td.table-actions button')
    ;(cells[0] as HTMLElement).click()
    await Promise.resolve()
    ;(cells[1] as HTMLElement).click()
  })

  await expect(rows).toHaveCount(agg.rows.length - 1)
  await expect(shown(win).locator('.page-error')).toHaveCount(0)
  await expect(win.locator('#notice[data-tone="refusal"]')).toHaveCount(0)
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
  // A wide window shows a three-line card summary.
  const wm = shown(win).locator('.wkcard .wm').first()
  await expect(wm).toHaveCSS('overflow-y', 'hidden')
  expect(await wm.evaluate((el) => { const cs = getComputedStyle(el); return parseFloat(cs.height) / parseFloat(cs.lineHeight) }))
    .toBeCloseTo(3)
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
  // The table renders only once wiki.aggregation returns, and allTextContents does not wait for elements,
  // so wait for the table first.
  await table.waitFor()
  const heads = () => table.locator('thead th:not(.table-actions)').allTextContents()
  const before = await heads()

  await table.locator('thead').hover()
  await table.locator('thead [aria-label="新建列"]').click()
  await expect(table.locator('thead th.th-new')).toHaveCount(1)
  // The placeholder column adds a blank cell to each body row too, or the body's cells would not line up:
  // a row holds a cell under every header, that blank, and its actions cell.
  expect(await table.locator('tbody tr').first().locator('td').count())
    .toBe(before.length + 2)
  await table.locator('thead th.th-new input').fill('新列')
  await table.locator('thead th.th-new input').press('Enter')
  await expect.poll(heads).toEqual([...before, '新列'])
  await expect(table.locator('thead th.th-new')).toHaveCount(0)
  // Columns on this page have only a name, already typed, so no popover opens after one is created.
  await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(0)

  // Renaming and deleting go through the gear's Column settings, the same as for other columns.
  await table.locator('thead').hover()
  await table.locator('thead [aria-label="列设置"]').click()
  const editor = win.locator('[data-radix-popper-content-wrapper] .coledit')
  // The editor has a row per column but none for the Paper heading; before includes Paper but not the new
  // column, so the two counts are exactly equal.
  await expect(editor.locator('.row input')).toHaveCount(before.length)
  await editor.locator('.row input').last().fill('新列 2')
  await editor.locator('.btn.pri').click()
  await expect.poll(heads).toEqual([...before, '新列 2'])

  // A column name that duplicates an existing one is not submitted: the placeholder and typed text stay.
  await table.locator('thead').hover()
  await table.locator('thead [aria-label="新建列"]').click()
  await table.locator('thead th.th-new input').fill('新列 2')
  await table.locator('thead th.th-new input').press('Enter')
  await expect(table.locator('thead th.th-new')).toHaveCount(1)
  await expect(table.locator('thead th.th-new input')).toHaveValue('新列 2')
  // Remove the placeholder before counting headers: the `heads` selector excludes only .table-actions, so
  // it also counts th.th-new (as an empty string), and column counts compare only once it is gone.
  await table.locator('thead th.th-new input').press('Escape')
  await expect(table.locator('thead th.th-new')).toHaveCount(0)
  await expect.poll(heads).toEqual([...before, '新列 2'])

  // Open the placeholder again and press Esc. The number of columns remains unchanged.
  await table.locator('thead').hover()
  await table.locator('thead [aria-label="新建列"]').click()
  await table.locator('thead th.th-new input').press('Escape')
  await expect(table.locator('thead th.th-new')).toHaveCount(0)
  await expect.poll(heads).toEqual([...before, '新列 2'])

  // Pressing Paper comparison's + from the keyboard sends no pointerdown, so the placeholder column cannot
  // rely on an outside click to close; the two placeholders must still never be open at once.
  await table.locator('thead').hover()
  await table.locator('thead [aria-label="新建列"]').click()
  await expect(table.locator('thead th.th-new')).toHaveCount(1)
  await shown(win).locator('.wkmain .section-heading', { hasText: '论文对比' })
    .locator('[aria-label="添加论文"]').press('Enter')
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
  await expect(shown(win).locator('th.table-actions')).toHaveCount(0)
  // The header keeps only the add-paper +: the gear comes with the table, so with no table there is none.
  const head = shown(win).locator('.wkmain .section-heading', { hasText: '论文对比' })
  await expect(head.locator('button')).toHaveCount(1)
  await expect(head.locator('button')).toHaveAttribute('aria-label', '添加论文')
})

test('细分:名字里没有字母数字时占位与打好的字都留着', async ({ win }) => {
  await gotoWiki(win)
  await shown(win).locator('[data-wk="topics/quantization"]').click()
  // count() does not wait for elements: the page name in the header means wiki.aggregation has returned,
  // so the subpage cards can be counted correctly now.
  await expect(shown(win).locator('.desk-head .t')).toHaveText('Quantization')
  const cards = shown(win).locator('.wkmain .wkgrid .wkcard')
  const n = await cards.count()

  // Only pure punctuation has no slug: slugOf keeps \p{L}, so Chinese characters stay as they are (see
  // slug.test.ts).
  await shown(win).locator('.wkmain .section-heading', { hasText: '细分主题' }).locator('.btn').click()
  await pickInput(win).pressSequentially('!!!')
  await expect(pickInput(win)).toHaveAttribute('aria-busy', 'false')
  await pickInput(win).press('Enter')

  // Rejected: the message shows in the refusal notice, and the placeholder card keeps the typed text so it can be
  // fixed in place and submitted again.
  await expect(win.locator('#notice[data-tone="refusal"] .notice-text')).toHaveText('名字里得有字母或数字')
  await expect(shown(win).locator('.page-error')).toHaveCount(0)
  await expect(cards).toHaveCount(n + 1)
  await expect(cards.last()).toHaveClass(/\bnewcard\b/)
  await expect(pickInput(win)).toHaveValue('!!!')

  await pickInput(win).fill('kv paging')
  await expect(pickInput(win)).toHaveAttribute('aria-busy', 'false')
  await pickInput(win).press('Enter')
  await expect(shown(win).locator('.wkmain .wkgrid .newcard')).toHaveCount(0)
  await expect(cards).toHaveCount(n + 1)
  await expect(shown(win).locator('.wkmain .wkgrid [data-wk="topics/kv-paging"]')).toHaveCount(1)
})
