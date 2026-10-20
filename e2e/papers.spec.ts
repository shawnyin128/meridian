import type { Page } from '@playwright/test'
import type { PaperCell, PaperColumns } from '../apps/desktop/src/shared/contract.js'
import {
  DEFAULT_PAPER_GROUPS, READ_STATES, READING_PAPER, UNREAD_PAPER,
} from '../apps/desktop/src/shared/vocabulary.js'
import { expect, gotoPapers, parkPointer, settle, test, uniqueHeights, type MeridianWindow } from './app.js'

/** Page state of all 291 paper pages in the fixture vault, a field separate from reading status. */
const PAGE_STATE = 'draft'

/** Rows the topic group index shows once the "attention" filter has taken effect. */
const TOPICS_UNDER_FILTER = 56
const TOPIC = 'transformer architecture'

/** A topic the write-path tests add to the first row; no paper in the fixture has it. */
const ADDED_TOPIC = 'kv cache 压缩'

/** A multiple-choice column the tests create, and two options created back to back in one cell. */
const MULTI_COLUMN = '标签'
const PICKED = ['综述', '必读'] as const

/** Papers in the fixture, pages at 20 per page, and papers left after filtering by "attention". */
const PAPERS_TOTAL = 291
const PAPER_PAGES = 15
const PAPERS_UNDER_FILTER = 44

/** Left edge, rounded to two decimals, of the first page-size option on the pagination bar. */
const sizeButtonLeft = (win: Page) => win.locator('.pagebar .segmented-control>button').first()
  .evaluate((el) => +el.getBoundingClientRect().left.toFixed(2))

/** Visited screens stay mounted; scope selectors every screen has (e.g. its header) to the shown one. */
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

/** Calls Core directly by contract method name, bypassing the UI. */
const call = <T>(win: Page, method: string, params: unknown) => win.evaluate(
  ([m, p]) => (window as unknown as MeridianWindow).meridian.call(m as string, p) as Promise<T>,
  [method, params] as const,
)

/** Waits until the first page renders all 20 rows, so later measurements run on a populated table. */
const firstPage = (win: Page) => expect(win.locator('.ptable tbody tr')).toHaveCount(20)

/**
 * Writes the column configuration through Core, then fills `cells[i]` into the i-th paper by date
 * added, the table's default sort, and returns those papers' ids. The papers screen mounts and
 * fetches only on its first visit, so call this before gotoPapers.
 */
async function seed(
  win: Page, custom: PaperColumns['custom'], cells: Record<string, PaperCell | null>[],
  groups: string[] = [...DEFAULT_PAPER_GROUPS],
): Promise<string[]> {
  // Once the sidebar is drawn, preload and contract calls are ready.
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

/** Opens Column settings, expands column `label`'s type row and picks `type`; the menu stays open. */
async function retype(win: Page, label: string, type: '文本' | '单选' | '多选'): Promise<void> {
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="列设置"]').click()
  const row = win.locator('[data-radix-popper-content-wrapper] .mi.colrow', { hasText: label })
  await row.hover()
  await row.locator('[aria-label="改类型"]').click()
  await win.locator(`[data-radix-popper-content-wrapper] .typerow .ctbtn[aria-label="${type}"]`).click()
}

/** Fetches the current custom cells of the given papers through Core. */
const cellsOf = (win: Page, ids: string[]) => Promise.all(ids.map((id) =>
  call<{ custom: Record<string, unknown> }>(win, 'papers.get', { id }).then((r) => r.custom)))

test('论文表每一行等高,行高是 38px', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  expect(await uniqueHeights(win.locator('.ptable tbody tr'))).toEqual([38])
})

/** Index on the current page of the first row whose title cell is truncated. */
const truncatedTitleRow = (win: Page) => win.locator('.ptable tbody tr')
  .evaluateAll((rows) => rows.findIndex((tr) => tr.querySelector('td.pt-title.trunc') !== null))

test('论文表每一格的内容都在行内垂直居中,悬停展开截断的标题时文字不动', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await parkPointer(win)
  const index = await truncatedTitleRow(win)
  expect(index).toBeGreaterThanOrEqual(0)
  const row = win.locator('.ptable tbody tr').nth(index)

  // Each non-empty cell: its content's vertical centre minus the centre of the cell's padding box.
  // The rating stars sit on the text baseline of a centred line, about 1.2px above their box's centre;
  // top-aligned content is more than 2px above.
  const offsets = await row.locator('td').evaluateAll((tds) => tds.flatMap((td) => {
    const content = td.firstElementChild?.getBoundingClientRect()
    if (content === undefined || content.height === 0) return []
    const middle = td.getBoundingClientRect().top + td.clientTop + td.clientHeight / 2
    return [+((content.top + content.bottom) / 2 - middle).toFixed(2)]
  }))
  console.log(`各格内容中线偏离格子中线 ${offsets.join(', ')}px`)
  expect(offsets.length).toBeGreaterThan(5)
  for (const offset of offsets) expect(Math.abs(offset)).toBeLessThanOrEqual(1.5)

  const title = row.locator('td.pt-title')
  const textTop = () => title.evaluate((td) => {
    const range = document.createRange()
    range.selectNodeContents(td.querySelector('.ci')!)
    return range.getBoundingClientRect().top
  })
  const resting = await textTop()
  await title.hover()
  expect(Math.abs(await textTop() - resting)).toBeLessThanOrEqual(0.5)
})

/** Authors far wider than their column; no paper in the fixture has authors. */
const LONG_AUTHORS = ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit', 'Llion Jones', 'Aidan N. Gomez'] as const
/** A custom text value far wider than its column. */
const LONG_NOTE = '先读第三节的消融实验，再对照附录里的超参数表核一遍复现脚本'

test('悬停截断的作者格与自定义文本格,浮框比格子宽,压到邻格上的那段字也看得见', async ({ win }) => {
  // The papers screen fetches only on its first visit, so the values are written before it opens.
  await win.locator('[data-desk="papers"]').waitFor()
  // The note column comes first, so the columns its box covers are inside the viewport.
  await call(win, 'papers.setColumns', {
    columns: {
      hidden: [], custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
      groups: [...DEFAULT_PAPER_GROUPS], order: ['note'],
    },
  })
  const id = await call<{ rows: { id: string }[] }>(
    win, 'papers.list', { page: 1, size: 1, sort: 'addedAt', direction: 'desc' },
  ).then((r) => r.rows[0]!.id)
  await call(win, 'papers.update', { id, patch: { authors: LONG_AUTHORS, custom: { note: LONG_NOTE } } })
  await gotoPapers(win)
  await firstPage(win)
  const row = win.locator('.ptable tbody tr').first()

  for (const [name, cell] of [
    ['作者', row.locator('td.pt-dim', { hasText: LONG_AUTHORS[0] })],
    ['备注', row.locator('td.pt-cust')],
  ] as const) {
    await parkPointer(win)
    await expect(cell).toHaveClass(/\btrunc\b/)
    await cell.hover()
    const reveal = await cell.evaluate((td) => {
      const box = td.querySelector('.ci')!
      const edge = td.getBoundingClientRect().right
      const rect = box.getBoundingClientRect()
      // A point just past the cell's right edge hits the box only when the cell does not clip it.
      const hit = document.elementFromPoint(edge + 12, (rect.top + rect.bottom) / 2)
      return {
        overhangs: rect.right - edge > 12,
        whole: box.scrollWidth <= box.clientWidth,
        visible: hit !== null && box.contains(hit),
      }
    })
    expect(reveal, name).toEqual({ overhangs: true, whole: true, visible: true })
  }
})

