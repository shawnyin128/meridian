import type { Page } from '@playwright/test'
import type { PaperCell, PaperColumns } from '../apps/desktop/src/shared/contract.js'
import {
  DEFAULT_PAPER_GROUPS, READ_STATES, READING_PAPER, UNREAD_PAPER,
} from '../apps/desktop/src/shared/vocabulary.js'
import { expect, gotoPapers, parkPointer, settle, test, uniqueHeights, type MeridianWindow } from './app.js'

/** The page status of all 291 paper pages in the vault is this, which is not the same as the reading status. */
const PAGE_STATE = 'draft'

/** The number of remaining values in the topic group after filtering "attention" in the fixture; only when the index layer stabilizes to this number does it mean that the filtering has taken effect. */
const TOPICS_UNDER_FILTER = 56
const TOPIC = 'transformer architecture'

/** The topic added to the first line of the write path use case does not have this value in the fixture. */
const ADDED_TOPIC = 'kv cache 压缩'

/** Continuously write the multi-select column created by the use case, and connect the two newly created options in a grid. */
const MULTI_COLUMN = '标签'
const PICKED = ['综述', '必读'] as const

/** The total number of papers for fixture, the number of pages when there are 20 articles per page, and the number of articles remaining after filtering for "attention". */
const PAPERS_TOTAL = 291
const PAPER_PAGES = 15
const PAPERS_UNDER_FILTER = 44

/** The left edge of the first page gear button on the paging bar should be kept to two decimal places. */
const sizeButtonLeft = (win: Page) => win.locator('.pagebar .segmented-control>button').first()
  .evaluate((el) => +el.getBoundingClientRect().left.toFixed(2))

/** The screen you entered is always hung, and the selector that is present on every screen, such as the screen header, should be stored in the currently displayed screen. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

/** Measure a direct page-content child against the shared responsive page-width token. */
const sharedContentGeometry = (win: Page, selector: string) => shown(win, selector).first().evaluate((element) => {
  const box = element.getBoundingClientRect()
  const parent = element.parentElement!
  const parentStyle = getComputedStyle(parent)
  const available = parent.clientWidth
    - parseFloat(parentStyle.paddingLeft) - parseFloat(parentStyle.paddingRight)
  const cap = parseFloat(getComputedStyle(element).getPropertyValue('--pagew'))
  return {
    left: +box.left.toFixed(2),
    width: +box.width.toFixed(2),
    expectedWidth: +Math.min(available, cap).toFixed(2),
  }
})

/** Bypass the interface and call the core directly according to the contract method name. */
const call = <T>(win: Page, method: string, params: unknown) => win.evaluate(
  ([m, p]) => (window as unknown as MeridianWindow).meridian.call(m as string, p) as Promise<T>,
  [method, params] as const,
)

/** Wait until the 20th line on the first page is drawn: all subsequent measurements must be done on the table with data. */
const firstPage = (win: Page) => expect(win.locator('.ptable tbody tr')).toHaveCount(20)

/**
 * Before entering the paper screen, bypass the interface and write the column configuration, and then fill in the cells in the same position for each of the first `cells.length` rows arranged by date added, which is the table's default sort.
 * Return the ids of these rows. The paper screen is not hung up until the first time it is entered and the number is retrieved, so it needs to be adjusted before gotoPapers.
 */
async function seed(
  win: Page, custom: PaperColumns['custom'], cells: Record<string, PaperCell | null>[],
  groups: string[] = [...DEFAULT_PAPER_GROUPS],
): Promise<string[]> {
  // The sidebar is drawn, and preload and contract calls are ready.
  await win.locator('[data-desk="papers"]').waitFor()
  await call(win, 'papers.setColumns', { columns: { hidden: [], custom, groups } })
  if (cells.length === 0) return []
  const ids = await call<{ rows: { id: string }[] }>(
    win, 'papers.list', { page: 1, size: cells.length, sort: 'addedAt', direction: 'desc' },
  ).then((r) => r.rows.map((row) => row.id))
  for (const [at, patch] of cells.entries()) {
    await call(win, 'papers.update', { id: ids[at], patch: { custom: patch } })
  }
  return ids
}

/** Open the column settings menu, expand the type row of the column `label`, and click the `type` file; the menu remains. */
async function retype(win: Page, label: string, type: '文本' | '单选' | '多选'): Promise<void> {
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="列设置"]').click()
  const row = win.locator('[data-radix-popper-content-wrapper] .mi.colrow', { hasText: label })
  await row.hover()
  await row.locator('[title="改类型"]').click()
  await win.locator(`[data-radix-popper-content-wrapper] .typerow .ctbtn[title="${type}"]`).click()
}

/** Bypass the interface and press id to get the current custom grid of these articles. */
const cellsOf = (win: Page, ids: string[]) => Promise.all(ids.map((id) =>
  call<{ custom: Record<string, unknown> }>(win, 'papers.get', { id }).then((r) => r.custom)))

test('论文表每一行等高,行高是 38px', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  expect(await uniqueHeights(win.locator('.ptable tbody tr'))).toEqual([38])
})

test('论文工具栏的视图切换与导入操作底边对齐', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)

  const controls = win.locator(
    '.paper-view-toolbar .segmented-control>button, .paper-view-toolbar .pdfupload',
  )
  await expect(controls).toHaveCount(3)
  const bottoms = await controls.evaluateAll((buttons) => buttons.map((button) =>
    +button.getBoundingClientRect().bottom.toFixed(2)))
  expect(new Set(bottoms).size, `三个操作的底边分别在 ${bottoms.join(', ')}px`).toBe(1)
})

test('论文内容与分页栏遵循全局页面宽度', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)

  const content = await sharedContentGeometry(win, '.libwide')
  const footer = await sharedContentGeometry(win, '.pagebar')
  expect(content.width).toBe(content.expectedWidth)
  expect(footer.width).toBe(footer.expectedWidth)
  expect(footer.width).toBe(content.width)
  expect(footer.left).toBe(content.left)
})

test('研究地图从真实论文元数据形成可切换、可解释的重叠分组', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.getByRole('button', { name: '研究地图', exact: true }).click()

  await expect(win.locator('.research-map-title')).toContainText('自适应研究地图')
  await expect(win.locator('.research-map-group')).not.toHaveCount(0)
  await expect(win.locator('.research-map-detail')).toContainText('归入依据')
  await expect(win.locator('.research-map-detail')).toContainText('不会写回论文库')
  await expect(win.locator('.pagebar')).toHaveCount(0)

  const groups = win.locator('.research-map-group')
  const firstLabel = await groups.first().locator('strong').innerText()
  await groups.nth(1).click()
  await expect(win.locator('.research-map-detail-head strong')).not.toHaveText(firstLabel)
})

test('论文表首列是冻结列', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const position = await win.locator('.ptable tbody tr:first-child td:first-child')
    .evaluate((td) => getComputedStyle(td).position)
  expect(position).toBe('sticky')
})

test('论文表比可视区宽,横向溢出大于零', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await parkPointer(win)

  const { scrollWidth, clientWidth, expanded } = await win.locator('.tblwrap').evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    expanded: document.querySelectorAll('.ptable td.trunc:hover').length,
  }))
  console.log(`.tblwrap 横向溢出 ${scrollWidth - clientWidth}px(scrollWidth ${scrollWidth} − clientWidth ${clientWidth})`)
  expect(expanded, '指针压在被截断的格子上,量到的不是表格自身的宽度').toBe(0)
  expect(scrollWidth - clientWidth).toBeGreaterThan(0)
})

test('别的屏上的写不摘掉论文表的截断标记', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await parkPointer(win)
  const truncated = win.locator('.ptable td.trunc')
  const badges = win.locator('.ptable .morebadge')
  const cells = await truncated.count()
  const folded = await badges.count()
  console.log(`论文表上被标成截断的格子 ${cells} 个,其中折出 +N 徽章的 ${folded} 个`)
  expect(cells).toBeGreaterThan(0)
  expect(folded).toBeGreaterThan(0)

  // The writing on the later reading will increment the revision. The paper screen is hidden at this time, and the measured width is all 0.
  await win.locator('#rowLater').click()
  await shown(win, '.pcard').first().locator('[title="移出"]').click()
  await expect(shown(win, '.desk-head .t')).toHaveText('稍后阅读 · 3')

  await gotoPapers(win)
  await parkPointer(win)
  await expect(truncated).toHaveCount(cells)
  await expect(badges).toHaveCount(folded)
})

test('分组加筛选后,索引层计数、值 chip 计数与分页总数三者一致', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('#libq').fill('attention')
  await win.locator('.filters .segmented-control>button', { hasText: '主题' }).click()
  await expect(win.locator('.gxrow')).toHaveCount(TOPICS_UNDER_FILTER)

  const indexRow = win.locator('.gxrow').filter({ has: win.getByText(TOPIC, { exact: true }) })
  const indexCount = await indexRow.locator('.n').innerText()
  await indexRow.click()

  await expect(win.locator('.gnav .segmented-control>button.on')).toHaveText(`${TOPIC}(${indexCount})`)
  await expect(win.locator('.pginfo')).toHaveText(`共 ${indexCount} 条`)
})

test('表内给论文加一个主题后,重新取数确认这一行的主题真的变了', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const row = win.locator('.ptable tbody tr').first()
  const title = await row.locator('.pt-title .ci').innerText()
  const chips = row.locator('td:nth-child(7) .tagchip:not(.tagadd)')
  const before = await chips.allTextContents()

  // When the theme grid cannot fit, fold the extra chips and the + at the end and press them on this grid before unfolding.
  await row.locator('td:nth-child(7)').hover()
  await row.locator('td:nth-child(7) .tagadd').click()
  await win.locator('.tagin').fill(ADDED_TOPIC)
  await win.locator('.tagin').press('Enter')
  await expect(chips).toHaveText([...before, ADDED_TOPIC])
  await expect(win.locator('.tagin')).toHaveCount(0)

  // The interface's own table will be re-retrieved due to the increment of revision. Here we bypass the interface and check it again separately.
  // Confirm that the changes are actually written back to the core by papers.update, not in a local optimistic state.
  const refetchedTopics = await win.evaluate(async (t) => {
    const result = await (window as unknown as MeridianWindow).meridian
      .call('papers.list', { page: 1, size: 1, sort: 'title', direction: 'asc', filter: t }) as {
        rows: { topics: string[] }[]
      }
    return result.rows[0]?.topics
  }, title)
  expect(refetchedTopics).toEqual([...before, ADDED_TOPIC])
})