test('导入 PDF 是屏头右端的页级操作,工具栏只放视图切换', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)

  await expect(win.locator('.screenslot:not([hidden]) .desk-head .page-actions .pdfupload')).toHaveCount(1)
  await expect(win.locator('.screenslot:not([hidden]) .paper-view-toolbar .pdfupload')).toHaveCount(0)
  await expect(win.locator('.screenslot:not([hidden]) .paper-view-toolbar .segmented-control>button')).toHaveCount(2)
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
  await win.getByRole('radio', { name: '研究地图', exact: true }).click()

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

  // Read Later's write bumps the revision while the papers screen is hidden, where widths measure 0.
  await win.locator('#rowLater').click()
  await shown(win, '.pcard').first().locator('[aria-label="移出"]').click()
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

  await expect(win.locator('.gnav button[aria-label="分组取值"]')).toHaveText(`${TOPIC} · ${indexCount}`)
  await expect(win.locator('.pginfo')).toHaveText(`共 ${indexCount} 条`)
})

test('表内给论文加一个主题后,重新取数确认这一行的主题真的变了', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const row = win.locator('.ptable tbody tr').first()
  const title = await row.locator('.pt-title .ci').innerText()
  const chips = row.locator('td:nth-child(7) .tagchip:not(.tagadd)')
  const before = await chips.allTextContents()

  // The + in a topic cell stays hidden until its row is hovered.
  await row.locator('td:nth-child(7)').hover()
  await row.locator('td:nth-child(7) .tagadd').click()
  await win.locator('.tagin').fill(ADDED_TOPIC)
  await win.locator('.tagin').press('Enter')
  await expect(chips).toHaveText([...before, ADDED_TOPIC])
  await expect(win.locator('.tagin')).toHaveCount(0)

  // The table refetches by itself when the revision bumps; refetching through Core here proves
  // papers.update wrote the change, not just an optimistic local state.
  const refetchedTopics = await win.evaluate(async (t) => {
    const result = await (window as unknown as MeridianWindow).meridian
      .call('papers.list', { page: 1, size: 1, sort: 'title', direction: 'asc', filter: t }) as {
        rows: { topics: string[] }[]
      }
    return result.rows[0]?.topics
  }, title)
  expect(refetchedTopics).toEqual([...before, ADDED_TOPIC])
})

test('阅读状态列点它选一档就写回 core,页面状态不受影响', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const row = win.locator('.ptable tbody tr').first()
  const title = await row.locator('.pt-title .ci').innerText()
  const chip = row.locator('.stchip')

  // The vault's paper pages store no reading status, so Core reports them as unread; this column
  // never shows the page state, which tracks how far the Wiki page is compiled.
  await expect(chip).toHaveText(UNREAD_PAPER)
  await expect(chip).not.toHaveText(PAGE_STATE)

  await chip.click()
  // Clicking the chip only opens the status menu; it is not a row click that opens the details panel.
  await expect(win.locator('.ctxmenu .mi')).toHaveText([...READ_STATES])
  await expect(win.locator('.pdetail')).toHaveCount(0)

  await win.locator('.ctxmenu .mi', { hasText: READING_PAPER }).click()
  await expect(chip).toHaveText(READING_PAPER)

  // The table refetches by itself when the revision bumps; refetching through Core here proves
  // papers.update wrote the change, not just an optimistic local state.
  const refetched = await win.evaluate(async (t) => {
    const result = await (window as unknown as MeridianWindow).meridian
      .call('papers.list', { page: 1, size: 1, sort: 'title', direction: 'asc', filter: t }) as {
        rows: { readState: string; pageState: string }[]
      }
    return result.rows[0]
  }, title)
  console.log(`改过之后重新取数:${JSON.stringify(refetched)}`)
  expect(refetched?.readState).toBe(READING_PAPER)
  // The two are stored separately: changing the reading status leaves the page state untouched.
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
  // The popover consumed Escape: the details panel did not open and the table is unchanged.
  await expect(win.locator('.pdetail')).toHaveCount(0)
  await expect(win.locator('.ptable tbody tr')).toHaveCount(20)

  await cell.hover()
  await add.click()
  await expect(win.locator('.tagin')).toHaveValue('')
})

test('标签添加框:写被拒时输入框与打好的字都留着', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  // The table sorts by date added by default, so the first paper listed that way is its first row.
  const first = await call<{ rows: { id: string }[] }>(
    win, 'papers.list', { page: 1, size: 1, sort: 'addedAt', direction: 'desc' },
  ).then((r) => r.rows[0]!)
  const cell = win.locator('.ptable tbody tr').first().locator('td:nth-child(7)')
  const input = win.locator('.tagin')

  await cell.hover()
  await cell.locator('.tagadd').click()
  await input.fill(ADDED_TOPIC)
  // Delete the paper through Core first: its row stays, and the write that Enter sends is rejected.
  await call(win, 'papers.delete', { id: first.id })
  await input.press('Enter')

  await expect(win.locator('#notice[data-tone="refusal"] .notice-text')).toHaveText('这一项已不存在')
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  await expect(input).toHaveCount(1)
  await expect(input).toHaveValue(ADDED_TOPIC)
})

test('标签添加框:点联想项写被拒时,候选层与打开的占位都留着', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  // The table sorts by date added by default, so the first paper listed that way is its first row.
  const first = await call<{ rows: { id: string }[] }>(
    win, 'papers.list', { page: 1, size: 1, sort: 'addedAt', direction: 'desc' },
  ).then((r) => r.rows[0]!)
  const cell = win.locator('.ptable tbody tr').first().locator('td:nth-child(7)')
  const input = win.locator('.tagin')
  const hit = win.locator('.pickhits .rrow').first()

  await cell.hover()
  await cell.locator('.tagadd').click()
  // Before typing, the list suggests every vault topic the paper lacks; the test adds the first.
  await expect(hit).toHaveCount(1)
  const picked = await hit.innerText()
  // Delete the paper through Core first: its row stays, and the write the click sends is rejected.
  await call(win, 'papers.delete', { id: first.id })
  await hit.click()

  await expect(win.locator('#notice[data-tone="refusal"] .notice-text')).toHaveText('这一项已不存在')
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  await expect(input).toHaveCount(1)
  await expect(hit).toHaveText(picked)
})

test('标签添加框:提交在路上时点外,写落地前候选层与占位都不收', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  // The table sorts by date added by default, so the first paper listed that way is its first row.
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
  // Typing the suggestion's full text filters the list again; it is still there and still first.
  await input.fill(picked)
  await expect(hit).toHaveText(picked)
  // Delete the paper through Core first: its row stays, and the write the click sends is rejected.
  await call(win, 'papers.delete', { id: first.id })

  // In one task, click the suggestion to submit, then pointerdown/mousedown/click outside the box.
  // papers.update crosses IPC and cannot settle within the task, so these land while it is in flight.
  await win.evaluate(() => {
    document.querySelector<HTMLElement>('.pickhits .rrow')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const outside = document.querySelector<HTMLElement>('#libq')!
    for (const type of ['pointerdown', 'mousedown', 'click']) {
      outside.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 }))
    }
  })

  await expect(win.locator('#notice[data-tone="refusal"] .notice-text')).toHaveText('这一项已不存在')
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  await expect(input).toHaveCount(1)
  await expect(input).toHaveValue(picked)
  await expect(hit).toHaveCount(1)
})

test('标签添加框:回车提交在路上时点外,写落地前占位、打的字与候选层都不收', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  // The table sorts by date added by default, so the first paper listed that way is its first row.
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
  // Delete the paper through Core first: its row stays, and the write that Enter sends is rejected.
  await call(win, 'papers.delete', { id: first.id })

  // In one task, press Enter to submit, then pointerdown/mousedown/click outside the box.
  // papers.update crosses IPC and cannot settle within the task, so these land while it is in flight.
  await win.evaluate(() => {
    document.querySelector<HTMLElement>('.tagin')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const outside = document.querySelector<HTMLElement>('#libq')!
    for (const type of ['pointerdown', 'mousedown', 'click']) {
      outside.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 }))
    }
  })

  await expect(win.locator('#notice[data-tone="refusal"] .notice-text')).toHaveText('这一项已不存在')
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  await expect(input).toHaveCount(1)
  await expect(input).toHaveValue(ADDED_TOPIC)
  await expect(newRow).toHaveCount(1)
})

test('标签添加框:空着焦点移走只收起;打了新主题再移走,像回车一样加上', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const cell = win.locator('.ptable tbody tr').first().locator('td:nth-child(7)')
  const chips = cell.locator('.tagchip:not(.tagadd)')
  const before = await chips.allTextContents()
  const input = win.locator('.tagin')

  await cell.hover()
  await cell.locator('.tagadd').click()
  await input.press('Tab')
  await expect(input).toHaveCount(0)
  await expect(chips).toHaveText(before)

  await cell.hover()
  await cell.locator('.tagadd').click()
  // No vault topic contains this text, so no candidate is highlighted and the typed text is added.
  await input.fill('焦点移走就加上的主题')
  await input.press('Tab')
  await expect(input).toHaveCount(0)
  await expect(chips).toHaveText([...before, '焦点移走就加上的主题'])
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

test('文本格:改完焦点移走或点到格外都像回车一样写,Esc 才放弃', async ({ win }) => {
  // Creates a column, then makes three edits each checked in Core; an offscreen window waits two
  // seconds per actionability check, so the default 30 s is too short.
  test.slow()
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('备注')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  // The placeholder goes only once the column write lands; until then every body row has an extra
  // pt-cust cell, and afterwards exactly one.
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(0)

  const cell = win.locator('.ptable tbody tr').first().locator('td.pt-cust')
  const input = cell.locator('input.celledit')
  // The table sorts by date added by default, so the first paper listed that way is its first row.
  const saved = () => call<{ rows: { custom: Record<string, unknown> }[] }>(
    win, 'papers.list', { page: 1, size: 1, sort: 'addedAt', direction: 'desc' },
  ).then((r) => Object.values(r.rows[0]!.custom))

  // Moving focus out with the keyboard writes the typed text.
  await cell.click()
  await input.fill('焦点移走就写')
  await input.press('Tab')
  await expect(input).toHaveCount(0)
  await expect(cell).toHaveText('焦点移走就写')
  expect(await saved()).toEqual(['焦点移走就写'])

  // Clicking outside the cell writes it too.
  await cell.click()
  await input.fill('点外面也写')
  await shown(win, '.desk-head .t').click()
  await expect(input).toHaveCount(0)
  await expect(cell).toHaveText('点外面也写')
  expect(await saved()).toEqual(['点外面也写'])

  await cell.click()
  await input.fill('Esc 不写')
  await input.press('Escape')
  await expect(input).toHaveCount(0)
  await expect(cell).toHaveText('点外面也写')
  expect(await saved()).toEqual(['点外面也写'])
})

test('文本格开着时按住表格自己的滚动条,不算点到格外:格子与字都还在', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('滚动条备注')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(0)

  const cell = win.locator('.ptable tbody tr').first().locator('td.pt-cust')
  const input = cell.locator('input.celledit')
  await cell.click()
  await input.fill('按滚动条也不丢')

  const wrap = win.locator('.tblwrap')
  const box = (await wrap.boundingBox())!
  // The bottom 5px of .tblwrap is the horizontal scrollbar track; no body row reaches this y.
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
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('竖向滚动条备注')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(0)

  // At 50 per page the body is far taller than the viewport, so .tblwrap really scrolls vertically
  // and the check is not vacuous.
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
  // The rightmost 5px of .tblwrap is the vertical scrollbar track; no body column reaches this x.
  await win.mouse.move(box.x + box.width - 5, box.y + box.height / 2)
  await win.mouse.down()
  await win.mouse.up()

  await expect(input).toHaveCount(1)
  await expect(input).toHaveValue('按竖滚动条也不丢')
})