test('状态列显示的是阅读状态,点它选一档就写回 core,页面状态不受影响', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const row = win.locator('.ptable tbody tr').first()
  const title = await row.locator('.pt-title .ci').innerText()
  const chip = row.locator('.stchip')

  // The reading status is not written on the paper page in Curry, and it is filled in as unread when fetching it; this column does not write the extent of compilation.
  await expect(chip).toHaveText(UNREAD_PAPER)
  await expect(chip).not.toHaveText(PAGE_STATE)

  await chip.click()
  // Clicking this chip only opens the status floating layer, and does not mean clicking this line to open the details panel.
  await expect(win.locator('.ctxmenu .mi')).toHaveText([...READ_STATES])
  await expect(win.locator('.pdetail')).toHaveCount(0)

  await win.locator('.ctxmenu .mi', { hasText: READING_PAPER }).click()
  await expect(chip).toHaveText(READING_PAPER)

  // The interface's own table will be re-retrieved due to the increment of revision. Here we bypass the interface and check it again separately.
  // Confirm that the changes are actually written back to the core by papers.update, not in a local optimistic state.
  const refetched = await win.evaluate(async (t) => {
    const result = await (window as unknown as MeridianWindow).meridian
      .call('papers.list', { page: 1, size: 1, sort: 'title', direction: 'asc', filter: t }) as {
        rows: { readState: string; pageState: string }[]
      }
    return result.rows[0]
  }, title)
  console.log(`改过之后重新取数:${JSON.stringify(refetched)}`)
  expect(refetched?.readState).toBe(READING_PAPER)
  // The two states are written separately: changing the reading state does not change this page. How far has the wiki been compiled?
  expect(refetched?.pageState).toBe(PAGE_STATE)
})

test('删一篇论文后,总数减一且它不在结果里了', async ({ win }) => {
  test.slow()
  await gotoPapers(win)
  await firstPage(win)
  const listQuery = { page: 1, size: 10, sort: 'addedAt', direction: 'desc' } as const
  const list = (q: typeof listQuery) => win.evaluate((params) => (window as unknown as MeridianWindow).meridian
    .call('papers.list', params), q) as Promise<{ rows: { id: string }[]; total: number }>

  const before = await list(listQuery)
  await win.locator('.ptable tbody tr').first().locator('td').last().hover()
  await win.locator('.ptable tbody tr').first().locator('.rowx').click()

  await expect(win.locator('.pginfo')).toHaveText(`共 ${before.total - 1} 条`)
  const after = await list(listQuery)
  expect(after.total).toBe(before.total - 1)
  expect(after.rows.map((r) => r.id)).not.toContain(before.rows[0]!.id)
})

test('标签浮层:Escape 关层不冒到屏上,输入框里打的字不留', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const cell = win.locator('.ptable tbody tr').first().locator('td:nth-child(7)')
  const add = cell.locator('.tagadd')

  await cell.hover()
  await add.click()
  await expect(win.locator('.tagin')).toBeFocused()
  await win.locator('.tagin').fill('临时打的字')
  await win.keyboard.press('Escape')

  await expect(win.locator('.tagin')).toHaveCount(0)
  // Escape was eaten by the floating layer: the details panel was not opened at this time, and the table was still in the same place.
  await expect(win.locator('.pdetail')).toHaveCount(0)
  await expect(win.locator('.ptable tbody tr')).toHaveCount(20)

  await cell.hover()
  await add.click()
  await expect(win.locator('.tagin')).toHaveValue('')
})

test('标签添加框:写被拒时输入框与打好的字都留着', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  // The table is sorted by date added by default. Here we also retrieve it by date added. The first row retrieved is the first row on the table.
  const first = await call<{ rows: { id: string }[] }>(
    win, 'papers.list', { page: 1, size: 1, sort: 'addedAt', direction: 'desc' },
  ).then((r) => r.rows[0]!)
  const cell = win.locator('.ptable tbody tr').first().locator('td:nth-child(7)')
  const input = win.locator('.tagin')

  await cell.hover()
  await cell.locator('.tagadd').click()
  await input.fill(ADDED_TOPIC)
  // To bypass the interface, delete this article first: the row on the table is still there. If you press Enter and write core once, it will be rejected.
  await call(win, 'papers.delete', { id: first.id })
  await input.press('Enter')

  await expect(win.locator('#toast')).toContainText(`论文不存在:${first.id}`)
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  await expect(input).toHaveCount(1)
  await expect(input).toHaveValue(ADDED_TOPIC)
})

test('标签添加框:点联想项写被拒时,候选层与打开的占位都留着', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  // The table is sorted by date added by default. Here we also retrieve it by date added. The first row retrieved is the first row on the table.
  const first = await call<{ rows: { id: string }[] }>(
    win, 'papers.list', { page: 1, size: 1, sort: 'addedAt', direction: 'desc' },
  ).then((r) => r.rows[0]!)
  const cell = win.locator('.ptable tbody tr').first().locator('td:nth-child(7)')
  const input = win.locator('.tagin')
  const hit = win.locator('.pickhits .rrow').first()

  await cell.hover()
  await cell.locator('.tagadd').click()
  // Without typing, the association layer immediately lists the values that are not available in this article in the entire database; click on the first candidate to initiate the addition this time.
  await expect(hit).toHaveCount(1)
  const picked = await hit.innerText()
  // Bypass the interface and delete this article first: the row on the table is still there. If you click on the candidate and write core, it will be rejected.
  await call(win, 'papers.delete', { id: first.id })
  await hit.click()

  await expect(win.locator('#toast')).toContainText(`论文不存在:${first.id}`)
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  await expect(input).toHaveCount(1)
  await expect(hit).toHaveText(picked)
})

test('标签添加框:提交在路上时点外,写落地前候选层与占位都不收', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  // The table is sorted by date added by default. Here we also retrieve it by date added. The first row retrieved is the first row on the table.
  const first = await call<{ rows: { id: string }[] }>(
    win, 'papers.list', { page: 1, size: 1, sort: 'addedAt', direction: 'desc' },
  ).then((r) => r.rows[0]!)
  const cell = win.locator('.ptable tbody tr').first().locator('td:nth-child(7)')
  const input = win.locator('.tagin')
  const hit = win.locator('.pickhits .rrow').first()

  await cell.hover()
  await cell.locator('.tagadd').click()
  await expect(hit).toHaveCount(1)
  const picked = await hit.innerText()
  // Select your full text and screen it again: this article is still there, and it is still the first article after screening.
  await input.fill(picked)
  await expect(hit).toHaveText(picked)
  // Bypass the interface and delete this article first: the row on the table is still there, click on the candidate and write core this time, it will be rejected.
  await call(win, 'papers.delete', { id: first.id })

  // In the same task, first click the candidate once to submit, and then send pointerdown/mousedown/click to the elements outside the box in sequence:
  // papers.update takes IPC cross-process and cannot be implemented within this task. This series of points must fall when the submission is on the way.
  await win.evaluate(() => {
    document.querySelector<HTMLElement>('.pickhits .rrow')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const outside = document.querySelector<HTMLElement>('#libq')!
    for (const type of ['pointerdown', 'mousedown', 'click']) {
      outside.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 }))
    }
  })

  await expect(win.locator('#toast')).toContainText(`论文不存在:${first.id}`)
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  await expect(input).toHaveCount(1)
  await expect(input).toHaveValue(picked)
  await expect(hit).toHaveCount(1)
})

test('标签添加框:回车提交在路上时点外,写落地前占位、打的字与候选层都不收', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  // The table is sorted by date added by default. Here we also retrieve it by date added. The first row retrieved is the first row on the table.
  const first = await call<{ rows: { id: string }[] }>(
    win, 'papers.list', { page: 1, size: 1, sort: 'addedAt', direction: 'desc' },
  ).then((r) => r.rows[0]!)
  const cell = win.locator('.ptable tbody tr').first().locator('td:nth-child(7)')
  const input = win.locator('.tagin')
  const newRow = win.locator('.pickhits .rrow.mk')

  await cell.hover()
  await cell.locator('.tagadd').click()
  await input.fill(ADDED_TOPIC)
  await expect(newRow).toHaveCount(1)
  // To bypass the interface, delete this article first: the row on the table is still there, and writing core this time after pressing Enter will be rejected.
  await call(win, 'papers.delete', { id: first.id })

  // In the same task, first send a carriage return to submit once, and then send pointerdown/mousedown/click to the elements outside the box in sequence:
  // papers.update takes IPC cross-process and cannot be implemented within this task. This series of points must fall when the submission is on the way.
  await win.evaluate(() => {
    document.querySelector<HTMLElement>('.tagin')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const outside = document.querySelector<HTMLElement>('#libq')!
    for (const type of ['pointerdown', 'mousedown', 'click']) {
      outside.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 }))
    }
  })

  await expect(win.locator('#toast')).toContainText(`论文不存在:${first.id}`)
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  await expect(input).toHaveCount(1)
  await expect(input).toHaveValue(ADDED_TOPIC)
  await expect(newRow).toHaveCount(1)
})

test('标签添加框:没有联想层时焦点移走也收起,打的字不留', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const rows = await call<{ rows: { topics: string[] }[] }>(
    win, 'papers.list', { page: 1, size: 10, sort: 'addedAt', direction: 'desc' },
  ).then((r) => r.rows)
  const vocab = (await call<{ value: string }[]>(win, 'papers.facets', { field: 'topics' })).map((f) => f.value)
  // Enter a topic that already exists in this article, and there is no value in the word list other than this article that contains it: there is neither candidate nor new creation, and the association layer is not drawn.
  // To close it, you can only rely on occupying your own out-of-point and out-of-focus points.
  const pick = rows.flatMap((row, at) => row.topics.map((topic) => ({ at, topic, topics: row.topics })))
    .find(({ topic, topics }) => !vocab.some((v) => !topics.includes(v) && v.toLowerCase().includes(topic.toLowerCase())))
  expect(pick).toBeDefined()
  const cell = win.locator('.ptable tbody tr').nth(pick!.at).locator('td:nth-child(7)')
  const input = win.locator('.tagin')

  await cell.hover()
  await cell.locator('.tagadd').click()
  await input.fill(pick!.topic)
  await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(0)
  await input.press('Tab')
  await expect(input).toHaveCount(0)

  await cell.hover()
  await cell.locator('.tagadd').click()
  await expect(input).toHaveValue('')
})

test('标签添加框:点联想项写成功后,输入框与候选层都收起', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const cell = win.locator('.ptable tbody tr').first().locator('td:nth-child(7)')
  const chips = cell.locator('.tagchip:not(.tagadd)')
  const before = await chips.allTextContents()
  const input = win.locator('.tagin')
  const hit = win.locator('.pickhits .rrow').first()

  await cell.hover()
  await cell.locator('.tagadd').click()
  await expect(hit).toHaveCount(1)
  const picked = await hit.innerText()
  await hit.click()

  await expect(chips).toHaveText([...before, picked])
  await expect(input).toHaveCount(0)
  await expect(win.locator('.pickhits')).toHaveCount(0)
})

test('文本格:改完焦点移走或点到格外都算放弃,只有回车才写', async ({ win }) => {
  // Column creation, three rounds of editing and three core checks; a window that is not on the screen needs to wait two seconds for each operability, and the default 30 seconds is not enough
  test.slow()
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('备注')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  // The placeholder is removed only after the column is created and written; before the placeholder is removed, each row of the table body will have an extra space of pt-cust, which will be unique after it is removed.
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(0)

  const cell = win.locator('.ptable tbody tr').first().locator('td.pt-cust')
  const input = cell.locator('input.celledit')
  // The table is sorted by date added by default. Here we also retrieve it by date added. The first row retrieved is the first row on the table.
  const saved = () => call<{ rows: { custom: Record<string, unknown> }[] }>(
    win, 'papers.list', { page: 1, size: 1, sort: 'addedAt', direction: 'desc' },
  ).then((r) => Object.values(r.rows[0]!.custom))

  // The keyboard moves the focus out of this grid: the grid is closed and the typed words are not written.
  await cell.click()
  await input.fill('改了又不要')
  await input.press('Tab')
  await expect(input).toHaveCount(0)
  await expect(cell).toHaveText('')
  expect(await saved()).toEqual([])

  // Click outside the grid: also close it and don’t write
  await cell.click()
  await input.fill('点外面也不要')
  await shown(win, '.desk-head .t').click()
  await expect(input).toHaveCount(0)
  await expect(cell).toHaveText('')
  expect(await saved()).toEqual([])

  await cell.click()
  await input.fill('回车才写')
  await input.press('Enter')
  await expect(cell).toHaveText('回车才写')
  expect(await saved()).toEqual(['回车才写'])
})

test('文本格开着时按住表格自己的滚动条,不算点到格外:格子与字都还在', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('滚动条备注')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(0)

  const cell = win.locator('.ptable tbody tr').first().locator('td.pt-cust')
  const input = cell.locator('input.celledit')
  await cell.click()
  await input.fill('按滚动条也不丢')

  const wrap = win.locator('.tblwrap')
  const box = (await wrap.boundingBox())!
  // The 5px within the bottom edge of wrap is the track of the horizontal scroll bar. No line in the table body can reach this y
  await win.mouse.move(box.x + box.width / 2, box.y + box.height - 5)
  await win.mouse.down()
  await win.mouse.up()

  await expect(input).toHaveCount(1)
  await expect(input).toHaveValue('按滚动条也不丢')
})

test('文本格开着时按住表格自己的竖直滚动条,不算点到格外:格子与字都还在', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('竖向滚动条备注')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(0)

  // 50 items per page, the content of the table body far exceeds the height of the viewport, ensuring that the scroll bar in the vertical direction of .tblwrap is real, so that the test will not be empty.
  await win.locator('.pagebar .segmented-control>button', { hasText: '50 / 页' }).click()
  await expect(win.locator('.ptable tbody tr')).toHaveCount(50)

  const wrap = win.locator('.tblwrap')
  const overflowsVertically = await wrap.evaluate((el) => el.scrollHeight > el.clientHeight)
  expect(overflowsVertically).toBe(true)

  const cell = win.locator('.ptable tbody tr').first().locator('td.pt-cust')
  const input = cell.locator('input.celledit')
  await cell.click()
  await input.fill('按竖滚动条也不丢')

  const box = (await wrap.boundingBox())!
  // The 5px inside the right side of wrap is the track of the vertical scroll bar. No column in the table body can reach this x
  await win.mouse.move(box.x + box.width - 5, box.y + box.height / 2)
  await win.mouse.down()
  await win.mouse.up()

  await expect(input).toHaveCount(1)
  await expect(input).toHaveValue('按竖滚动条也不丢')
})

test('列管理:内置列显隐持久到离开再回来,固定列藏不了;自定义列新建、填格、撤销、改名、删除', async ({ win }) => {
  // A use case goes through creating columns, filling in fields, canceling, renaming, and deleting columns; a window that is not on the screen needs to wait two seconds for each operability, and the default 30 seconds is not enough.
  test.slow()
  await gotoPapers(win)
  await firstPage(win)
  const head = () => win.locator('.ptable thead th').allTextContents()
  // All built-in columns in the new library are displayed
  await expect.poll(head).toContain('主题')
  // There are two entrances at the end of the meter: + plus one column (the plus sign has no shaft hole), and the gear is set in rows (there is one shaft hole)
  await expect(win.locator('.ptable thead [title="列设置"] svg circle')).toHaveCount(1)
  await expect(win.locator('.ptable thead [title="新增列"] svg circle')).toHaveCount(0)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="列设置"]').click()
  const menu = win.locator('[data-radix-popper-content-wrapper] .mi.colrow')
  await menu.filter({ hasText: '主题' }).click()
  await expect.poll(head).not.toContain('主题')
  await expect(menu.filter({ hasText: '年份' })).toHaveClass(/locked/)
  await win.keyboard.press('Escape')
  await win.locator('[data-desk="wiki"]').click()
  await gotoPapers(win)
  await expect.poll(head).not.toContain('主题')
  // The thesis screen is always hanging, and what you see when you come back may be just the state it is holding on to; the column configuration will only be permanent if it is entered into the core——
  // The theme is the column hidden this time
  expect((await call<{ hidden: string[] }>(win, 'papers.columns', {})).hidden).toEqual(['topics'])

  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(1)
  // Once the placeholder is opened, the type layer pops up, and the focus is still on the column name input box; the new table header is at the right end of the table, and the layer cannot be squeezed out of the window.
  await expect(win.locator('[data-radix-popper-content-wrapper] .ctbtn')).toHaveCount(3)
  await expect(win.locator('.ptable thead th.th-new input')).toBeFocused()
  const layer = (await win.locator('[data-radix-popper-content-wrapper] .ctxmenu').boundingBox())!
  const vw = await win.evaluate(() => window.innerWidth)
  expect(layer.x).toBeGreaterThanOrEqual(0)
  expect(layer.x + layer.width).toBeLessThanOrEqual(vw)
  await win.locator('.ptable thead th.th-new input').fill('备注')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  await expect.poll(head).toContain('备注')
  // The column creation is written as: Remove the placeholder and type layer together, without leaving even one frame of overlap.
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(0)
  await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(0)

  // After adding one column, the two layout invariants of the table must still hold: rows remain 38px high and the library stays on the shared page width.
  await parkPointer(win)
  expect(await uniqueHeights(win.locator('.ptable tbody tr'))).toEqual([38])
  const wide = await sharedContentGeometry(win, '.libwide')
  expect(wide.width).toBe(wide.expectedWidth)

  const first = win.locator('.ptable tbody tr').first()
  const title = await first.locator('td.pt-title').innerText()
  await first.locator('td.pt-cust').click()
  await first.locator('td.pt-cust input.celledit').fill('读到一半')
  await first.locator('td.pt-cust input.celledit').press('Enter')
  await expect(first.locator('td.pt-cust')).toHaveText('读到一半')

  // The table is sorted by date added by default. Here we also retrieve it by date added. The first row retrieved is the first row on the table.
  const rows = await call<{ rows: { title: string; custom: Record<string, string> }[] }>(
    win, 'papers.list', { page: 1, size: 1, sort: 'addedAt', direction: 'desc' },
  ).then((r) => r.rows)
  expect(rows[0]!.title).toBe(title)
  expect(Object.values(rows[0]!.custom)).toEqual(['读到一半'])

  const changes = await call<{ id: string; title: string }[]>(win, 'changelog.list', {})
  expect(changes[0]!.title).toContain('改了字段')
  // To undo, take the real path on the recent changes screen: the write count of the entire database will be incremented there, and the paper table will be re-fetched accordingly.
  await win.locator('[data-desk="changelog"]').click()
  await shown(win, '.crow').first().locator('.cundo').click()
  await gotoPapers(win)
  await expect(first.locator('td.pt-cust')).toHaveText('')

  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="列设置"]').click()
  await menu.filter({ hasText: '备注' }).hover()
  await menu.filter({ hasText: '备注' }).locator('[title="重命名列"]').click()
  await win.locator('[data-radix-popper-content-wrapper] input.celledit').fill('批注')
  await win.locator('[data-radix-popper-content-wrapper] input.celledit').press('Enter')
  await expect.poll(head).toContain('批注')
  await menu.filter({ hasText: '批注' }).hover()
  await menu.filter({ hasText: '批注' }).locator('.cmx.del').click()
  await expect.poll(head).not.toContain('批注')
})