test('列管理:内置列显隐持久到离开再回来,固定列藏不了;自定义列新建、填格、撤销、改名、删除', async ({ win }) => {
  // One test creates a column, fills a cell, undoes, renames and deletes; an offscreen window waits
  // two seconds per actionability check, so the default 30 s is too short.
  test.slow()
  await gotoPapers(win)
  await firstPage(win)
  const head = () => win.locator('.ptable thead th').allTextContents()
  // A fresh vault shows every built-in column.
  await expect.poll(head).toContain('主题')
  // The header ends in two buttons: + adds a column (no circle in its icon) and the gear opens
  // Column settings (one circle, the gear's hub).
  await expect(win.locator('.ptable thead [aria-label="列设置"] svg circle')).toHaveCount(1)
  await expect(win.locator('.ptable thead [aria-label="新建列"] svg circle')).toHaveCount(0)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="列设置"]').click()
  const menu = win.locator('[data-radix-popper-content-wrapper] .mi.colrow')
  await menu.filter({ hasText: '主题' }).click()
  await expect.poll(head).not.toContain('主题')
  await expect(menu.filter({ hasText: '年份' })).toHaveClass(/locked/)
  await win.keyboard.press('Escape')
  await win.locator('[data-desk="wiki"]').click()
  await gotoPapers(win)
  await expect.poll(head).not.toContain('主题')
  // The papers screen stays mounted, so on return it may just show the state it held; the column
  // configuration persisted only if Core has it, with Topics as the one hidden column.
  expect((await call<{ hidden: string[] }>(win, 'papers.columns', {})).hidden).toEqual(['topics'])

  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(1)
  // The type popover opens with the placeholder while focus stays in the column name input; the new
  // header sits at the table's right end, and the popover must still fit inside the window.
  await expect(win.locator('[data-radix-popper-content-wrapper] .ctbtn')).toHaveCount(3)
  await expect(win.locator('.ptable thead th.th-new input')).toBeFocused()
  const layer = (await win.locator('[data-radix-popper-content-wrapper] .ctxmenu').boundingBox())!
  const vw = await win.evaluate(() => window.innerWidth)
  expect(layer.x).toBeGreaterThanOrEqual(0)
  expect(layer.x + layer.width).toBeLessThanOrEqual(vw)
  await win.locator('.ptable thead th.th-new input').fill('备注')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  await expect.poll(head).toContain('备注')
  // Creating the column removes the placeholder and type popover together, with no frame of overlap.
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

  // The table sorts by date added by default, so the first paper listed that way is its first row.
  const rows = await call<{ rows: { title: string; custom: Record<string, string> }[] }>(
    win, 'papers.list', { page: 1, size: 1, sort: 'addedAt', direction: 'desc' },
  ).then((r) => r.rows)
  expect(rows[0]!.title).toBe(title)
  expect(Object.values(rows[0]!.custom)).toEqual(['读到一半'])

  const changes = await call<{ id: string; title: string }[]>(win, 'changelog.list', {})
  expect(changes[0]!.title).toContain('改了字段')
  // Undo the real way, on Recent Changes: it bumps the vault revision and the paper table refetches.
  await win.locator('[data-desk="changelog"]').click()
  await shown(win, '.crow').first().locator('.cundo').click()
  await gotoPapers(win)
  await expect(first.locator('td.pt-cust')).toHaveText('')

  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="列设置"]').click()
  await menu.filter({ hasText: '备注' }).hover()
  await menu.filter({ hasText: '备注' }).locator('[aria-label="重命名列"]').click()
  await win.locator('[data-radix-popper-content-wrapper] input.celledit').fill('批注')
  await win.locator('[data-radix-popper-content-wrapper] input.celledit').press('Enter')
  await expect.poll(head).toContain('批注')
  await menu.filter({ hasText: '批注' }).hover()
  await menu.filter({ hasText: '批注' }).locator('.cmx.danger').click()
  await expect.poll(head).not.toContain('批注')
})

test('多选格:连着提交两次都留得住,点输入框本身不关弹层', async ({ win }) => {
  // Creates a column and writes one cell twice in a row; an offscreen window waits two seconds per
  // actionability check, so the default 30 s is too short.
  test.slow()
  await gotoPapers(win)
  await firstPage(win)
  const pop = win.locator('[data-radix-popper-content-wrapper]')

  // Multiple choice, because only then can one cell keep two values submitted back to back.
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await pop.locator('.ctbtn[aria-label="多选"]').click()
  await win.locator('.ptable thead th.th-new input').fill(MULTI_COLUMN)
  await win.locator('.ptable thead th.th-new input').press('Enter')
  await expect.poll(() => win.locator('.ptable thead th').allTextContents()).toContain(MULTI_COLUMN)

  const cell = win.locator('.ptable tbody tr').first().locator('td.pt-cust').first()
  const input = cell.locator('input.celledit')
  await cell.click()
  await input.fill(PICKED[0])
  await expect(pop.locator('.rrow.mk')).toHaveCount(1)
  // The input anchors the popover but is outside it, and clicking it must not count as an outside
  // click, for both buttons: Radix defers left-click dismissal to the click event but dismisses a
  // right-click at once, so the input swallowing its own click cannot stop it.
  for (const button of ['left', 'right'] as const) {
    await input.click({ button })
    await expect(pop).toHaveCount(1)
    await expect(input).toHaveValue(PICKED[0])
  }

  // No wait between the two submissions: the first write has not returned, so the column
  // configuration and cell value the UI holds are still the old ones.
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
  // One test creates a column, fills two cells, groups, renames, undoes and deletes; an offscreen
  // window waits two seconds per actionability check.
  test.slow()
  await gotoPapers(win)
  await firstPage(win)
  const head = () => win.locator('.ptable thead th').allTextContents()
  const menu = win.locator('[data-radix-popper-content-wrapper] .mi.colrow')

  // Create a single-choice column: the + at the header's end opens a placeholder; pick the type in
  // the popover below it first, then type the name and press Enter.
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await win.locator('[data-radix-popper-content-wrapper] .ctbtn[aria-label="单选"]').click()
  await expect(win.locator('[data-radix-popper-content-wrapper] .ctbtn[aria-label="单选"]')).toHaveClass(/on/)
  await win.locator('.ptable thead th.th-new input').fill('读法')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  await expect.poll(head).toContain('读法')
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已新建列 · 全库可用')
  expect((await call<{ custom: { label: string; type: string }[] }>(win, 'papers.columns', {}))
    .custom[0]).toMatchObject({ label: '读法', type: 'select' })

  // Create one option from each of two cells.
  const rows = win.locator('.ptable tbody tr')
  for (const [at, value] of [[0, '精读'], [1, '略读']] as const) {
    await rows.nth(at).locator('td.pt-cust').click()
    await rows.nth(at).locator('td.pt-cust input.celledit').fill(value)
    await win.locator('[data-radix-popper-content-wrapper] .rrow.mk').click()
    await expect(rows.nth(at).locator('td.pt-cust .tagchip')).toHaveText(value)
  }
  expect((await call<{ custom: { options: string[] }[] }>(win, 'papers.columns', {}))
    .custom[0]!.options).toEqual(['精读', '略读'])

  // Checking the column in the group gear adds a button to the grouping bar; selecting it groups
  // only the two papers that have a value.
  await win.locator('.filters .grpgear').click()
  await win.locator('[data-radix-popper-content-wrapper] .mi', { hasText: '读法' }).click()
  await win.keyboard.press('Escape')
  await win.locator('.filters .segmented-control>button', { hasText: '读法' }).click()
  await expect(win.locator('.gxrow')).toHaveCount(2)
  await expect(win.locator('.gxrow .n')).toHaveText(['1', '1'])

  // Unchecking it in the gear while grouping by it removes its button, and grouping falls back to
  // "None" at once.
  await win.locator('.filters .grpgear').click()
  await win.locator('[data-radix-popper-content-wrapper] .mi', { hasText: '读法' }).click()
  await win.keyboard.press('Escape')
  await expect(win.locator('.filters .segmented-control>button', { hasText: '读法' })).toHaveCount(0)
  await expect(win.locator('.filters .segmented-control>button[aria-checked="true"]')).toHaveText('无')

  // Rename an option: the cell follows, and refetching through Core rules out an optimistic state.
  await firstPage(win)
  const title = await rows.first().locator('td.pt-title').innerText()
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="列设置"]').click()
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

  // Undo: the paper's cell and the column options both revert.
  await win.locator('[data-desk="changelog"]').click()
  await shown(win, '.crow').first().locator('.cundo').click()
  await gotoPapers(win)
  await expect(rows.first().locator('td.pt-cust .tagchip')).toHaveText('精读')
  expect((await call<{ custom: { options: string[] }[] }>(win, 'papers.columns', {}))
    .custom[0]!.options).toEqual(['精读', '略读'])

  // An option a paper still uses cannot be deleted: the refusal notice names the reason and the header
  // is unchanged.
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="列设置"]').click()
  await menu.filter({ hasText: '读法' }).locator('.cmx.optx').click()
  const still = win.locator('[data-radix-popper-content-wrapper] .mi.optrow', { hasText: '略读' })
  await still.hover()
  await still.locator('.cmx.danger').click()
  await expect(win.locator('#notice[data-tone="refusal"] .notice-text')).toHaveText('还有内容在用')
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  await expect.poll(head).toContain('读法')

  // Delete the column while grouping by it: its header and grouping-bar button go, and grouping
  // falls back to "None" at once.
  await win.keyboard.press('Escape')
  await win.locator('.filters .grpgear').click()
  await win.locator('[data-radix-popper-content-wrapper] .mi', { hasText: '读法' }).click()
  await win.keyboard.press('Escape')
  await shown(win, '.filters .segmented-control>button').filter({ hasText: '读法' }).click()
  await win.locator('.gxrow').first().click()
  await expect(shown(win, '.filters .segmented-control>button[aria-checked="true"]')).toHaveText('读法')

  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="列设置"]').click()
  await menu.filter({ hasText: '读法' }).hover()
  await menu.filter({ hasText: '读法' }).locator('.cmx.danger').click()
  await expect(shown(win, '.filters .segmented-control>button').filter({ hasText: '读法' })).toHaveCount(0)
  await expect(shown(win, '.filters .segmented-control>button[aria-checked="true"]')).toHaveText('无')
  await expect.poll(head).not.toContain('读法')
  // Had the column been deleted without leaving the groups, Core would reject the write and the
  // column would return; the assertions above see only the optimistic state.
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
  // Page 1 has one ellipsis, page 4 one on each side and the last page one again, so the three
  // pagers differ in length.
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
    // Measure the count text, not the .pginfo box: a stretched box starts at the left edge even
    // when its text does not, so only the text shows whether the count the user sees is flush left.
    const count = document.createRange()
    count.selectNodeContents(bar.querySelector('.pginfo')!)
    const seg = bar.querySelector('.segmented-control')!.getBoundingClientRect()
    const tail = bar.querySelector('.pager')!.lastElementChild!.getBoundingClientRect()
    // Children of one line share a vertical center up to layout rounding, which can straddle a half
    // pixel; a wrapped child sits a whole line lower.
    const centers = [...bar.children].map((c) => {
      const r = c.getBoundingClientRect()
      return r.top + r.height / 2
    })
    return {
      countInset: +(count.getBoundingClientRect().left - bx.left).toFixed(2),
      segInset: +(bx.right - seg.right).toFixed(2),
      pageToSeg: +(seg.left - tail.right).toFixed(2),
      gap: parseFloat(getComputedStyle(bar).columnGap),
      centerSpread: Math.max(...centers) - Math.min(...centers),
    }
  })

  console.log(`分页条版式:条数离左缘 ${laid.countInset}px,每页档位离右缘 ${laid.segInset}px,`
    + `页码条末端与每页档位相距 ${laid.pageToSeg}px(分页条的 gap 是 ${laid.gap}px)`)
  expect(laid.centerSpread, '分页条已经换行,量到的不是同一行上的版式').toBeLessThan(1)
  expect(laid.countInset).toBe(0)
  expect(laid.segInset).toBe(0)
  expect(laid.pageToSeg).toBe(laid.gap)
})