test('多选格:连着提交两次都留得住,点输入框本身不关弹层', async ({ win }) => {
  // Create a column and write two cells in a row; the window that is not on the screen needs to wait two seconds for each operability. The default 30 seconds is not enough.
  test.slow()
  await gotoPapers(win)
  await firstPage(win)
  const pop = win.locator('[data-radix-popper-content-wrapper]')

  // Create a multi-select column: one cell can hold two values, so there is no such thing as submitting twice in a row.
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await pop.locator('.ctbtn[title="多选"]').click()
  await win.locator('.ptable thead th.th-new input').fill(MULTI_COLUMN)
  await win.locator('.ptable thead th.th-new input').press('Enter')
  await expect.poll(() => win.locator('.ptable thead th').allTextContents()).toContain(MULTI_COLUMN)

  const cell = win.locator('.ptable tbody tr').first().locator('td.pt-cust').first()
  const input = cell.locator('input.celledit')
  await cell.click()
  await input.fill(PICKED[0])
  await expect(pop.locator('.rrow.mk')).toHaveCount(1)
  // The input box is the anchor of the elastic layer and is not inside the elastic layer. Clicking on it does not count as clicking outside the elastic layer. Both left and right clicks must be true:
  // Radix only postpones the closing of the left-click until click, and closes the right-click on the spot. The input box will be eaten by itself. Click can't stop it.
  for (const button of ['left', 'right'] as const) {
    await input.click({ button })
    await expect(pop).toHaveCount(1)
    await expect(input).toHaveValue(PICKED[0])
  }

  // There is no wait between two submissions: the first write has not come back yet, and the column configuration and grid values ​​clutching in the interface are still old.
  await input.press('Enter')
  await input.fill(PICKED[1])
  await input.press('Enter')

  const optionsNow = async () => {
    const columns = await call<PaperColumns>(win, 'papers.columns', {})
    return columns.custom.find((c) => c.label === MULTI_COLUMN)?.options ?? []
  }
  await expect.poll(optionsNow).toEqual(PICKED)
  // The table is sorted by addedAt by default (PaperTable.tsx). Here we also retrieve it by addedAt, so
  // the first row retrieved matches the first row on the table, the one just edited.
  const rows = await call<{ rows: { custom: Record<string, unknown> }[] }>(
    win, 'papers.list', { page: 1, size: 1, sort: 'addedAt', direction: 'desc' },
  ).then((r) => r.rows)
  expect(Object.values(rows[0]!.custom)).toEqual([PICKED])
})

test('列类型:建单选列、格子里建选项、按它分组、改名与撤销、删还在用的选项被拒', async ({ win }) => {
  // A use case goes through creating a column, filling in two boxes, grouping, renaming, canceling, and deleting; the window that does not appear on the screen needs to wait two seconds for each operation.
  test.slow()
  await gotoPapers(win)
  await firstPage(win)
  const head = () => win.locator('.ptable thead th').allTextContents()
  const menu = win.locator('[data-radix-popper-content-wrapper] .mi.colrow')

  // Create a selection column: The + at the end of the header opens a placeholder. In the type layer below it, first select the gear, fill in the name and press Enter
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await win.locator('[data-radix-popper-content-wrapper] .ctbtn[title="单选"]').click()
  await expect(win.locator('[data-radix-popper-content-wrapper] .ctbtn[title="单选"]')).toHaveClass(/on/)
  await win.locator('.ptable thead th.th-new input').fill('读法')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  await expect.poll(head).toContain('读法')
  await expect(win.locator('#banner span')).toHaveText('已新建列 · 全库可用')
  expect((await call<{ custom: { label: string; type: string }[] }>(win, 'papers.columns', {}))
    .custom[0]).toMatchObject({ label: '读法', type: 'select' })

  // Build an option in each of the two cells
  const rows = win.locator('.ptable tbody tr')
  for (const [at, value] of [[0, '精读'], [1, '略读']] as const) {
    await rows.nth(at).locator('td.pt-cust').click()
    await rows.nth(at).locator('td.pt-cust input.celledit').fill(value)
    await win.locator('[data-radix-popper-content-wrapper] .rrow.mk').click()
    await expect(rows.nth(at).locator('td.pt-cust .tagchip')).toHaveText(value)
  }
  expect((await call<{ custom: { options: string[] }[] }>(win, 'papers.columns', {}))
    .custom[0]!.options).toEqual(['精读', '略读'])

  // Check it in the gear, and there will be one more chip in the grouping column; click in and only the two filled-in articles will be grouped.
  await win.locator('.filters .grpgear').click()
  await win.locator('[data-radix-popper-content-wrapper] .mi', { hasText: '读法' }).click()
  await win.keyboard.press('Escape')
  await win.locator('.filters .segmented-control>button', { hasText: '读法' }).click()
  await expect(win.locator('.gxrow')).toHaveCount(2)
  await expect(win.locator('.gxrow .n')).toHaveText(['1', '1'])

  // When you are grouping by it, uncheck it in the gear: chip is gone, and the group will return to "None" on the spot.
  await win.locator('.filters .grpgear').click()
  await win.locator('[data-radix-popper-content-wrapper] .mi', { hasText: '读法' }).click()
  await win.keyboard.press('Escape')
  await expect(win.locator('.filters .segmented-control>button', { hasText: '读法' })).toHaveCount(0)
  await expect(win.locator('.filters .segmented-control>button.on')).toHaveText('无')

  // Change the name of an option: the grid will change accordingly, bypass the interface and check again to confirm that it is not a local optimistic state.
  await firstPage(win)
  const title = await rows.first().locator('td.pt-title').innerText()
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="列设置"]').click()
  await menu.filter({ hasText: '读法' }).locator('.cmx.optx').click()
  const option = win.locator('[data-radix-popper-content-wrapper] .mi.optrow', { hasText: '精读' })
  await option.hover()
  await option.locator('.cmx').first().click()
  await win.locator('[data-radix-popper-content-wrapper] input.celledit').fill('细读')
  await win.locator('[data-radix-popper-content-wrapper] input.celledit').press('Enter')
  await win.keyboard.press('Escape')
  await expect(rows.first().locator('td.pt-cust .tagchip')).toHaveText('细读')
  const listed = await call<{ rows: { title: string; custom: Record<string, string> }[] }>(
    win, 'papers.list', { page: 1, size: 1, sort: 'addedAt', direction: 'desc' },
  ).then((r) => r.rows)
  expect(listed[0]!.title).toBe(title)
  expect(Object.values(listed[0]!.custom)).toEqual(['细读'])
  const changes = await call<{ id: string; title: string }[]>(win, 'changelog.list', {})
  expect(changes[0]!.title).toBe('论文表 · 列「读法」的选项 精读 → 细读')

  // Withdraw: Thesis goes back with column options
  await win.locator('[data-desk="changelog"]').click()
  await shown(win, '.crow').first().locator('.cundo').click()
  await gotoPapers(win)
  await expect(rows.first().locator('td.pt-cust .tagchip')).toHaveText('精读')
  expect((await call<{ custom: { options: string[] }[] }>(win, 'papers.columns', {}))
    .custom[0]!.options).toEqual(['精读', '略读'])

  // There are also options filled in the paper that cannot be deleted: toast reports the original words of core, and the header remains unchanged.
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="列设置"]').click()
  await menu.filter({ hasText: '读法' }).locator('.cmx.optx').click()
  const still = win.locator('[data-radix-popper-content-wrapper] .mi.optrow', { hasText: '略读' })
  await still.hover()
  await still.locator('.cmx.del').click()
  await expect(win.locator('#toast')).toContainText('还有论文在用')
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  await expect.poll(head).toContain('读法')

  // Delete this column when you are grouping it: the header and the chip on the grouping column are gone, and the grouping is returned to "None" on the spot.
  await win.keyboard.press('Escape')
  await win.locator('.filters .grpgear').click()
  await win.locator('[data-radix-popper-content-wrapper] .mi', { hasText: '读法' }).click()
  await win.keyboard.press('Escape')
  await shown(win, '.filters .segmented-control>button').filter({ hasText: '读法' }).click()
  await win.locator('.gxrow').first().click()
  await expect(shown(win, '.filters .segmented-control>button.on')).toHaveText('读法')

  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="列设置"]').click()
  await menu.filter({ hasText: '读法' }).hover()
  await menu.filter({ hasText: '读法' }).locator('.cmx.del').click()
  await expect(shown(win, '.filters .segmented-control>button').filter({ hasText: '读法' })).toHaveCount(0)
  await expect(shown(win, '.filters .segmented-control>button.on')).toHaveText('无')
  await expect.poll(head).not.toContain('读法')
  // If you delete a column without removing it from the group, the core will reject the write and the column will be retrieved. The above assertion is only an optimistic state.
  const left = await call<PaperColumns>(win, 'papers.columns', {})
  expect(left.custom).toEqual([])
  expect(left.groups).toEqual([...DEFAULT_PAPER_GROUPS])
})

test('筛选改了总条数,每页档位按钮的左边缘不动', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)

  const full = await win.locator('.pginfo').innerText()
  const before = await sizeButtonLeft(win)

  await win.locator('#libq').fill('attention')
  await expect(win.locator('.pginfo')).toHaveText(`共 ${PAPERS_UNDER_FILTER} 条`)
  const after = await sizeButtonLeft(win)

  console.log(`每页档位左边缘:${full} → ${before}px,共 ${PAPERS_UNDER_FILTER} 条 → ${after}px`)
  expect(full, '两次的位数一样,这条用例证不了任何事').toBe(`共 ${PAPERS_TOTAL} 条`)
  expect(after).toBe(before)
})

test('翻页改了页码的个数,页码条与每页档位的边缘不动', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)

  const goPage = async (n: number) => {
    await win.locator('.pager .pgbtn', { hasText: new RegExp(`^${n}$`) }).click()
    await expect(win.locator('.pager .pgbtn.on')).toHaveText(String(n))
  }
  const edges = async () => ({
    shape: (await win.locator('.pager').innerText()).replace(/\s+/g, ''),
    seg: await sizeButtonLeft(win),
    pager: await win.locator('.pager').evaluate((el) => {
      const box = el.getBoundingClientRect()
      return [+box.left.toFixed(2), +box.right.toFixed(2)]
    }),
  })

  const first = await edges()
  // There is only one ellipsis on the first page, on both sides of page 4, and again on the last page: the lengths of the three page number bars are different.
  for (const n of [2, 3, 4]) await goPage(n)
  const middle = await edges()
  await goPage(PAPER_PAGES)
  const last = await edges()

  for (const [label, e] of [['首页', first], ['中间页', middle], ['末页', last]] as const) {
    console.log(`${label} 页码条「${e.shape}」:每页档位左 ${e.seg}px,页码条 [${e.pager.join(', ')}]px`)
  }
  expect(new Set([first.shape, middle.shape, last.shape]).size,
    '三页的页码条长得一样,这条用例证不了任何事').toBe(3)
  expect(middle.seg).toBe(first.seg)
  expect(last.seg).toBe(first.seg)
  expect(middle.pager).toEqual(first.pager)
  expect(last.pager).toEqual(first.pager)
})

test('分页条两端对齐:条数贴左缘,页码与每页档位挨着贴右缘', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)

  const laid = await win.locator('.pagebar').evaluate((bar) => {
    const bx = bar.getBoundingClientRect()
    // What is measured is where the words "total N items" fall, not the .pginfo box: when the box is expanded, the words are still at the left end.
    // Only the word "quantity" can tell clearly that the number of items the user sees is not posted on the left edge.
    const count = document.createRange()
    count.selectNodeContents(bar.querySelector('.pginfo')!)
    const seg = bar.querySelector('.segmented-control')!.getBoundingClientRect()
    const pgbtn = bar.querySelectorAll('.pager .pgbtn')
    const tail = pgbtn[pgbtn.length - 1]!.getBoundingClientRect()
    return {
      countInset: +(count.getBoundingClientRect().left - bx.left).toFixed(2),
      segInset: +(bx.right - seg.right).toFixed(2),
      pageToSeg: +(seg.left - tail.right).toFixed(2),
      gap: parseFloat(getComputedStyle(bar).columnGap),
      rows: new Set([...bar.children].map((c) => {
        const r = c.getBoundingClientRect()
        return Math.round(r.top + r.height / 2)
      })).size,
    }
  })

  console.log(`分页条版式:条数离左缘 ${laid.countInset}px,每页档位离右缘 ${laid.segInset}px,`
    + `末页码与每页档位相距 ${laid.pageToSeg}px(分页条的 gap 是 ${laid.gap}px)`)
  expect(laid.rows, '分页条已经换行,量到的不是同一行上的版式').toBe(1)
  expect(laid.countInset).toBe(0)
  expect(laid.segInset).toBe(0)
  expect(laid.pageToSeg).toBe(laid.gap)
})

test('年份与发表分两列:年份只写年份、仍按它排序,发表只写出处、紧跟年份、可隐藏;详情里两行各写各的,详情开着时表只剩标题、作者与年份', async ({ win }) => {
  // Two rounds of sorting, one hiding, and opening details; a window that is not on the screen needs to wait two seconds for each operability, and the default 30 seconds is not enough
  test.slow()
  await gotoPapers(win)
  await firstPage(win)
  // Draw a sorting arrow next to the label at the header of the table. The read text has a leading space; trimming it is better than pure labels.
  const head = async () => (await win.locator('.ptable thead th').allTextContents()).map((t) => t.trim())
  // After the title is the short title, rating, author, year, publication, topic, and status.
  expect((await head()).slice(0, 8)).toEqual(['标题', '短标题', '评分', '作者', '年份', '发表', '主题', '状态'])
  const listed = (direction: 'asc' | 'desc') => call<{ rows: { year?: number; venue: string }[] }>(
    win, 'papers.list', { page: 1, size: 10, sort: 'year', direction },
  ).then((r) => r.rows)
  const rows = win.locator('.ptable tbody tr')
  // The table sorts by date added by default, not year: click the year header once to make it the sort column, which defaults to descending.
  await win.locator('.ptable thead th[data-k="year"]').click()
  const desc = await listed('desc')
  await expect(rows.locator('td:nth-child(5)')).toHaveText(desc.map((p) => String(p.year ?? '')))
  await expect(rows.locator('td:nth-child(6)')).toHaveText(desc.map((p) => p.venue))

  // The year is still the sorting column: click again to switch to ascending order, and the two columns will be switched to the page in ascending order.
  await win.locator('.ptable thead th[data-k="year"]').click()
  const asc = await listed('asc')
  await expect(rows.locator('td:nth-child(5)')).toHaveText(asc.map((p) => String(p.year ?? '')))
  await expect(rows.locator('td:nth-child(6)')).toHaveText(asc.map((p) => p.venue))

  // Publishing is not a fixed column, it can be hidden, it is venue that goes into the core
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="列设置"]').click()
  const menu = win.locator('[data-radix-popper-content-wrapper] .mi.colrow')
  await expect(menu.filter({ hasText: '年份' })).toHaveClass(/locked/)
  await expect(menu.filter({ hasText: '发表' })).not.toHaveClass(/locked/)
  await menu.filter({ hasText: '发表' }).click()
  await expect.poll(head).not.toContain('发表')
  // All the built-in columns in the new library are displayed, and the published column is the column that was hidden this time.
  expect((await call<PaperColumns>(win, 'papers.columns', {})).hidden).toEqual(['venue'])
  await win.keyboard.press('Escape')

  const columnsBeforeDetails = await head()
  // The inspector has its own metadata, while opening it leaves the configured table columns intact.
  await rows.first().locator('td.pt-title').click()
  const props = win.locator('.pdetail .paper-meta-list')
  await expect(props.locator('dt:text-is("年份") + dd')).toHaveText(String(asc[0]!.year ?? ''))
  await expect(props.locator('dt:text-is("发表") + dd')).toHaveText(asc[0]!.venue)
  await expect.poll(head).toEqual(columnsBeforeDetails)
  await expect(rows.first()).toHaveClass(/\bselected\b/)
  await expect(rows.first()).toHaveAttribute('aria-current', 'true')
})

test('齿轮里没有新建入口,建列归表头末尾的 ＋', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="列设置"]').click()
  const menu = win.locator('[data-radix-popper-content-wrapper]')
  // The menu is really open, so the following two items are not passed empty-handed because they are not open.
  await expect(menu.locator('.mi.colrow', { hasText: '年份' })).toHaveCount(1)
  await expect(menu.locator('.mi-in')).toHaveCount(0)
  await expect(menu.locator('.ctrow')).toHaveCount(0)
})

test('占位列开着时行高仍是 38px,表仍对齐全局页面宽度', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const cells = () => win.locator('.ptable tbody tr').first().locator('td').count()
  const before = await cells()
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(1)
  // The placeholder column also has a blank space in each row of the table body. The number of cells in the table is not correct.
  expect(await cells()).toBe(before + 1)
  await parkPointer(win)
  expect(await uniqueHeights(win.locator('.ptable tbody tr'))).toEqual([38])
  const wide = await sharedContentGeometry(win, '.libwide')
  expect(wide.width).toBe(wide.expectedWidth)
  // Esc removes the entire occupying column
  await win.locator('.ptable thead th.th-new input').press('Escape')
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(0)
  expect(await cells()).toBe(before)
})

test('详情面板保留完整列与列操作,Escape 收的是详情面板', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const headersBefore = await win.locator('.ptable thead th').allTextContents()
  await win.locator('.ptable tbody tr').first().locator('td.pt-title').click()
  await expect(win.locator('.pdetail')).toHaveCount(1)
  const detailSlot = win.locator('.paper-detail-slot')
  await expect(detailSlot).toHaveAttribute('data-panel-state', 'open')
  expect(await detailSlot.evaluate((element) => getComputedStyle(element).transitionProperty))
    .toContain('transform')
  expect(await win.locator('.ptable thead th').allTextContents()).toEqual(headersBefore)
  await expect(win.locator('.ptable thead [title="新增列"]')).toBeEnabled()
  await win.keyboard.press('Escape')
  await expect(win.locator('.pdetail')).toHaveCount(0)
  await expect(detailSlot).toHaveAttribute('data-panel-state', 'closed')
  // No floating layer should pop up when the details are closed: if the layer that creates the column is opened when the details are open, it will pop up.
  await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(0)
})