test('年份与发表分两列:年份只写年份、仍按它排序,发表只写出处、紧跟年份、可隐藏;详情里两行各写各的,详情开着时表只剩标题、作者与年份', async ({ win }) => {
  // Two sorts, one hide and opening details; an offscreen window waits two seconds per
  // actionability check, so the default 30 s is too short.
  test.slow()
  await gotoPapers(win)
  await firstPage(win)
  // Header cells draw a sort arrow beside the label, which leaves a leading space; trim to the label.
  const head = async () => (await win.locator('.ptable thead th').allTextContents()).map((t) => t.trim())
  // After Title come Short title, Rating, Authors, Year, Venue, Topics and Status.
  expect((await head()).slice(0, 8)).toEqual(['标题', '短标题', '评分', '作者', '年份', '发表', '主题', '阅读状态'])
  const listed = (direction: 'asc' | 'desc') => call<{ rows: { year?: number; venue: string }[] }>(
    win, 'papers.list', { page: 1, size: 20, sort: 'year', direction },
  ).then((r) => r.rows)
  const rows = win.locator('.ptable tbody tr')
  // The table sorts by date added by default, not year: click the year header once to make it the sort column, which defaults to descending.
  await win.locator('.ptable thead th[data-k="year"]').click()
  const desc = await listed('desc')
  await expect(rows.locator('td:nth-child(5)')).toHaveText(desc.map((p) => String(p.year ?? '')))
  await expect(rows.locator('td:nth-child(6)')).toHaveText(desc.map((p) => p.venue))

  // Year is still the sort column: a second click switches to ascending, and both columns follow.
  await win.locator('.ptable thead th[data-k="year"]').click()
  const asc = await listed('asc')
  await expect(rows.locator('td:nth-child(5)')).toHaveText(asc.map((p) => String(p.year ?? '')))
  await expect(rows.locator('td:nth-child(6)')).toHaveText(asc.map((p) => p.venue))

  // Venue is not a locked column, so it can be hidden; Core stores it as venue.
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="列设置"]').click()
  const menu = win.locator('[data-radix-popper-content-wrapper] .mi.colrow')
  await expect(menu.filter({ hasText: '年份' })).toHaveClass(/locked/)
  await expect(menu.filter({ hasText: '发表' })).not.toHaveClass(/locked/)
  await menu.filter({ hasText: '发表' }).click()
  await expect.poll(head).not.toContain('发表')
  // A fresh vault shows every built-in column, so Venue is the only hidden one.
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
  await win.locator('.ptable thead [aria-label="列设置"]').click()
  const menu = win.locator('[data-radix-popper-content-wrapper]')
  // The menu is really open, so the two checks below cannot pass merely because it is closed.
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
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(1)
  // The placeholder column also adds an empty cell to every body row, keeping the cell count right.
  expect(await cells()).toBe(before + 1)
  await parkPointer(win)
  expect(await uniqueHeights(win.locator('.ptable tbody tr'))).toEqual([38])
  const wide = await sharedContentGeometry(win, '.libwide')
  expect(wide.width).toBe(wide.expectedWidth)
  // Escape removes the whole placeholder column.
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
  await expect(win.locator('.ptable thead [aria-label="新建列"]')).toBeEnabled()
  await win.keyboard.press('Escape')
  await expect(win.locator('.pdetail')).toHaveCount(0)
  await expect(detailSlot).toHaveAttribute('data-panel-state', 'closed')
  // Closing the details opens no popover; an add-column popover opened while the details were open
  // would show up now.
  await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(0)
})