test('建列被 core 拒绝:占位格与打好的列名都留着,改了再回车才建出来', async ({ win }) => {
  // Create a column, fill in two boxes, delete a column, and create a column twice; the window that is not on the screen needs to wait two seconds for each operability, and the default 30 seconds is not enough
  test.slow()
  await gotoPapers(win)
  await firstPage(win)
  const head = () => win.locator('.ptable thead th').allTextContents()
  const pop = win.locator('[data-radix-popper-content-wrapper]')
  const newHead = win.locator('.ptable thead th.th-new')
  const newInput = newHead.locator('input')

  // The first line leaves two values in a multi-select column, and then deletes this column: the column is gone, but the values remain in the paper.
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await pop.locator('.ctbtn[title="多选"]').click()
  await newInput.fill(MULTI_COLUMN)
  await newInput.press('Enter')
  await expect(newHead).toHaveCount(0)
  const cell = win.locator('.ptable tbody tr').first().locator('td.pt-cust')
  await cell.click()
  for (const value of PICKED) {
    await cell.locator('input.celledit').fill(value)
    await pop.locator('.rrow.mk').click()
    await expect(pop.locator('.rrow.opt', { hasText: value }).locator('.ck svg')).toHaveCount(1)
  }
  await win.keyboard.press('Escape')
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="列设置"]').click()
  const menu = pop.locator('.mi.colrow')
  await menu.filter({ hasText: MULTI_COLUMN }).hover()
  await menu.filter({ hasText: MULTI_COLUMN }).locator('.cmx.del').click()
  await expect.poll(head).not.toContain(MULTI_COLUMN)
  await win.keyboard.press('Escape')
  // The table is sorted by date added by default. Here we also retrieve it by date added. The first row retrieved is the first row on the table.
  const first = await call<{ rows: { custom: Record<string, unknown> }[] }>(
    win, 'papers.list', { page: 1, size: 1, sort: 'addedAt', direction: 'desc' },
  ).then((r) => r.rows[0]!)
  expect(Object.values(first.custom)).toEqual([PICKED])
  expect((await call<PaperColumns>(win, 'papers.columns', {})).custom).toEqual([])

  // The key of the Chinese column name fell on the same one again. Core saw multiple values ​​left in the paper and rejected this column - choose a non-default one.
  // Submit the type again, and "the type will quietly fall back to the default after being rejected." This kind of regression will be seen by this use case.
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await pop.locator('.ctbtn[title="单选"]').click()
  await newInput.fill('读法')
  await newInput.press('Enter')
  // Column creation is not optimistic about insertion: at this moment, the table header should not have it, only the placeholder, and the focus is still on the placeholder.
  expect(await head()).not.toContain('读法')
  await expect(newInput).toBeFocused()
  await expect(win.locator('#toast')).toHaveText('列「读法」不是多选列,有论文填着多个值')
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  // Writing was rejected: the placeholder, type layer, typed words, and type pressed (the "radio selection" selected this time, not the default "text") are all retained.
  await expect(newHead).toHaveCount(1)
  await expect(newInput).toHaveValue('读法')
  const selectBtn = pop.locator('.ctbtn[title="单选"]')
  await expect(selectBtn).toHaveAttribute('aria-checked', 'true')
  await expect(selectBtn).toHaveClass(/on/)
  await expect.poll(head).not.toContain('读法')
  expect((await call<PaperColumns>(win, 'papers.columns', {})).custom).toEqual([])

  // Change it to a non-colliding key name on the spot and press Enter: This time it will be built and the placeholder will be removed.
  await newInput.fill('note')
  await newInput.press('Enter')
  await expect.poll(head).toContain('note')
  await expect(newHead).toHaveCount(0)
})

test('建列一次建成:选中的类型跟着一次写落地,不是先建文本列再改', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const head = () => win.locator('.ptable thead th').allTextContents()

  // Click +: The placeholder and type layer appear at the same time, and the focus is on the column name input box.
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(1)
  await expect(win.locator('.ptable thead th.th-new input')).toBeFocused()

  // Click "Radio Select": the button aria-checked="true", the focus is still on the input box
  const selectBtn = win.locator('[data-radix-popper-content-wrapper] .ctbtn[title="单选"]')
  await selectBtn.click()
  await expect(selectBtn).toHaveAttribute('aria-checked', 'true')
  await expect(win.locator('.ptable thead th.th-new input')).toBeFocused()

  // Type a name and press Enter: the type of the new column in core is select, the table header appears, the placeholders and layers are gone, and there is no configuration layer.
  await win.locator('.ptable thead th.th-new input').fill('建列一次建成')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  await expect.poll(head).toContain('建列一次建成')
  expect((await call<PaperColumns>(win, 'papers.columns', {}))
    .custom.find((c) => c.label === '建列一次建成')).toMatchObject({ type: 'select' })
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(0)
  await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(0)
})

test('建列占位:Esc 放弃,占位与类型层一起没了', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('放弃的草稿')
  await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(1)

  await win.keyboard.press('Escape')
  // Both sentences take snapshots, do not poll, etc. The type layer is checked first: red should be red in the type layer itself, not the one that is occupied first.
  expect(await win.locator('[data-radix-popper-content-wrapper]').count()).toBe(0)
  expect(await win.locator('.ptable thead th.th-new').count()).toBe(0)
})

test('建列占位:点到占位与类型层之外,占位与类型层一起没了', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('放弃的草稿')
  await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(1)

  await shown(win, '.desk-head .t').click()
  // Both sentences take snapshots, do not poll, etc. The type layer is checked first: red should be red in the type layer itself, not the one that is occupied first.
  expect(await win.locator('[data-radix-popper-content-wrapper]').count()).toBe(0)
  expect(await win.locator('.ptable thead th.th-new').count()).toBe(0)
})

test('建列占位:点类型按钮不放弃,占位、类型层、打的字都还在', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('点类型不放弃')

  await win.locator('[data-radix-popper-content-wrapper] .ctbtn[title="多选"]').click()
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(1)
  await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(1)
  await expect(win.locator('.ptable thead th.th-new input')).toHaveValue('点类型不放弃')
})

test('建列占位:只用键盘建一列多选列', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  const input = win.locator('.ptable thead th.th-new input')
  await input.fill('键盘建列')

  // Press Tab in the input box, focus into the type layer, and fall on the currently selected "Text"
  await win.keyboard.press('Tab')
  const textBtn = win.locator('[data-radix-popper-content-wrapper] .ctbtn[title="文本"]')
  const multiBtn = win.locator('[data-radix-popper-content-wrapper] .ctbtn[title="多选"]')
  await expect(textBtn).toBeFocused()

  // Use the arrow keys to move between the three gears and select, and the focus remains in the group: text → single selection → multiple selection
  await win.keyboard.press('ArrowRight')
  await win.keyboard.press('ArrowRight')
  await expect(multiBtn).toBeFocused()
  await expect(multiBtn).toHaveAttribute('aria-checked', 'true')

  // Enter selects the currently focused gear and returns the focus to the column name input box.
  await win.keyboard.press('Enter')
  await expect(input).toBeFocused()

  // Press enter in the input box to submit: the type in core is "multiple selection" selected by the keyboard.
  await win.keyboard.press('Enter')
  await expect.poll(() => win.locator('.ptable thead th').allTextContents()).toContain('键盘建列')
  expect((await call<PaperColumns>(win, 'papers.columns', {}))
    .custom.find((c) => c.label === '键盘建列')).toMatchObject({ type: 'multi' })
})

test('建列不乐观插入:写在路上或写失败时表头不会同时有新列与占位,写成功后只有新列', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const head = () => win.locator('.ptable thead th').allTextContents()

  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('建列时序')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  // The moment you press enter, you immediately check the table header: the new column should not have appeared (no optimistic insertion), and the placeholder is still there - both will not be there at the same time.
  expect(await head()).not.toContain('建列时序')
  expect(await win.locator('.ptable thead th.th-new').count()).toBe(1)

  // After the writing is implemented: the placeholder is no longer there, the new column is there
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(0)
  await expect.poll(head).toContain('建列时序')
})

test('建列写在路上时 Esc 放弃了草稿:占位与类型层一起没了,写落地不补开任何层,列照样建成', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('写在路上被放弃')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  // Press Esc without waiting for the writing to land: the placeholder is removed, but the writing has been sent and cannot be withdrawn.
  await win.keyboard.press('Escape')
  // Both sentences take snapshots, do not poll, etc. The type layer is checked first: red should be red in the type layer itself, not the one that is occupied first.
  expect(await win.locator('[data-radix-popper-content-wrapper]').count()).toBe(0)
  expect(await win.locator('.ptable thead th.th-new').count()).toBe(0)

  await expect.poll(() => call<PaperColumns>(win, 'papers.columns', {}).then((c) => c.custom.map((x) => x.label)))
    .toContain('写在路上被放弃')
  // After writing, nothing should be turned on.
  expect(await win.locator('[data-radix-popper-content-wrapper]').count()).toBe(0)
})

test('建列写在路上时在格子选择器里新建选项:排在建列之后写成,选项进列、格子填上', async ({ win }) => {
  const [id] = await seed(win, [{ key: 'du-fa', label: '读法', type: 'select', options: ['精读'] }], [{ 'du-fa': '精读' }])
  await gotoPapers(win)
  await firstPage(win)
  const cell = win.locator('.ptable tbody tr').first().locator('td.pt-cust').first()
  await expect(cell.locator('.tagchip')).toHaveText('精读')
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('建列时序')

  // In the same task: press Enter to start writing in the column, then click on the "Reading" box on the first line, type a new option and press Enter. setColumns go IPC
  // Cross-process, it is impossible to land in this task, this string must fall on the road of construction; React is submitted in the micro task,
  // Therefore, only microtasks are placed between each step and no tasks are given out.
  await win.evaluate(async () => {
    const settle = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve() }
    document.querySelector<HTMLInputElement>('.ptable thead th.th-new input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const td = document.querySelector<HTMLElement>('.ptable tbody tr td.pt-cust')!
    for (const type of ['pointerdown', 'mousedown', 'click']) {
      td.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 }))
    }
    await settle()
    const picker = td.querySelector<HTMLInputElement>('input.celledit')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(picker, '略读')
    picker.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })

  await expect.poll(() => call<PaperColumns>(win, 'papers.columns', {})
    .then((c) => c.custom.map((x) => [x.label, x.options])))
    .toEqual([['读法', ['精读', '略读']], ['建列时序', []]])
  await expect.poll(() => call<{ custom: Record<string, unknown> }>(win, 'papers.get', { id })
    .then((r) => r.custom)).toEqual({ 'du-fa': '略读' })
  await expect(cell.locator('.tagchip')).toHaveText('略读')
})