test('建列被 core 拒绝:占位格与打好的列名都留着,改了再回车才建出来', async ({ win }) => {
  // Creates a column, fills two values, deletes the column and creates two more; an offscreen
  // window waits two seconds per actionability check, so the default 30 s is too short.
  test.slow()
  await gotoPapers(win)
  await firstPage(win)
  const head = () => win.locator('.ptable thead th').allTextContents()
  const pop = win.locator('[data-radix-popper-content-wrapper]')
  const newHead = win.locator('.ptable thead th.th-new')
  const newInput = newHead.locator('input')

  // Leave two values in a multiple-choice column on the first row, then delete the column: the
  // column is gone but the values stay on the paper.
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await pop.locator('.ctbtn[aria-label="多选"]').click()
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
  await win.locator('.ptable thead [aria-label="列设置"]').click()
  const menu = pop.locator('.mi.colrow')
  await menu.filter({ hasText: MULTI_COLUMN }).hover()
  await menu.filter({ hasText: MULTI_COLUMN }).locator('.cmx.danger').click()
  await expect.poll(head).not.toContain(MULTI_COLUMN)
  await win.keyboard.press('Escape')
  // The table sorts by date added by default, so the first paper listed that way is its first row.
  const first = await call<{ rows: { custom: Record<string, unknown> }[] }>(
    win, 'papers.list', { page: 1, size: 1, sort: 'addedAt', direction: 'desc' },
  ).then((r) => r.rows[0]!)
  expect(Object.values(first.custom)).toEqual([PICKED])
  expect((await call<PaperColumns>(win, 'papers.columns', {})).custom).toEqual([])

  // This Chinese column name folds to the same key again, and Core rejects the column because a
  // paper still holds several values under it. A non-default type is picked so this test catches
  // the type quietly falling back to the default after a rejection.
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await pop.locator('.ctbtn[aria-label="单选"]').click()
  await newInput.fill('读法')
  await newInput.press('Enter')
  // Columns are not inserted optimistically: for now the header has only the placeholder, and focus
  // stays in it.
  expect(await head()).not.toContain('读法')
  await expect(newInput).toBeFocused()
  await expect(win.locator('#notice[data-tone="refusal"] .notice-text')).toHaveText('还有内容在用')
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  // After the rejection the placeholder, type popover, typed name and chosen type (Single choice,
  // not the default Text) all remain.
  await expect(newHead).toHaveCount(1)
  await expect(newInput).toHaveValue('读法')
  const selectBtn = pop.locator('.ctbtn[aria-label="单选"]')
  await expect(selectBtn).toHaveAttribute('aria-checked', 'true')
  await expect(selectBtn).toHaveClass(/on/)
  await expect.poll(head).not.toContain('读法')
  expect((await call<PaperColumns>(win, 'papers.columns', {})).custom).toEqual([])

  // Change it in place to a name whose key does not collide and press Enter: this time the column is
  // created and the placeholder goes.
  await newInput.fill('note')
  await newInput.press('Enter')
  await expect.poll(head).toContain('note')
  await expect(newHead).toHaveCount(0)
})

test('建列一次建成:选中的类型跟着一次写落地,不是先建文本列再改', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const head = () => win.locator('.ptable thead th').allTextContents()

  // Clicking + shows the placeholder and type popover together, with focus in the column name input.
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(1)
  await expect(win.locator('.ptable thead th.th-new input')).toBeFocused()

  // Clicking Single choice sets its aria-checked="true" while focus stays in the input.
  const selectBtn = win.locator('[data-radix-popper-content-wrapper] .ctbtn[aria-label="单选"]')
  await selectBtn.click()
  await expect(selectBtn).toHaveAttribute('aria-checked', 'true')
  await expect(win.locator('.ptable thead th.th-new input')).toBeFocused()

  // Typing a name and pressing Enter stores a select column in Core; its header appears and neither
  // the placeholder nor any popover remains.
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
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('放弃的草稿')
  await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(1)

  await win.keyboard.press('Escape')
  // Both checks are snapshots, not polls. The type popover is checked first, so a lingering popover
  // fails its own check rather than the placeholder's.
  expect(await win.locator('[data-radix-popper-content-wrapper]').count()).toBe(0)
  expect(await win.locator('.ptable thead th.th-new').count()).toBe(0)
})

test('建列占位:空着点到外面,占位与类型层一起没了;打了列名点到外面就建成这一列', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(1)

  await shown(win, '.desk-head .t').click()
  // Both checks are snapshots, not polls. The type popover is checked first, so a lingering popover
  // fails its own check rather than the placeholder's.
  expect(await win.locator('[data-radix-popper-content-wrapper]').count()).toBe(0)
  expect(await win.locator('.ptable thead th.th-new').count()).toBe(0)

  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('点外面建成的列')
  await shown(win, '.desk-head .t').click()
  // The placeholder goes only once the column write lands.
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(0)
  await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(0)
  expect((await call<PaperColumns>(win, 'papers.columns', {}))
    .custom.find((c) => c.label === '点外面建成的列')).toMatchObject({ type: 'text' })
})

test('建列占位:点类型按钮不放弃,占位、类型层、打的字都还在', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('点类型不放弃')

  await win.locator('[data-radix-popper-content-wrapper] .ctbtn[aria-label="多选"]').click()
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(1)
  await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(1)
  await expect(win.locator('.ptable thead th.th-new input')).toHaveValue('点类型不放弃')
})

test('建列占位:只用键盘建一列多选列', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  const input = win.locator('.ptable thead th.th-new input')
  await input.fill('键盘建列')

  // Tab from the input moves focus into the type popover, onto the selected Text option.
  await win.keyboard.press('Tab')
  const textBtn = win.locator('[data-radix-popper-content-wrapper] .ctbtn[aria-label="文本"]')
  const multiBtn = win.locator('[data-radix-popper-content-wrapper] .ctbtn[aria-label="多选"]')
  await expect(textBtn).toBeFocused()

  // Arrow keys move through and select the three options, focus staying in the group: Text, Single
  // choice, Multiple choice.
  await win.keyboard.press('ArrowRight')
  await win.keyboard.press('ArrowRight')
  await expect(multiBtn).toBeFocused()
  await expect(multiBtn).toHaveAttribute('aria-checked', 'true')

  // Enter selects the focused option and returns focus to the column name input.
  await win.keyboard.press('Enter')
  await expect(input).toBeFocused()

  // Enter in the input submits, and Core stores the Multiple choice type picked by keyboard.
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
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('建列时序')
  // The write can land before a snapshot taken after Enter, so the header is recorded after every DOM
  // change from before Enter until the write lands.
  await win.evaluate(() => {
    const states: string[] = []
    const record = () => {
      const column = [...document.querySelectorAll('.ptable thead th')].some((th) => th.textContent === '建列时序')
      const placeholder = document.querySelector('.ptable thead th.th-new') !== null
      const state = column ? (placeholder ? 'both' : 'column') : (placeholder ? 'placeholder' : 'neither')
      if (states.at(-1) !== state) states.push(state)
    }
    record()
    new MutationObserver(record).observe(document.querySelector('.ptable')!, { childList: true, subtree: true })
    ;(window as unknown as { headStates: string[] }).headStates = states
  })
  await win.locator('.ptable thead th.th-new input').press('Enter')

  // Once the write lands the placeholder is gone and the new column is there.
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(0)
  await expect.poll(head).toContain('建列时序')
  // Until then only the placeholder showed (no optimistic insert), and the two never showed at once.
  expect(await win.evaluate(() => (window as unknown as { headStates: string[] }).headStates))
    .toEqual(['placeholder', 'column'])
})