test('窄窗口下建列的类型层仍整块落在窗口里', async ({ win, app }) => {
  // The new meter head is at the far right end of the meter, and the narrow gear is the one where it is most likely to be squeezed out of the window.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 720))
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  // The type layer pops up together with the placeholder, so you don’t have to wait for Enter or write to land.
  const layer = (await win.locator('[data-radix-popper-content-wrapper] .ctxmenu').boundingBox())!
  const vw = await win.evaluate(() => window.innerWidth)
  console.log(`1280×720 下类型层落在 [${layer.x}, ${layer.x + layer.width}]px,窗口宽 ${vw}px`)
  expect(layer.x).toBeGreaterThanOrEqual(0)
  expect(layer.x + layer.width).toBeLessThanOrEqual(vw)
})

test('状态浮层是真菜单:四档是 menuitemradio,当前那一档 aria-checked;下键走到「在读」回车写回', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const chip = win.locator('.ptable tbody tr').first().locator('.stchip')
  await expect(chip).toHaveAttribute('aria-haspopup', 'menu')
  await chip.click()
  const items = win.locator('[role="menu"] [role="menuitemradio"]')
  await expect(items).toHaveText([...READ_STATES])
  await expect(items.nth(READ_STATES.indexOf(UNREAD_PAPER))).toHaveAttribute('aria-checked', 'true')
  await expect(items.nth(READ_STATES.indexOf(READING_PAPER))).toHaveAttribute('aria-checked', 'false')

  // When clicked, the focus is on the content layer: the first time the key is pressed to the first level, the second time it is pressed to "Reading"
  await win.keyboard.press('ArrowDown')
  await win.keyboard.press('ArrowDown')
  await expect(items.nth(READ_STATES.indexOf(READING_PAPER))).toHaveAttribute('data-highlighted', '')
  await win.keyboard.press('Enter')

  await expect(win.locator('[role="menu"]')).toHaveCount(0)
  await expect(chip).toHaveText(READING_PAPER)
  // When I press Enter to select it, it does not pop up to the row to open the details panel.
  await expect(win.locator('.pdetail')).toHaveCount(0)
})

test('阅读状态菜单开着、指针挪到菜单项上之后,行留着 hover 底色,行尾删除钮与加标签钮也仍然可见', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const row = win.locator('.ptable tbody tr').first()
  // The background color of hover is drawn on the grid (td), not <tr> itself, so the background color must be read from the grid
  const cell = row.locator('td:nth-child(7)')
  // The first column is a sticky grid, and the background color is the gradient of background-image, not background-color.
  const stickyCell = row.locator('td:first-child')
  const rowx = row.locator('.rowx')
  const tagadd = cell.locator('.tagadd')

  await row.hover()
  await settle(cell)
  const hoverBg = await cell.evaluate((el) => getComputedStyle(el).backgroundColor)
  await settle(stickyCell)
  const hoverStickyImage = await stickyCell.evaluate((el) => getComputedStyle(el).backgroundImage)
  await row.locator('.stchip').click()
  // When the pointer is moved to the menu item, the line is really lost :hover - if it is not moved, it will be "sticky" and no problem can be detected.
  await win.locator('[role="menu"] [role="menuitemradio"]').first().hover()
  await settle(cell)
  expect(await cell.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(hoverBg)
  await settle(stickyCell)
  expect(await stickyCell.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe(hoverStickyImage)
  await settle(rowx)
  await expect(rowx).toHaveCSS('opacity', '1')
  await settle(tagadd)
  await expect(tagadd).toHaveCSS('opacity', '1')
  await expect(tagadd).toHaveCSS('pointer-events', 'none')
})

// This use case must be run in the displayed window. This effect cannot be achieved in an off-screen window.
test.describe(() => {
  test.use({ showWindow: true })

  test('阅读状态菜单开着时,点行尾的删除钮只关掉菜单,不会真的删除这一行', async ({ win }) => {
    await gotoPapers(win)
    await firstPage(win)
    const listQuery = { page: 1, size: 1, sort: 'title', direction: 'asc' } as const
    const list = (q: typeof listQuery) => win.evaluate((params) => (window as unknown as MeridianWindow).meridian
      .call('papers.list', params), q) as Promise<{ total: number }>

    const before = await list(listQuery)
    const row = win.locator('.ptable tbody tr').first()
    const title = await row.locator('.pt-title .ci').innerText()
    const rowx = row.locator('.rowx')
    const menu = win.locator('[role="menu"]')

    await row.locator('.stchip').click()
    await expect(menu).toHaveCount(1)
    const box = await rowx.boundingBox()
    if (!box) throw new Error('rowx 量不到位置')
    // Real pointer click, without going through the operability check of locator.click() - that layer of check will first confirm that the target can be
    // Hit, and here is precisely the test of "missing a hit, click through to the outer layer of the menu to close the menu" itself
    await win.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(menu).toHaveCount(0)

    await expect(row.locator('.pt-title .ci')).toHaveText(title)
    expect((await list(listQuery)).total).toBe(before.total)
  })
})

test('分组齿轮是真菜单:每行是 menuitemcheckbox,勾选跟着分组栏;点一行只切这一行,菜单不关', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const gear = win.locator('.filters .grpgear')
  await expect(gear).toHaveAttribute('aria-haspopup', 'menu')
  await gear.click()
  const items = win.locator('[role="menu"] [role="menuitemcheckbox"]')
  await expect(items).toHaveText(['主题', '项目', '状态'])
  await expect(items.filter({ hasText: '主题' })).toHaveAttribute('aria-checked', 'true')
  await expect(items.filter({ hasText: '状态' })).toHaveAttribute('aria-checked', 'true')

  await items.filter({ hasText: '主题' }).click()
  await expect(items.filter({ hasText: '主题' })).toHaveAttribute('aria-checked', 'false')
  await expect(win.locator('[role="menu"]')).toHaveCount(1)
  // The read-state field has its own dedicated filter button and never appears as a segmented-control grouping option.
  await expect(win.locator('.filters .segmented-control>button')).toHaveText(['无', '项目'])
})

// This use case must be run in the displayed window. This effect cannot be achieved in an off-screen window.
test.describe(() => {
  test.use({ showWindow: true })

  test('分组齿轮:平时点得动,别的菜单开着时点它只关那个菜单', async ({ win }) => {
    await gotoPapers(win)
    await firstPage(win)
    const gear = win.locator('.filters .grpgear')
    const menu = win.locator('[role="menu"]')

    // Normally you can move
    await gear.click()
    await expect(menu).toHaveCount(1)
    await win.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)

    // When other menus (reading state) are open, clicking the gear will only close that menu without popping up the group menu.
    await win.locator('.ptable tbody tr').first().locator('.stchip').click()
    await expect(menu).toHaveCount(1)
    const box = await gear.boundingBox()
    if (!box) throw new Error('gear 量不到位置')
    await win.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(menu).toHaveCount(0)
    await expect(gear).toHaveAttribute('data-state', 'closed')
  })
})

test('详情面板开着时 Esc 先关分组菜单,再按一次才收详情面板', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable tbody tr').first().locator('td.pt-title').click()
  await expect(win.locator('.pdetail')).toHaveCount(1)

  await win.locator('.filters .grpgear').click()
  await expect(win.locator('[role="menu"]')).toHaveCount(1)
  await win.keyboard.press('Escape')
  await expect(win.locator('[role="menu"]')).toHaveCount(0)
  await expect(win.locator('.pdetail')).toHaveCount(1)

  await win.keyboard.press('Escape')
  await expect(win.locator('.pdetail')).toHaveCount(0)
})

test('改类型:文本 → 单选,现有的不同值收成选项,格子画成选项 chip', async ({ win }) => {
  const ids = await seed(win, [{ key: 'note', label: '备注', type: 'text', options: [] }],
    [{ note: '精读' }, { note: '略读' }, { note: '精读' }])
  await gotoPapers(win)
  await firstPage(win)
  await retype(win, '备注', '单选')
  const cells = win.locator('.ptable tbody tr td.pt-cust')
  await expect(cells.nth(0).locator('.tagchip')).toHaveText('精读')
  await expect(cells.nth(1).locator('.tagchip')).toHaveText('略读')
  await expect(cells.nth(2).locator('.tagchip')).toHaveText('精读')
  await expect(win.locator('#banner span')).toHaveText('已改列类型 · 记入最近变动，可撤销')
  const column = (await call<PaperColumns>(win, 'papers.columns', {})).custom[0]!
  expect(column.type).toBe('select')
  // The options are collected according to the order of the papers in the library. The library order is different from the table order; the order is determined by core single test, which is better than the collection here.
  expect([...column.options].sort()).toEqual(['略读', '精读'].sort())
  expect(await cellsOf(win, ids)).toEqual([{ note: '精读' }, { note: '略读' }, { note: '精读' }])
})

test('改类型:文本 → 多选,每格包成一项', async ({ win }) => {
  const ids = await seed(win, [{ key: 'note', label: '备注', type: 'text', options: [] }],
    [{ note: '精读' }, { note: '略读' }])
  await gotoPapers(win)
  await firstPage(win)
  await retype(win, '备注', '多选')
  const cells = win.locator('.ptable tbody tr td.pt-cust')
  await expect(cells.nth(0).locator('.tagchip')).toHaveText(['精读'])
  await expect(cells.nth(1).locator('.tagchip')).toHaveText(['略读'])
  const column = (await call<PaperColumns>(win, 'papers.columns', {})).custom[0]!
  expect(column.type).toBe('multi')
  expect([...column.options].sort()).toEqual(['略读', '精读'].sort())
  expect(await cellsOf(win, ids)).toEqual([{ note: ['精读'] }, { note: ['略读'] }])
})