test('建列写在路上时 Esc 放弃了草稿:占位与类型层一起没了,写落地不补开任何层,列照样建成', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('写在路上被放弃')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  // Escape before the write lands removes the placeholder, but the write is already sent and
  // cannot be recalled.
  await win.keyboard.press('Escape')
  // Both checks are snapshots, not polls. The type popover is checked first, so a lingering popover
  // fails its own check rather than the placeholder's.
  expect(await win.locator('[data-radix-popper-content-wrapper]').count()).toBe(0)
  expect(await win.locator('.ptable thead th.th-new').count()).toBe(0)

  await expect.poll(() => call<PaperColumns>(win, 'papers.columns', {}).then((c) => c.custom.map((x) => x.label)))
    .toContain('写在路上被放弃')
  // Nothing reopens when the write lands.
  expect(await win.locator('[data-radix-popper-content-wrapper]').count()).toBe(0)
})

test('建列写在路上时在格子选择器里新建选项:排在建列之后写成,选项进列、格子填上', async ({ win }) => {
  const [id] = await seed(win, [{ key: 'du-fa', label: '读法', type: 'select', options: ['精读'] }], [{ 'du-fa': '精读' }])
  await gotoPapers(win)
  await firstPage(win)
  const cell = win.locator('.ptable tbody tr').first().locator('td.pt-cust').first()
  await expect(cell.locator('.tagchip')).toHaveText('精读')
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('建列时序')

  // Within one task: Enter starts the column write, then the first row's single-choice cell is
  // clicked, a new option typed and Enter pressed. setColumns crosses IPC and cannot land within
  // this task, so all of this happens while the column write is in flight. React commits in
  // microtasks, so only microtasks run between the steps and the task never yields.
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
  // The new header sits at the table's right end, and a narrow window is where the type popover is
  // most likely pushed out.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 720))
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="新建列"]').click()
  // The type popover opens with the placeholder, so there is no Enter or write to wait for.
  const layer = (await win.locator('[data-radix-popper-content-wrapper] .ctxmenu').boundingBox())!
  const vw = await win.evaluate(() => window.innerWidth)
  console.log(`1280×720 下类型层落在 [${layer.x}, ${layer.x + layer.width}]px,窗口宽 ${vw}px`)
  expect(layer.x).toBeGreaterThanOrEqual(0)
  expect(layer.x + layer.width).toBeLessThanOrEqual(vw)
})

test('阅读状态浮层是真菜单:四档是 menuitemradio,当前那一档 aria-checked;下键走到「在读」回车写回', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const chip = win.locator('.ptable tbody tr').first().locator('.stchip')
  await expect(chip).toHaveAttribute('aria-haspopup', 'menu')
  await chip.click()
  const items = win.locator('[role="menu"] [role="menuitemradio"]')
  await expect(items).toHaveText([...READ_STATES])
  await expect(items.nth(READ_STATES.indexOf(UNREAD_PAPER))).toHaveAttribute('aria-checked', 'true')
  await expect(items.nth(READ_STATES.indexOf(READING_PAPER))).toHaveAttribute('aria-checked', 'false')

  // After the click, focus is on the menu content: the first ArrowDown highlights the first option
  // and the second READING_PAPER.
  await win.keyboard.press('ArrowDown')
  await win.keyboard.press('ArrowDown')
  await expect(items.nth(READ_STATES.indexOf(READING_PAPER))).toHaveAttribute('data-highlighted', '')
  await win.keyboard.press('Enter')

  await expect(win.locator('[role="menu"]')).toHaveCount(0)
  await expect(chip).toHaveText(READING_PAPER)
  // Enter selects it without reaching the row and opening the details panel.
  await expect(win.locator('.pdetail')).toHaveCount(0)
})

test('阅读状态菜单开着、指针挪到菜单项上之后,行留着 hover 底色,行尾删除钮与加标签钮也仍然可见', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const row = win.locator('.ptable tbody tr').first()
  // The hover background is painted on the cells (td), not on <tr>, so read it from a cell.
  const cell = row.locator('td:nth-child(7)')
  // The sticky first cell paints its background as a background-image gradient, not background-color.
  const stickyCell = row.locator('td:first-child')
  const rowx = row.locator('.rowx')
  const tagadd = cell.locator('.tagadd')

  await row.hover()
  await settle(cell)
  const hoverBg = await cell.evaluate((el) => getComputedStyle(el).backgroundColor)
  await settle(stickyCell)
  const hoverStickyImage = await stickyCell.evaluate((el) => getComputedStyle(el).backgroundImage)
  await row.locator('.stchip').click()
  // Moving the pointer onto a menu item really drops the row's :hover; without the move :hover would
  // stick and the check could not catch anything.
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

test('选中行的冻结标题格不透底,阅读状态菜单开着时整行仍是选中底色', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  const row = win.locator('.ptable tbody tr').first()
  await row.locator('td.pt-title').click()
  await expect(row).toHaveClass(/\bselected\b/)
  await parkPointer(win)
  const paint = () => row.locator('td').evaluateAll((tds) => tds.map((td) => {
    const style = getComputedStyle(td)
    return `${style.backgroundImage} ${style.backgroundColor}`
  }))
  const selected = await paint()
  // Columns scroll sideways under the sticky title cell, so its background color must be opaque.
  expect(await row.locator('td.pt-title').evaluate((td) => getComputedStyle(td).backgroundColor)).toMatch(/^rgb\(/)

  await row.locator('.stchip').click()
  await win.locator('[role="menu"] [role="menuitemradio"]').first().hover()
  expect(await paint()).toEqual(selected)
})

// Pixel checks take element screenshots, which need a visible window.
test.describe(() => {
  test.use({ showWindow: true })

  test('选中行在截断的标题上悬停时,左侧选中条与格子底色不变', async ({ win }) => {
    await gotoPapers(win)
    await firstPage(win)
    const index = await truncatedTitleRow(win)
    expect(index).toBeGreaterThanOrEqual(0)
    const row = win.locator('.ptable tbody tr').nth(index)
    const title = row.locator('td.pt-title')
    await title.click()
    await expect(row).toHaveClass(/\bselected\b/)
    await settle(win.locator('.desk-body.libview'))
    await parkPointer(win)
    const resting = (await title.screenshot()).toString('base64')
    await title.hover()
    const hovered = (await title.screenshot()).toString('base64')

    // The selected bar is the cell's left 3px and the text sits below 7px of padding, so the first two
    // pixel columns and the first three pixel rows show only the bar and the row background. Gradients
    // are dithered, so a repaint may move a channel by a level or two.
    const changed = await win.evaluate(async (shots) => {
      const [before, after] = await Promise.all(shots.map(async (b64) => {
        const img = new Image()
        img.src = `data:image/png;base64,${b64}`
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        return ctx.getImageData(0, 0, canvas.width, canvas.height)
      })) as [ImageData, ImageData]
      let count = 0
      for (let y = 0; y < before.height; y++) {
        for (let x = 0; x < before.width; x++) {
          if (x >= 2 && y >= 3) continue
          const i = (y * before.width + x) * 4
          if ([0, 1, 2].some((c) => Math.abs(before.data[i + c]! - after.data[i + c]!) > 4)) count += 1
        }
      }
      return count
    }, [resting, hovered])
    expect(changed, '悬停后标题格的左侧选中条或底色变了').toBe(0)
  })
})

// This test needs a visible window; an offscreen window cannot reproduce the behaviour.
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
    // A raw pointer click, skipping locator.click()'s actionability check: that check first ensures
    // the target receives the click, while this test is about the click falling through to the
    // layer outside the menu and closing it.
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
  await expect(items).toHaveText(['主题', '项目', '阅读状态'])
  await expect(items.filter({ hasText: '主题' })).toHaveAttribute('aria-checked', 'true')
  await expect(items.filter({ hasText: '阅读状态' })).toHaveAttribute('aria-checked', 'true')

  await items.filter({ hasText: '主题' }).click()
  await expect(items.filter({ hasText: '主题' })).toHaveAttribute('aria-checked', 'false')
  await expect(win.locator('[role="menu"]')).toHaveCount(1)
  // The read-state field has its own dedicated filter button and never appears as a segmented-control grouping option.
  await expect(win.locator('.filters .segmented-control>button')).toHaveText(['无', '项目'])
})

// This test needs a visible window; an offscreen window cannot reproduce the behaviour.
test.describe(() => {
  test.use({ showWindow: true })

  test('分组齿轮:平时点得动,别的菜单开着时点它只关那个菜单', async ({ win }) => {
    await gotoPapers(win)
    await firstPage(win)
    const gear = win.locator('.filters .grpgear')
    const menu = win.locator('[role="menu"]')

    // Normally it is clickable.
    await gear.click()
    await expect(menu).toHaveCount(1)
    await win.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)

    // While another menu (reading status) is open, clicking the gear only closes that menu and does
    // not open the group menu.
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
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已改列类型 · 记入最近变动，可撤销')
  const column = (await call<PaperColumns>(win, 'papers.columns', {})).custom[0]!
  expect(column.type).toBe('select')
  // Options are collected in vault order, which differs from table order; Core's unit tests pin the
  // order, so compare as a set here.
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
  await expect(shown(win, '.filters .segmented-control>button[aria-checked="true"]')).toHaveText('读法')

  await retype(win, '读法', '文本')
  await expect(shown(win, '.filters .segmented-control>button').filter({ hasText: '读法' })).toHaveCount(0)
  await expect(shown(win, '.filters .segmented-control>button[aria-checked="true"]')).toHaveText('无')
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

test('改类型:多选 → 单选时有论文填着多个值,整次被拒,拒绝提示说清几篇,列与格子都不变', async ({ win }) => {
  const ids = await seed(win, [{ key: 'tags', label: '标签', type: 'multi', options: ['综述', '必读'] }],
    [{ tags: ['综述', '必读'] }, { tags: ['综述', '必读'] }, { tags: ['综述'] }])
  await gotoPapers(win)
  await firstPage(win)
  await retype(win, '标签', '单选')
  await expect(win.locator('#notice[data-tone="refusal"] .notice-text')).toHaveText('还有内容在用')
  await expect(shown(win, '.ipcerror')).toHaveCount(0)
  // Rejected: Multiple choice stays selected in the type row; the table cells and Core are unchanged.
  await expect(win.locator('[data-radix-popper-content-wrapper] .typerow .ctbtn[aria-label="多选"]'))
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
  await win.locator('[data-radix-popper-content-wrapper] .typerow .ctbtn[aria-label="单选"]').click()
  await expect.poll(typeOf).toEqual({ key: 'note', label: '备注', type: 'select', options: [] })
  await win.locator('[data-radix-popper-content-wrapper] .typerow .ctbtn[aria-label="文本"]').click()
  await expect.poll(typeOf).toEqual({ key: 'note', label: '备注', type: 'text', options: [] })
})

test('改类型:列菜单里只用键盘把文本列改成单选', async ({ win }) => {
  const ids = await seed(win, [{ key: 'note', label: '备注', type: 'text', options: [] }], [{ note: '精读' }])
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [aria-label="列设置"]').click()
  const menu = win.locator('[data-radix-popper-content-wrapper]')

  // Opening the menu focuses its first tabbable button; a text column has no Options toggle, so
  // that is Change type.
  await expect(menu.locator('.mi.colrow', { hasText: '备注' }).locator('[aria-label="改类型"]')).toBeFocused()
  await win.keyboard.press('Enter')
  // Of the expanded type options only the current one is in the Tab order; after Change type come
  // the rename pen, the delete × and then that option.
  await win.keyboard.press('Tab')
  await win.keyboard.press('Tab')
  await win.keyboard.press('Tab')
  const selectBtn = menu.locator('.typerow .ctbtn[aria-label="单选"]')
  await expect(menu.locator('.typerow .ctbtn[aria-label="文本"]')).toBeFocused()

  // ArrowRight moves to Single choice and selects it: the column becomes single-choice, the cell
  // renders as an option chip, and focus stays on Single choice.
  await win.keyboard.press('ArrowRight')
  await expect(win.locator('.ptable tbody tr td.pt-cust').nth(0).locator('.tagchip')).toHaveText('精读')
  expect((await call<PaperColumns>(win, 'papers.columns', {})).custom[0])
    .toEqual({ key: 'note', label: '备注', type: 'select', options: ['精读'] })
  expect(await cellsOf(win, ids)).toEqual([{ note: '精读' }])
  await expect(selectBtn).toHaveAttribute('aria-checked', 'true')
  await expect(selectBtn).toBeFocused()
})

test('详情里点一项元数据,原位输入框没有边框、浅灰实底,只在底部有一条强调线、没有外圈', async ({ win }) => {
  await gotoPapers(win)
  await firstPage(win)
  await win.locator('.ptable tbody tr').first().locator('td.pt-title').click()
  await win.locator('.pdetail .paper-meta-list dt:text-is("年份") + dd .metadata-editable').click()

  const input = win.locator('.pdetail .metadata-input')
  await expect(input).toBeFocused()
  // The editing line fades in over the focus transition; read the field once it has settled.
  await expect.poll(() => input.evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(/ 0px -2px 0px 0px inset$/)
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
  // One inset line along the bottom edge and nothing around the field.
  expect(style.shadow.split(/,(?![^(]*\))/)).toHaveLength(1)
  expect(style.shadow).toMatch(/ 0px -2px 0px 0px inset$/)
  expect(style.outline).toBe('none')
})