test('改类型:单选 → 多选,选项不动,每格包成一项', async ({ win }) => {
  const ids = await seed(win, [{ key: 'du-fa', label: '读法', type: 'select', options: ['精读', '略读'] }],
    [{ 'du-fa': '精读' }, { 'du-fa': '略读' }])
  await gotoPapers(win)
  await firstPage(win)
  await retype(win, '读法', '多选')
  const cells = win.locator('.ptable tbody tr td.pt-cust')
  await expect(cells.nth(0).locator('.tagchip')).toHaveText(['精读'])
  await expect(cells.nth(1).locator('.tagchip')).toHaveText(['略读'])
  expect((await call<PaperColumns>(win, 'papers.columns', {})).custom[0])
    .toEqual({ key: 'du-fa', label: '读法', type: 'multi', options: ['精读', '略读'] })
  expect(await cellsOf(win, ids)).toEqual([{ 'du-fa': ['精读'] }, { 'du-fa': ['略读'] }])
})

test('改类型:单选 → 文本,字留着、选项清空;正按它分组时当场退回「无」', async ({ win }) => {
  const ids = await seed(win, [{ key: 'du-fa', label: '读法', type: 'select', options: ['精读', '略读'] }],
    [{ 'du-fa': '精读' }, { 'du-fa': '略读' }], [...DEFAULT_PAPER_GROUPS, 'du-fa'])
  await gotoPapers(win)
  await firstPage(win)
  await shown(win, '.filters .segmented-control>button').filter({ hasText: '读法' }).click()
  await win.locator('.gxrow').first().click()
  await expect(shown(win, '.filters .segmented-control>button.on')).toHaveText('读法')

  await retype(win, '读法', '文本')
  await expect(shown(win, '.filters .segmented-control>button').filter({ hasText: '读法' })).toHaveCount(0)
  await expect(shown(win, '.filters .segmented-control>button.on')).toHaveText('无')
  await win.keyboard.press('Escape')
  await firstPage(win)
  const cells = win.locator('.ptable tbody tr td.pt-cust')
  await expect(cells.nth(0)).toHaveText('精读')
  await expect(cells.nth(1)).toHaveText('略读')
  await expect(cells.nth(0).locator('.tagchip')).toHaveCount(0)
  const columns = await call<PaperColumns>(win, 'papers.columns', {})
  expect(columns.custom[0]).toEqual({ key: 'du-fa', label: '读法', type: 'text', options: [] })
  expect(columns.groups).toEqual([...DEFAULT_PAPER_GROUPS])
  expect(await cellsOf(win, ids)).toEqual([{ 'du-fa': '精读' }, { 'du-fa': '略读' }])
})

test('改类型:多选 → 单选,只有一个值的直接转,空着的格子仍空着', async ({ win }) => {
  const ids = await seed(win, [{ key: 'tags', label: '标签', type: 'multi', options: ['综述', '必读'] }],
    [{ tags: ['综述'] }, { tags: [] }, { tags: ['必读'] }])
  await gotoPapers(win)
  await firstPage(win)
  await retype(win, '标签', '单选')
  const cells = win.locator('.ptable tbody tr td.pt-cust')
  await expect(cells.nth(0).locator('.tagchip')).toHaveText('综述')
  await expect(cells.nth(1).locator('.tagchip')).toHaveCount(0)
  await expect(cells.nth(2).locator('.tagchip')).toHaveText('必读')
  expect((await call<PaperColumns>(win, 'papers.columns', {})).custom[0])
    .toEqual({ key: 'tags', label: '标签', type: 'select', options: ['综述', '必读'] })
  expect(await cellsOf(win, ids)).toEqual([{ tags: '综述' }, {}, { tags: '必读' }])
})

test('改类型:多选 → 单选时有论文填着多个值,整次被拒,toast 说清几篇,列与格子都不变', async ({ win }) => {
  const ids = await seed(win, [{ key: 'tags', label: '标签', type: 'multi', options: ['综述', '必读'] }],
    [{ tags: ['综述', '必读'] }, { tags: ['综述', '必读'] }, { tags: ['综述'] }])
  await gotoPapers(win)
  await firstPage(win)
  await retype(win, '标签', '单选')
  await expect(win.locator('#toast')).toHaveText('列「标签」有 2 篇论文填着多个值,改不成单选列')
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  // Rejected: "Multiple Selection" is still selected in the type row, and the grid and core on the table remain the same.
  await expect(win.locator('[data-radix-popper-content-wrapper] .typerow .ctbtn[title="多选"]'))
    .toHaveAttribute('aria-checked', 'true')
  await expect(win.locator('.ptable tbody tr td.pt-cust').nth(0).locator('.tagchip')).toHaveText(['综述', '必读'])
  expect((await call<PaperColumns>(win, 'papers.columns', {})).custom[0]!.type).toBe('multi')
  expect(await cellsOf(win, ids)).toEqual([{ tags: ['综述', '必读'] }, { tags: ['综述', '必读'] }, { tags: ['综述'] }])
})

test('改类型:多选 → 文本,多个值用「, 」连成一段;撤销之后格子恢复原样', async ({ win }) => {
  test.slow()
  const ids = await seed(win, [{ key: 'tags', label: '标签', type: 'multi', options: ['综述', '必读'] }],
    [{ tags: ['综述', '必读'] }, { tags: ['必读'] }])
  await gotoPapers(win)
  await firstPage(win)
  await retype(win, '标签', '文本')
  const cells = win.locator('.ptable tbody tr td.pt-cust')
  await expect(cells.nth(0)).toHaveText('综述, 必读')
  await expect(cells.nth(1)).toHaveText('必读')
  expect(await cellsOf(win, ids)).toEqual([{ tags: '综述, 必读' }, { tags: '必读' }])
  const changes = await call<{ title: string }[]>(win, 'changelog.list', {})
  expect(changes[0]!.title).toBe('论文表 · 列「标签」的类型 多选 → 文本')

  await win.keyboard.press('Escape')
  await win.locator('[data-desk="changelog"]').click()
  await shown(win, '.crow').first().locator('.cundo').click()
  await gotoPapers(win)
  await expect(cells.nth(0).locator('.tagchip')).toHaveText(['综述', '必读'])
  await expect(cells.nth(1).locator('.tagchip')).toHaveText(['必读'])
  expect((await call<PaperColumns>(win, 'papers.columns', {})).custom[0])
    .toEqual({ key: 'tags', label: '标签', type: 'multi', options: ['综述', '必读'] })
  expect(await cellsOf(win, ids)).toEqual([{ tags: ['综述', '必读'] }, { tags: ['必读'] }])
})

test('改类型:没人填过的列,三档之间怎么换都照改', async ({ win }) => {
  await seed(win, [{ key: 'note', label: '备注', type: 'text', options: [] }], [])
  await gotoPapers(win)
  await firstPage(win)
  const typeOf = () => call<PaperColumns>(win, 'papers.columns', {}).then((c) => c.custom[0])
  await retype(win, '备注', '多选')
  await expect.poll(typeOf).toEqual({ key: 'note', label: '备注', type: 'multi', options: [] })
  await win.locator('[data-radix-popper-content-wrapper] .typerow .ctbtn[title="单选"]').click()
  await expect.poll(typeOf).toEqual({ key: 'note', label: '备注', type: 'select', options: [] })
  await win.locator('[data-radix-popper-content-wrapper] .typerow .ctbtn[title="文本"]').click()
  await expect.poll(typeOf).toEqual({ key: 'note', label: '备注', type: 'text', options: [] })
})

test('改类型:列菜单里只用键盘把文本列改成单选', async ({ win }) => {
  const ids = await seed(win, [{ key: 'note', label: '备注', type: 'text', options: [] }], [{ note: '精读' }])
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="列设置"]').click()
  const menu = win.locator('[data-radix-popper-content-wrapper]')

  // Once the menu is opened, the focus falls on the first tab-able button in the menu: there is no option fold button in the text column, and this one is "Change Type"
  await expect(menu.locator('.mi.colrow', { hasText: '备注' }).locator('[title="改类型"]')).toBeFocused()
  await win.keyboard.press('Enter')
  // Among the unfolded files, only the current one is in the Tab order; after "Change Type", there are Change Name Pen, Delete ×, and this file.
  await win.keyboard.press('Tab')
  await win.keyboard.press('Tab')
  await win.keyboard.press('Tab')
  const selectBtn = menu.locator('.typerow .ctbtn[title="单选"]')
  await expect(menu.locator('.typerow .ctbtn[title="文本"]')).toBeFocused()

  // Move the right arrow key to "Radio Choice" and select it: this column is changed to a radio choice column, the grid is drawn as an option chip, and the focus remains on "Radio Choice"
  await win.keyboard.press('ArrowRight')
  await expect(win.locator('.ptable tbody tr td.pt-cust').nth(0).locator('.tagchip')).toHaveText('精读')
  expect((await call<PaperColumns>(win, 'papers.columns', {})).custom[0])
    .toEqual({ key: 'note', label: '备注', type: 'select', options: ['精读'] })
  expect(await cellsOf(win, ids)).toEqual([{ note: '精读' }])
  await expect(selectBtn).toHaveAttribute('aria-checked', 'true')
  await expect(selectBtn).toBeFocused()
})

test('详情里点一项元数据,原位输入框没有边框、浅灰实底、没有外圈', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable tbody tr').first().locator('td.pt-title').click()
  await win.locator('.pdetail .metadata-editable[title="修改年份"]').click()

  const input = win.locator('.pdetail .metadata-input')
  await expect(input).toBeFocused()
  const style = await input.evaluate((el) => {
    // Resolve the field token next to the input so the comparison holds in either theme.
    const probe = document.createElement('span')
    probe.style.backgroundColor = 'var(--field)'
    el.parentElement!.append(probe)
    const field = getComputedStyle(probe).backgroundColor
    probe.remove()
    const s = getComputedStyle(el)
    return {
      borders: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth],
      field, background: s.backgroundColor, shadow: s.boxShadow, outline: s.outlineStyle,
    }
  })
  expect(style.borders).toEqual(['0px', '0px', '0px', '0px'])
  expect(style.background).toBe(style.field)
  expect(style.background).not.toBe('rgba(0, 0, 0, 0)')
  expect(style.shadow).toBe('none')
  expect(style.outline).toBe('none')
})
