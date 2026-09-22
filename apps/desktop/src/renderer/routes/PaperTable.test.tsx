// @vitest-environment jsdom
import { act, Profiler, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListParams, PaperColumns, PaperImportResult, PaperRow } from '../../shared/contract.js'
import { PAPER_COLUMNS } from '../../shared/vocabulary.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { papers as papersZh } from '../messages/zh/papers.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** A controlled promise for an IPC call: the test decides by itself when and with what value it resolves, or with what error it rejects. */
type Controlled<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: Error) => void }

function controlled<T>(): Controlled<T> {
  let resolve: (v: T) => void = () => {}
  let reject: (e: Error) => void = () => {}
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const ROW: PaperRow = {
  id: 'p1', title: '一篇论文', venue: 'arXiv', topics: [], methods: [], datasets: [], metrics: [],
  pageState: 'draft', readState: '未读', pageCount: 1, noteCount: 0, conclusionCount: 0,
  updated: '2026-01-01', custom: {}, projects: [],
}
const EMPTY_COLUMNS: PaperColumns = { hidden: [], custom: [], groups: [] }
/** A created selection column with an existing option: the selector can be opened in the grid to submit new options, and the menu can also be renamed. */
const SELECT_COLUMNS: PaperColumns = {
  hidden: [], groups: [],
  custom: [{ key: 'pick', label: '选择', type: 'select', options: ['existing'] }],
}
/** A built-in multi-select column with an existing option: several values can be selected consecutively in one cell. */
const MULTI_COLUMNS: PaperColumns = {
  hidden: [], groups: [],
  custom: [{ key: 'pick', label: '多选', type: 'multi', options: ['existing'] }],
}
/** One column selection column and one text column: In the same row, select the selection cell first and then save the text cell. */
const PICK_AND_NOTE: PaperColumns = {
  hidden: [], groups: [],
  custom: [
    { key: 'pick', label: '选择', type: 'select', options: ['existing', 'other'] },
    { key: 'note', label: '备注', type: 'text', options: [] },
  ],
}
/** There is only one text column "Remarks": change its type in the column menu. */
const NOTE_COLUMNS: PaperColumns = {
  hidden: [], groups: [], custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
}
/** The configuration confirmed by core after "Remarks" was changed to a radio selection column. */
const NOTE_AS_SELECT: PaperColumns = {
  hidden: [], groups: [], custom: [{ key: 'note', label: '备注', type: 'select', options: [] }],
}

let columnsCall: Controlled<PaperColumns>
let listCall: Controlled<{ rows: PaperRow[]; total: number }>
let getCall: Controlled<PaperRow>
let importCall: Controlled<PaperImportResult> & { filename: string; bytes: Uint8Array }
/** Each time papers.setColumns calls its own controlled promise, arranged in the order in which it was initiated. */
let setColumnsCalls: (Controlled<void> & { columns: PaperColumns })[]
/** Each papers.update has its own controlled promise, arranged in the order in which it was initiated. */
let updateCalls: (Controlled<void> & { id: string; patch: Record<string, unknown> })[]
/** Each time the parameters of papers.renameOption are arranged in the order of initiation. */
let renameOptionCalls: [key: string, from: string, to: string][]
/** Each time papers.setColumnType calls its own controlled promise, arranged in the order in which they were initiated. */
let setColumnTypeCalls: (Controlled<void> & { key: string; type: string })[]
/** The original words of toast, arranged in the order in which they were given. */
let toastMessages: string[]
let deletedPapers: string[]
/** Should papers.update throw an error synchronously next time (instead of using a reject promise) to simulate an unexpected error throw? */
let throwOnNextUpdate: Error | null
/** papers.columns / papers.list have been adjusted several times each, including the time when mounting. */
let columnsCallCount: number
let listCallCount: number
let listParams: ListParams[]
let openedScreens: [screen: string, id?: string][]

vi.mock('../ipc.js', () => ({
  papers: {
    list: (params: ListParams) => { listCallCount += 1; listParams.push(params); return listCall.promise },
    facets: () => Promise.resolve([]),
    get: () => getCall.promise,
    update: (id: string, patch: Record<string, unknown>) => {
      if (throwOnNextUpdate) { const e = throwOnNextUpdate; throwOnNextUpdate = null; throw e }
      const c = controlled<void>()
      updateCalls.push({ ...c, id, patch })
      return c.promise
    },
    delete: (id: string) => { deletedPapers.push(id); return Promise.resolve() },
    reading: (id: string) => Promise.resolve({ paperId: id, highlights: [], notes: [], remark: '' }),
    source: () => Promise.reject(new Error('未在这个探针里用到')),
    import: (filename: string, bytes: Uint8Array) => {
      const call = controlled<PaperImportResult>()
      importCall = { ...call, filename, bytes }
      return call.promise
    },
    columns: () => { columnsCallCount += 1; return columnsCall.promise },
    setColumns: (columns: PaperColumns) => {
      const c = controlled<void>()
      setColumnsCalls.push({ ...c, columns })
      return c.promise
    },
    renameOption: (key: string, from: string, to: string) => {
      renameOptionCalls.push([key, from, to])
      return Promise.resolve()
    },
    setColumnType: (key: string, type: string) => {
      const c = controlled<void>()
      setColumnTypeCalls.push({ ...c, key, type })
      return c.promise
    },
  },
  project: {
    list: () => Promise.resolve([]),
    addPaper: () => Promise.resolve(),
    removePaper: () => Promise.resolve(),
  },
}))

vi.mock('../shell/AppShell.js', () => ({
  useBanner: () => vi.fn(),
  useCrumbTail: () => {},
  useEscapeLayer: () => {},
  useScreenReentry: () => 0,
  useJump: () => ({
    jump: null,
    open: (screen: string, id?: string) => { openedScreens.push([screen, id]) },
    returnTo: vi.fn(),
  }),
  usePaperCount: () => null,
  useScreen: () => 'papers',
  useToast: () => (message: string) => { toastMessages.push(message) },
  // Only when a revision state is maintained will the bump re-trigger the effects that are retrieved by revision just like in the application.
  useVaultRevision: () => {
    const [revision, setRevision] = useState(0)
    return { revision, bump: () => { setRevision((r) => r + 1) } }
  },
}))

const { COLUMNS, orderedColumns, PaperTable } = await import('./PaperTable.js')

describe('内置列', () => {
  it('标题之后依次是短标题、评分、作者、年份、发表、主题、状态、随笔,与词表一一对应;能排序的只有作者与年份', () => {
    expect(COLUMNS.map((c) => c.k)).toEqual([...PAPER_COLUMNS])
    expect(COLUMNS.map((c) => papersZh.columns[c.k]))
      .toEqual(['短标题', '评分', '作者', '年份', '发表', '主题', '状态', '随笔'])
    expect(orderedColumns({ hidden: [], custom: [], groups: [] }).map((c) => c.k)).toEqual([...PAPER_COLUMNS])
    expect(COLUMNS.filter((c) => c.sort !== undefined).map((c) => [c.k, c.sort]))
      .toEqual([['authors', 'authors'], ['y', 'year']])
  })
})

let mountedRoot: Root | null = null

/** Hang in a real container and the rendered table is inside. */
function mount(): HTMLDivElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  mountedRoot = createRoot(host)
  act(() => { mountedRoot!.render(<MessagesProvider><PaperTable /></MessagesProvider>) })
  return host
}

/** Finish this round of microtasks and let the promise's then chain run to the end. */
async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

/** To set the value of an input box and dispatch the input event, the native setter subscribed by React itself is used; it is applicable to both controlled and uncontrolled. */
function setValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Click on `el` in the order that the user actually clicks: first mousedown and then click. */
function press(el: Element): void {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

/** The text in each column of the table header. */
function headTexts(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.ptable thead th')].map((th) => th.textContent ?? '')
}

const TYPE_TITLE = { select: '单选', multi: '多选' } as const

/**
 * Create a draft of a column: open the placeholder, press `type` (leave the default "text" if not passed), fill in the name, press Enter, and return to the time it was initiated.
 * papers.setColumns.
 */
async function startCreate(host: HTMLDivElement, label: string, type?: 'select' | 'multi') {
  const plus = host.querySelector<HTMLButtonElement>('[title="新增列"]')!
  await act(async () => { plus.click() })
  if (type) {
    const typeBtn = document.querySelector<HTMLButtonElement>(`[title="${TYPE_TITLE[type]}"]`)!
    await act(async () => { typeBtn.click() })
  }
  const input = host.querySelector<HTMLInputElement>('th.th-new input')!
  await act(async () => { setValue(input, label) })
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  return setColumnsCalls.at(-1)!
}

/** Hang up a table with only one text column called "Remarks", open the column settings menu, and expand the row with the type of "Remarks". */
async function openNoteTypeRow(): Promise<void> {
  const host = mount()
  columnsCall.resolve(NOTE_COLUMNS)
  listCall.resolve({ rows: [ROW], total: 1 })
  await flush()
  await act(async () => { host.querySelector<HTMLButtonElement>('[title="列设置"]')!.click() })
  await act(async () => { document.querySelector<HTMLButtonElement>('[title="改类型"]')!.click() })
}

/** The gear button named `title` in the column menu type row. */
function typeButton(title: string): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(`.typerow [title="${title}"]`)!
}

/** Click `key` on the element currently holding focus. */
async function pressKey(key: string): Promise<void> {
  await act(async () => {
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

describe('PaperTable', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    columnsCall = controlled()
    listCall = controlled()
    getCall = controlled()
    importCall = { ...controlled<PaperImportResult>(), filename: '', bytes: new Uint8Array() }
    setColumnsCalls = []
    updateCalls = []
    renameOptionCalls = []
    setColumnTypeCalls = []
    toastMessages = []
    deletedPapers = []
    throwOnNextUpdate = null
    columnsCallCount = 0
    listCallCount = 0
    listParams = []
    openedScreens = []
  })

  it('defaults to 20 papers and offers only the 20, 30, and 50 page sizes', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 51 })
    await flush()

    expect(listParams[0]).toMatchObject({ page: 1, size: 20 })
    expect([...host.querySelectorAll('.pagebar .segmented-control>button')].map((button) => button.textContent))
      .toEqual(['20 / 页', '30 / 页', '50 / 页'])
  })

  it('研究地图用实际论文元数据生成可重叠的只读分组,并解释每篇论文为何归入', async () => {
    const host = mount()
    const mappedRows = [
      { ...ROW, id: 'p1', title: 'Fast speculative decoding', topics: ['Speculative decoding'] },
      { ...ROW, id: 'p2', title: 'Reliable speculative decoding', methods: ['Speculative decoding'] },
    ]
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: mappedRows, total: 2 })
    await flush()

    expect(host.querySelector('.desk-head')?.children).toHaveLength(1)
    const mapSwitch = [...host.querySelectorAll<HTMLButtonElement>('.paper-view-toolbar .segmented-control button')]
      .find((button) => button.textContent === '研究地图')!
    expect(host.querySelector('.paper-view-toolbar .pdfupload')).not.toBeNull()
    await act(async () => { mapSwitch.click() })
    await flush()

    expect(listParams.at(-1)).toMatchObject({ page: 1, size: 200, sort: 'addedAt', direction: 'desc' })
    expect(host.querySelector('.research-map-title')?.textContent).toContain('自适应研究地图')
    expect(host.querySelector('.research-map-groups')?.textContent).toContain('Speculative decoding')
    expect(host.querySelector('.research-map-detail')?.textContent).toContain('归入依据')
    expect(host.querySelector('.research-map-detail')?.textContent).toContain('主题：Speculative decoding')
    expect(host.querySelector('.pagebar')).toBeNull()
  })

  it('上传把 PDF 交给 Core,落地后清掉搜索并由最近添加排序把它留在第一页', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()
    expect(host.querySelector('.paper-detail-slot')?.getAttribute('data-panel-state')).toBe('closed')

    const bytes = Uint8Array.from([37, 80, 68, 70, 45])
    const input = host.querySelector<HTMLInputElement>('.pdfupload-input')!
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [{ name: '新论文.pdf', arrayBuffer: async () => bytes.buffer }],
    })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(importCall.filename).toBe('新论文.pdf')
    expect([...importCall.bytes]).toEqual([...bytes])
    expect(host.querySelector<HTMLButtonElement>('.pdfupload')!.disabled).toBe(true)

    const paper = { ...ROW, id: 'uploaded', title: '新论文' }
    importCall.resolve({ kind: 'added', paper })
    await flush()
    expect(host.querySelector<HTMLInputElement>('#libq')!.value).toBe('')
    expect(host.querySelector('.pdetail')?.textContent).toContain('新论文')
    expect(host.querySelector<HTMLButtonElement>('.pdfupload')!.disabled).toBe(false)
    expect(listParams.at(-1)).toMatchObject({ page: 1, sort: 'addedAt', direction: 'desc' })
  })

  it('论文搜索框用尾部叉号一次清空筛选并保留输入焦点', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const input = host.querySelector<HTMLInputElement>('#libq')!
    act(() => setValue(input, 'Paper One'))
    await flush()
    const clear = host.querySelector<HTMLButtonElement>('[aria-label="清除论文搜索"]')!
    act(() => clear.click())
    await flush()

    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    expect(listParams.at(-1)).not.toHaveProperty('filter')
  })

  it('随笔与自定义文本列共用整格文本编辑器', async () => {
    const host = mount()
    columnsCall.resolve(NOTE_COLUMNS)
    listCall.resolve({ rows: [{ ...ROW, remark: '', custom: { note: '' } }], total: 1 })
    await flush()

    const remarkCell = host.querySelector<HTMLElement>('td.pt-remark')!
    await act(async () => { press(remarkCell) })
    expect(remarkCell.querySelector('input')?.classList).toContain('paper-text-cell-input')
    expect(remarkCell.querySelector('input')?.classList).toContain('form-control-inline')

    const customCell = host.querySelector<HTMLElement>('td.pt-cust')!
    await act(async () => { press(customCell) })
    expect(customCell.querySelector('input')?.classList).toContain('paper-text-cell-input')
    expect(customCell.querySelector('input')?.classList).toContain('form-control-inline')
  })

  it('默认按最近添加排序,双击论文行直接进入阅读器,格内按钮不会误触发', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    expect(listParams[0]).toMatchObject({ sort: 'addedAt', direction: 'desc' })
    const row = host.querySelector<HTMLElement>('.ptable tbody tr')!
    await act(async () => { row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) })
    expect(openedScreens).toEqual([['reader', ROW.id]])

    const removeButton = row.querySelector<HTMLButtonElement>('.rowx')!
    await act(async () => { removeButton.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) })
    expect(openedScreens).toEqual([['reader', ROW.id]])
  })

  it('主题超出一行时用 +N 收起,点击后展开且不会误开论文详情', async () => {
    const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
      .mockImplementation(function () { return this.classList.contains('ci') ? 200 : 0 })
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockImplementation(function () { return this.classList.contains('ci') ? 100 : 0 })
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        const right = this.classList.contains('tagchip') && this.textContent !== 'one' ? 80 : 40
        return DOMRect.fromRect({ x: 0, width: right })
      })
    try {
      const host = mount()
      columnsCall.resolve(EMPTY_COLUMNS)
      listCall.resolve({ rows: [{ ...ROW, topics: ['one', 'two', 'three'] }], total: 1 })
      await flush()

      const more = host.querySelector<HTMLButtonElement>('.morebadge')!
      const chips = more.parentElement!
      expect(more.textContent).toBe('+2')
      expect(more.getAttribute('aria-expanded')).toBe('false')
      act(() => more.click())
      expect(more.getAttribute('aria-expanded')).toBe('true')
      expect(chips.classList.contains('chip-expanded')).toBe(true)
      expect(openedScreens).toEqual([])
      act(() => more.click())
      expect(more.getAttribute('aria-expanded')).toBe('false')
      expect(chips.classList.contains('chip-expanded')).toBe(false)
    } finally {
      scrollWidth.mockRestore()
      clientWidth.mockRestore()
      rect.mockRestore()
    }
  })

  it('拖动列分隔线只等量改变左右相邻两列,后面的列不跟着移动', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const table = host.querySelector<HTMLTableElement>('.ptable')!
    // Responsive width is 100% managed by CSS and cannot be crammed back into a pixel min-width that would create horizontal scrolling.
    expect(table.style.minWidth).toBe('')
    const actual: Record<string, number> = {
      t: 400, short: 180, rating: 100, authors: 170, y: 110, venue: 130, topics: 220, st: 90, x: 52,
    }
    const column = (key: string) => host.querySelector<HTMLElement>(`col[data-cw="${key}"]`)!
    for (const [key, width] of Object.entries(actual)) {
      Object.defineProperty(column(key), 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ width }),
      })
    }

    const titleGrip = host.querySelector<HTMLElement>('th:first-child .thgrip')!
    await act(async () => {
      titleGrip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 400 }))
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 450 }))
    })
    expect(column('t').style.width).toBe('450px')
    expect(column('short').style.width).toBe('130px')
    expect(column('rating').style.width).toBe('100px')
    expect(column('authors').style.width).toBe('170px')

    await act(async () => { document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })) })
    expect(column('t').style.width).toBe('450px')
    expect(column('short').style.width).toBe('130px')
    expect(column('rating').style.width).toBe('100px')
  })

  it('阅读状态可在顶栏直接筛选,不必先进入分组索引', async () => {
    const host = mount()
    columnsCall.resolve({ hidden: [], custom: [], groups: ['readState'] })
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const trigger = host.querySelector<HTMLButtonElement>('.filters .read-state-filter:not(.on)')!
    expect(trigger.classList.contains('read-state-filter')).toBe(true)
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    await flush()
    const unread = [...document.querySelectorAll<HTMLElement>('.ctxmenu .mi')]
      .find((item) => item.textContent?.includes('未读'))!
    await act(async () => { press(unread) })
    await flush()

    expect(listParams.at(-1)?.facet).toEqual({ field: 'readState', value: '未读' })
    expect(host.querySelector('.filters .read-state-filter.on')?.textContent).toBe('未读')
    expect(host.querySelector('.lmore')).toBeNull()
  })

  it('论文行在当前位置右键即可移到垃圾桶,不依赖横向滚到行尾', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const row = host.querySelector<HTMLElement>('.ptable tbody tr')!
    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 80 }))
    })
    const menu = document.body.querySelector<HTMLElement>('.paper-row-menu')!
    expect(menu.getAttribute('role')).toBe('menu')
    await act(async () => { press([...menu.querySelectorAll('[role="menuitem"]')].at(-1)!) })
    await flush()
    expect(deletedPapers).toEqual([ROW.id])
    expect(document.body.querySelector('.paper-row-menu')).toBeNull()
  })

  afterEach(() => {
    if (mountedRoot) act(() => { mountedRoot!.unmount() })
    mountedRoot = null
  })

  it('打开论文详情仍保留全部配置列、列操作与当前行上下文', async () => {
    const host = mount()
    columnsCall.resolve(SELECT_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const labels = () => [...host.querySelectorAll('.ptable thead th')].map((cell) => cell.textContent)
    const before = labels()
    const row = host.querySelector<HTMLElement>('.ptable tbody tr')!
    await act(async () => { press(row) })
    getCall.resolve(ROW)
    await flush()

    expect(labels()).toEqual(before)
    expect(labels()).toContain('选择')
    expect(host.querySelectorAll('.ptable thead .thmove')).toHaveLength(COLUMNS.length + 1)
    expect(host.querySelector<HTMLButtonElement>('[title="新增列"]')!.disabled).toBe(false)
    expect(row.classList).toContain('selected')
    expect(row.getAttribute('aria-current')).toBe('true')
  })

  it('详情面板收掉建列草稿之后,关面板新开的草稿不受它落地影响', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    await startCreate(host, '第一次')
    expect(setColumnsCalls).toHaveLength(1)

    // Click a row to open the details panel: This way, do not go through NewColumnHead's onCancel, directly setNewCol(false)
    const row = host.querySelector<HTMLElement>('.ptable tbody tr')!
    await act(async () => { press(row) })
    getCall.resolve(ROW)
    await flush()
    expect(host.querySelector('th.th-new')).toBeNull()
    expect(host.querySelector('.pdetail')).not.toBeNull()
    expect(host.querySelector('.paper-detail-slot')?.getAttribute('data-panel-state')).toBe('open')

    // Collapse details panel
    const closeDetail = host.querySelector<HTMLButtonElement>('[title="收起详情"]')!
    await act(async () => { closeDetail.click() })
    expect(host.querySelector('.pdetail')).toBeNull()
    expect(host.querySelector('.paper-detail-slot')?.getAttribute('data-panel-state')).toBe('closed')

    // Open a new draft and type it without submitting it
    const plus = host.querySelector<HTMLButtonElement>('[title="新增列"]')!
    await act(async () => { plus.click() })
    const input2 = host.querySelector<HTMLInputElement>('th.th-new input')!
    await act(async () => { setValue(input2, '第二次') })

    // The first time the column is built: the details panel has already closed it, and the second draft should not be touched.
    setColumnsCalls[0]!.resolve()
    await flush()
    expect(host.querySelector('th.th-new input')).toBe(input2)
    expect(input2.value).toBe('第二次')
  })

  it('选中类型后回车:一次写带着这个类型,写落地前占位、层、选中的档位都留着', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const call = await startCreate(host, '选择列', 'select')
    // Write once with the selected type, instead of creating a text column first and then changing the type.
    expect(call.columns.custom.find((c) => c.label === '选择列')?.type).toBe('select')

    // The writing has not yet been implemented: the placeholder, type layer and selected gear are all still there
    expect(host.querySelector('th.th-new')).not.toBeNull()
    const selectBtn = document.querySelector<HTMLButtonElement>('[title="单选"]')!
    expect(selectBtn.getAttribute('aria-checked')).toBe('true')
    expect(selectBtn.className).toContain('on')

    call.resolve()
    await flush()
    // It is written as follows: the placeholders and the type layer are folded together, leaving no overlap of even one frame (the following use case nails this point frame by frame)
    expect(host.querySelector('th.th-new')).toBeNull()
    expect(document.querySelector('[data-radix-popper-content-wrapper]')).toBeNull()
  })

  // Use Profiler to submit table header snapshots one after another, and check that each submission after the creation of columns is completed: the placeholders and new columns will not be present at the same time.
  // Or neither. act is only submitted in groups between its own refresh points, and the smallest granularity that can be distinguished is one such refresh point.
  it('建列写成时,新列出现与占位(连同类型层)撤下落在同一次提交里,不会有只画一半的一帧', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    /** A snapshot of the table header after each submission: whether the placeholder is present and whether the new column is present. */
    const snapshots: { hasPlaceholder: boolean; hasNewColumn: boolean }[] = []
    const snapshot = () => ({
      hasPlaceholder: host.querySelector('th.th-new') !== null,
      hasNewColumn: [...host.querySelectorAll('.ptable thead th')]
        .some((th) => th.textContent?.includes('建列时序') ?? false),
    })
    act(() => {
      root.render(
        <MessagesProvider>
          <Profiler id="ptable" onRender={() => snapshots.push(snapshot())}>
            <PaperTable />
          </Profiler>
        </MessagesProvider>,
      )
    })
    mountedRoot = root

    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    await startCreate(host, '建列时序')
    snapshots.length = 0 // Only look at those submissions after the implementation

    setColumnsCalls[0]!.resolve()
    await flush()

    expect(snapshots.length).toBeGreaterThan(0)
    // Every submission happens to be one of "the placeholder is there and the new column is not there" or "the placeholder is not there and the new column is there", not both or neither.
    for (const s of snapshots) expect(s.hasPlaceholder).not.toBe(s.hasNewColumn)
    expect(snapshots.at(-1)).toEqual({ hasPlaceholder: false, hasNewColumn: true })
  })

  it('建列在途时,格子里先选已有选项、再新建一个选项,后一次发写读的是建列落地后的最新列', async () => {
    const host = mount()
    columnsCall.resolve(MULTI_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    await startCreate(host, '新列')
    expect(setColumnsCalls).toHaveLength(1)
    const createCall = setColumnsCalls[0]!

    // First select an existing option in the multi-select grid - no need to create an option, just enter the link and post it, and keep it without landing.
    const cell = host.querySelector<HTMLElement>('td.pt-cust')!
    await act(async () => { press(cell) })
    const existingRow = document.querySelector<HTMLElement>('.rrow.opt')!
    await act(async () => { press(existingRow) })
    await flush()
    expect(updateCalls).toHaveLength(1)
    const firstUpdate = updateCalls[0]!

    // Submit a new option again - the chain is ranked after the first time; the list creation has not yet been completed at this moment, and it is not included in the closure submitted this time.
    const picker = host.querySelector<HTMLInputElement>('td.pt-cust input.celledit')!
    await act(async () => { setValue(picker, '新选项') })
    await act(async () => {
      picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await flush()
    expect(setColumnsCalls).toHaveLength(1) // It's ranked behind the first time, and it hasn't been its turn to actually write yet.

    // Column creation is implemented: There are new columns in the column set confirmed by core
    createCall.resolve()
    await flush()

    // Only after writing for the first time is it implemented, the chain is advanced to the execution body of the second option.
    firstUpdate.resolve()
    await flush()

    // The second time I actually write: the payload carries the newly created column, not the copy that is missing from the closure at the moment of submission.
    expect(setColumnsCalls).toHaveLength(2)
    const createdKey = createCall.columns.custom.find((c) => c.label === '新列')!.key
    const sentKeys = setColumnsCalls[1]!.columns.custom.map((c) => c.key)
    expect(sentKeys).toContain(createdKey)
  })

  it('同一格连着两次新建选项,后一次的载荷带着前一次落地后确认的取值', async () => {
    const host = mount()
    columnsCall.resolve(MULTI_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const cell = host.querySelector<HTMLElement>('td.pt-cust')!
    await act(async () => { press(cell) })

    // Submit the first new option - no need to wait for the column to be created, directly enter the link to write, and keep it as a gate without landing.
    const picker = host.querySelector<HTMLInputElement>('td.pt-cust input.celledit')!
    await act(async () => { setValue(picker, '新选项A') })
    await act(async () => {
      picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await flush()
    expect(setColumnsCalls).toHaveLength(1)
    const firstSetColumns = setColumnsCalls[0]!

    // Then submit the second new option - ranked behind the first one, the first one has not yet landed at this moment
    await act(async () => { setValue(picker, '新选项B') })
    await act(async () => {
      picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await flush()
    expect(setColumnsCalls).toHaveLength(1) // It's behind the first one and it hasn't been its turn yet

    // The first one is implemented: setColumns is completed, and the papers.update that is sent immediately needs someone to respond to it.
    firstSetColumns.resolve()
    await flush()
    expect(updateCalls).toHaveLength(1)
    updateCalls[0]!.resolve()
    await flush()

    // The second one is actually written: with the value confirmed after the first one landed, not at the moment of submission (before the first one landed)
    // The one calculated from the columns and rows - the calculation will miss the first newly added "new option A"
    expect(setColumnsCalls).toHaveLength(2)
    const sentPickColumn = setColumnsCalls[1]!.columns.custom.find((c) => c.key === 'pick')!
    expect(sentPickColumn.options).toEqual(['existing', '新选项A', '新选项B'])

    setColumnsCalls[1]!.resolve()
    await flush()
    expect(updateCalls).toHaveLength(2)
    expect(updateCalls[1]!.patch).toEqual({ custom: { pick: ['新选项A', '新选项B'] } })
  })

  it('选择回调里意外抛错之后,同一格下一次选择照常发出', async () => {
    const host = mount()
    columnsCall.resolve(MULTI_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const cell = host.querySelector<HTMLElement>('td.pt-cust')!
    await act(async () => { press(cell) })
    const existingRow = document.querySelector<HTMLElement>('.rrow.opt')!

    throwOnNextUpdate = new Error('意外炸了')
    await act(async () => { press(existingRow) })
    await flush()

    expect(toastMessages).toEqual(['意外炸了'])
    // The error occurred before the controlled promise was actually credited, and this time there was no papers.update call left.
    expect(updateCalls).toHaveLength(0)

    // Select the same cell again: the queue is not stuck in "void" due to that error, and will be counted and issued as usual.
    const existingRowAgain = document.querySelector<HTMLElement>('.rrow.opt')!
    await act(async () => { press(existingRowAgain) })
    await flush()

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]!.patch).toEqual({ custom: { pick: ['existing'] } })
  })

  it('同一行的选择还在路上时存文本格:文本格的写只带自己那一格,不把这一行旧的选择值带回去', async () => {
    const host = mount()
    columnsCall.resolve(PICK_AND_NOTE)
    listCall.resolve({ rows: [{ ...ROW, custom: { pick: 'existing' } }], total: 1 })
    await flush()

    const [pickCell, noteCell] = host.querySelectorAll<HTMLElement>('td.pt-cust')
    await act(async () => { press(pickCell!) })
    const other = [...document.querySelectorAll<HTMLElement>('.rrow.opt')]
      .find((r) => r.textContent === 'other')!
    await act(async () => { press(other) })
    await flush()
    // The selected writing is left untouched: this row on the table is still the old existing
    expect(updateCalls).toHaveLength(1)

    // First use an external focusin to turn off the pick selector, and then separately dispatch the click of the note cell.
    // Prevent two state changes from being squeezed into the same rendering
    await act(async () => {
      noteCell!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      document.body.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })
    await act(async () => { noteCell!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const input = noteCell!.querySelector<HTMLInputElement>('input.celledit')!
    await act(async () => { setValue(input, '读到一半') })
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(updateCalls.map((u) => u.patch)).toEqual([
      { custom: { pick: 'other' } },
      { custom: { note: '读到一半' } },
    ])
  })

  it('选择格取消选中:发给 core 的补丁只清这一格,不带别的格', async () => {
    const host = mount()
    columnsCall.resolve(PICK_AND_NOTE)
    listCall.resolve({ rows: [{ ...ROW, custom: { note: 'x', pick: 'existing' } }], total: 1 })
    await flush()

    const pickCell = host.querySelector<HTMLElement>('td.pt-cust')!
    await act(async () => { press(pickCell) })
    const existing = [...document.querySelectorAll<HTMLElement>('.rrow.opt')]
      .find((r) => r.textContent === 'existing')!
    await act(async () => { press(existing) })
    await flush()

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]!.patch).toEqual({ custom: { pick: null } })
  })

  it('文本格清空:发给 core 的补丁把这一格设成 null,不带别的格', async () => {
    const host = mount()
    columnsCall.resolve(PICK_AND_NOTE)
    listCall.resolve({ rows: [{ ...ROW, custom: { note: '读到一半', pick: 'existing' } }], total: 1 })
    await flush()

    const [, noteCell] = host.querySelectorAll<HTMLElement>('td.pt-cust')
    await act(async () => { press(noteCell!) })
    const input = noteCell!.querySelector<HTMLInputElement>('input.celledit')!
    await act(async () => { setValue(input, '') })
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]!.patch).toEqual({ custom: { note: null } })
  })

  it('建列不乐观插入:写落地之前表头只有占位没有新列,落地之后只有新列', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const call = await startCreate(host, '建列时序')
    expect(headTexts(host)).not.toContain('建列时序')
    expect(host.querySelector('th.th-new')).not.toBeNull()

    call.resolve()
    await flush()
    expect(headTexts(host)).toContain('建列时序')
    expect(host.querySelector('th.th-new')).toBeNull()
  })

  it('建列被 core 拒:占位、打的字与选中的类型都留着,只报一条 toast 是 core 的原话;改了再回车照发', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()
    const columnsCallsAtMount = columnsCallCount

    const call = await startCreate(host, '建列时序', 'select')
    call.reject(new Error('列名重复:建列时序'))
    await flush()
    await flush()

    expect(toastMessages).toEqual(['列名重复:建列时序'])
    const input = host.querySelector<HTMLInputElement>('th.th-new input')
    expect(input).not.toBeNull()
    expect(input!.value).toBe('建列时序')
    expect(document.querySelector('[title="单选"]')!.getAttribute('aria-checked')).toBe('true')
    expect(headTexts(host)).not.toContain('建列时序')
    // After being rejected, I retrieved a column configuration from core to correct it.
    expect(columnsCallCount).toBeGreaterThan(columnsCallsAtMount)

    await act(async () => { setValue(input!, '改过的名字') })
    await act(async () => {
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await flush()
    expect(setColumnsCalls).toHaveLength(2)
    expect(setColumnsCalls[1]!.columns.custom.map((c) => c.label)).toEqual(['改过的名字'])
  })

  it('建列写在路上时按 Esc 收掉草稿:写落地时新列照样出现,之后新开、还没提交的草稿不被收', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const call = await startCreate(host, '第一次')
    const input1 = host.querySelector<HTMLInputElement>('th.th-new input')!
    await act(async () => {
      input1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(host.querySelector('th.th-new')).toBeNull()

    const plus = host.querySelector<HTMLButtonElement>('[title="新增列"]')!
    await act(async () => { plus.click() })
    const input2 = host.querySelector<HTMLInputElement>('th.th-new input')!
    await act(async () => { setValue(input2, '第二次') })

    call.resolve()
    await flush()
    expect(headTexts(host)).toContain('第一次')
    expect(host.querySelector('th.th-new input')).toBe(input2)
    expect(input2.value).toBe('第二次')
  })

  it('建列写在路上时按到占位外面:占位与字都不收,写落地后才收', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const call = await startCreate(host, '建列时序')
    const outside = host.querySelector<HTMLInputElement>('#libq')!
    await act(async () => {
      outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    expect(host.querySelector<HTMLInputElement>('th.th-new input')?.value).toBe('建列时序')

    call.resolve()
    await flush()
    expect(host.querySelector('th.th-new')).toBeNull()
    expect(headTexts(host)).toContain('建列时序')
  })

  it('单元格里一次选择被 core 拒:同一格排在后面的选择作废不发,这一格从 core 重取,只报一条 toast', async () => {
    const host = mount()
    columnsCall.resolve(MULTI_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()
    const columnsCallsAtMount = columnsCallCount
    const listCallsAtMount = listCallCount

    const cell = host.querySelector<HTMLElement>('td.pt-cust')!
    await act(async () => { press(cell) })
    await act(async () => { press(document.querySelector<HTMLElement>('.rrow.opt')!) })
    await flush()
    expect(updateCalls).toHaveLength(1)
    // The second time is ranked after the first time. It will not be counted or issued until the first time is settled.
    await act(async () => { press(document.querySelector<HTMLElement>('.rrow.opt')!) })
    await flush()
    expect(updateCalls).toHaveLength(1)

    updateCalls[0]!.reject(new Error('论文不存在:p1'))
    await flush()
    await flush()

    expect(updateCalls).toHaveLength(1)
    expect(toastMessages).toEqual(['论文不存在:p1'])
    await flush()
    expect(columnsCallCount).toBeGreaterThan(columnsCallsAtMount)
    expect(listCallCount).toBeGreaterThan(listCallsAtMount)

    // Select again. When it is rejected this time, it will be the last one in this cell; after retrieving this row from core, select the same cell again.
    // Exactly one write is issued, and the value is calculated based on the line retrieved again.
    listCall = controlled()
    await act(async () => { press(document.querySelector<HTMLElement>('.rrow.opt')!) })
    await flush()
    expect(updateCalls).toHaveLength(2)
    updateCalls[1]!.reject(new Error('论文不存在:p1'))
    await flush()
    await flush()
    listCall.resolve({ rows: [{ ...ROW, custom: { pick: ['existing'] } }], total: 1 })
    await flush()
    await act(async () => { press(document.querySelector<HTMLElement>('.rrow.opt')!) })
    await flush()
    expect(updateCalls.slice(2).map((u) => u.patch)).toEqual([{ custom: { pick: null } }])
  })

  it('格子里新建选项的加选项被 core 拒:这一次与排在后面的选择都不写格子,重取,只报一条 toast', async () => {
    const host = mount()
    columnsCall.resolve(MULTI_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()
    const columnsCallsAtMount = columnsCallCount
    const listCallsAtMount = listCallCount

    const cell = host.querySelector<HTMLElement>('td.pt-cust')!
    await act(async () => { press(cell) })
    const picker = host.querySelector<HTMLInputElement>('td.pt-cust input.celledit')!
    await act(async () => { setValue(picker, '新选项') })
    await act(async () => {
      picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await flush()
    expect(setColumnsCalls).toHaveLength(1)
    // After the typed words are cleared, the filtering is restored. This line is the existing option existing, which is ranked after the new one.
    await act(async () => { press(document.querySelector<HTMLElement>('.rrow.opt')!) })
    await flush()

    setColumnsCalls[0]!.reject(new Error('列「多选」的选项重复:新选项'))
    await flush()
    await flush()

    expect(updateCalls).toHaveLength(0)
    expect(setColumnsCalls).toHaveLength(1)
    expect(toastMessages).toEqual(['列「多选」的选项重复:新选项'])
    await flush()
    expect(columnsCallCount).toBeGreaterThan(columnsCallsAtMount)
    expect(listCallCount).toBeGreaterThan(listCallsAtMount)
  })

  it('建列的写在路上时,分组菜单的改动排在建列之后发出,载荷带着新列与这次勾选', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const create = await startCreate(host, '建列时序')
    const gear = document.querySelector<HTMLButtonElement>('.grpgear')!
    // The group menu is DropdownMenu. The trigger is only opened when the left click is pointerdown, and click is not recognized.
    await act(async () => { gear.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    const topics = [...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')]
      .find((el) => el.textContent === '主题')!
    await act(async () => { press(topics) })
    expect(setColumnsCalls).toHaveLength(1)

    create.resolve()
    await flush()
    expect(setColumnsCalls).toHaveLength(2)
    expect(setColumnsCalls[1]!.columns.custom.map((c) => c.key)).toEqual([create.columns.custom[0]!.key])
    expect(setColumnsCalls[1]!.columns.groups).toEqual(['topics'])
  })

  it('建列的写在路上时,列菜单隐藏一个内置列排在建列之后发出,载荷带着新列', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const create = await startCreate(host, '建列时序')
    const gear = host.querySelector<HTMLButtonElement>('[title="列设置"]')!
    await act(async () => { gear.click() })
    const topicsRow = [...document.querySelectorAll<HTMLElement>('.mi.colrow')]
      .find((el) => el.textContent === '主题')!
    await act(async () => { press(topicsRow) })
    expect(setColumnsCalls).toHaveLength(1)

    create.resolve()
    await flush()
    expect(setColumnsCalls).toHaveLength(2)
    expect(setColumnsCalls[1]!.columns.custom.map((c) => c.key)).toEqual([create.columns.custom[0]!.key])
    expect(setColumnsCalls[1]!.columns.hidden).toEqual(['topics'])
  })

  it('建列的写在路上时,列菜单改选项名排在建列之后发出', async () => {
    const host = mount()
    columnsCall.resolve(SELECT_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const create = await startCreate(host, '建列时序')
    const gear = host.querySelector<HTMLButtonElement>('[title="列设置"]')!
    await act(async () => { gear.click() })
    await act(async () => { document.querySelector<HTMLButtonElement>('[title="选项"]')!.click() })
    await act(async () => { document.querySelector<HTMLButtonElement>('[title="重命名选项"]')!.click() })
    // Search only in the option line. The draft placeholder for creating the column is also in the document at this time, with the same input.celledit class name.
    const input = document.querySelector<HTMLInputElement>('.mi.optrow input.celledit')!
    await act(async () => { setValue(input, 'renamed') })
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(renameOptionCalls).toHaveLength(0)

    create.resolve()
    await flush()
    expect(renameOptionCalls).toEqual([['pick', 'existing', 'renamed']])
    expect(toastMessages).toEqual([])
  })

  it('建列的写在路上时,格子里新建选项排在建列之后:先加选项(载荷带着新列),成了再写这一格', async () => {
    const host = mount()
    columnsCall.resolve(SELECT_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const create = await startCreate(host, '建列时序')
    const cell = host.querySelector<HTMLElement>('td.pt-cust')!
    await act(async () => { press(cell) })
    const picker = host.querySelector<HTMLInputElement>('td.pt-cust input.celledit')!
    await act(async () => { setValue(picker, '新选项') })
    await act(async () => {
      picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await flush()
    expect(setColumnsCalls).toHaveLength(1)
    expect(updateCalls).toHaveLength(0)

    create.resolve()
    await flush()
    expect(setColumnsCalls).toHaveLength(2)
    expect(setColumnsCalls[1]!.columns.custom.map((c) => [c.label, c.options]))
      .toEqual([['选择', ['existing', '新选项']], ['建列时序', []]])
    setColumnsCalls[1]!.resolve()
    await flush()
    expect(updateCalls.map((u) => u.patch)).toEqual([{ custom: { pick: '新选项' } }])
    expect(toastMessages).toEqual([])
  })

  it('建列的写在路上时,格子里新建选项与其后的选择都排队:建列落地后依次发出,后一次带着前一次确认的取值', async () => {
    const host = mount()
    columnsCall.resolve(MULTI_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    await startCreate(host, '建列时序')
    const create = setColumnsCalls[0]!
    const cell = host.querySelector<HTMLElement>('td.pt-cust')!
    await act(async () => { press(cell) })
    const picker = host.querySelector<HTMLInputElement>('td.pt-cust input.celledit')!
    await act(async () => { setValue(picker, '新选项') })
    await act(async () => {
      picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    // Filtering is restored after typing is cleared. This line has existing options. existing
    await act(async () => { press(document.querySelector<HTMLElement>('.rrow.opt')!) })
    await flush()
    expect(setColumnsCalls).toHaveLength(1)
    expect(updateCalls).toHaveLength(0)

    create.resolve()
    await flush()
    expect(setColumnsCalls).toHaveLength(2)
    expect(setColumnsCalls[1]!.columns.custom[0]!.options).toEqual(['existing', '新选项'])
    setColumnsCalls[1]!.resolve()
    await flush()
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]!.patch).toEqual({ custom: { pick: ['新选项'] } })
    updateCalls[0]!.resolve()
    await flush()
    expect(updateCalls).toHaveLength(2)
    expect(updateCalls[1]!.patch).toEqual({ custom: { pick: ['新选项', 'existing'] } })
    expect(toastMessages).toEqual([])
  })

  it('建列的写在路上时,第二次建列排在第一次之后发出:载荷带着两列,第二个占位等自己的写落地才收', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const first = await startCreate(host, '第一次')
    const input1 = host.querySelector<HTMLInputElement>('th.th-new input')!
    await act(async () => {
      input1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(host.querySelector('th.th-new')).toBeNull()
    const plus = host.querySelector<HTMLButtonElement>('[title="新增列"]')!
    await act(async () => { plus.click() })
    const input2 = host.querySelector<HTMLInputElement>('th.th-new input')!
    await act(async () => { setValue(input2, '第二次') })
    await act(async () => {
      input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await flush()
    expect(setColumnsCalls).toHaveLength(1)
    expect(host.querySelector('th.th-new input')).toBe(input2)
    expect(input2.value).toBe('第二次')

    first.resolve()
    await flush()
    expect(setColumnsCalls).toHaveLength(2)
    expect(setColumnsCalls[1]!.columns.custom.map((c) => c.label)).toEqual(['第一次', '第二次'])
    // The first time it landed, the second placeholder was not accepted, its words are still there
    expect(host.querySelector('th.th-new input')).toBe(input2)
    expect(input2.value).toBe('第二次')

    setColumnsCalls[1]!.resolve()
    await flush()
    expect(host.querySelector('th.th-new')).toBeNull()
    expect(headTexts(host)).toEqual(expect.arrayContaining(['第一次', '第二次']))
  })

  it('重取在一次列集合写之前发出:写等它答完才发,按它答的配置算;排在建列后的分组改动带着新列', async () => {
    const host = mount()
    columnsCall.resolve(SELECT_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()
    const columnsAtMount = columnsCallCount
    // A selection in the grid was rejected by core: PaperTable bumped itself, re-fetched the column configuration, and refused to answer.
    columnsCall = controlled()
    await act(async () => { press(host.querySelector<HTMLElement>('td.pt-cust')!) })
    await act(async () => { press(document.querySelector<HTMLElement>('.rrow.opt')!) })
    await flush()
    updateCalls[0]!.reject(new Error('论文不存在:p1'))
    await flush()
    await flush()
    expect(columnsCallCount).toBe(columnsAtMount + 1)

    await startCreate(host, '建列时序')
    expect(setColumnsCalls).toHaveLength(0)

    // When this retrieval was issued, the column configuration in core had been changed elsewhere.
    const elsewhere = { ...SELECT_COLUMNS, custom: [{ ...SELECT_COLUMNS.custom[0]!, options: ['restored'] }] }
    columnsCall.resolve(elsewhere)
    await flush()
    expect(setColumnsCalls).toHaveLength(1)
    const create = setColumnsCalls[0]!
    expect(create.columns.custom.map((c) => [c.label, c.options])).toEqual([['选择', ['restored']], ['建列时序', []]])

    const gear = document.querySelector<HTMLButtonElement>('.grpgear')!
    await act(async () => { gear.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    await act(async () => {
      press([...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')].find((el) => el.textContent === '主题')!)
    })
    expect(setColumnsCalls).toHaveLength(1)
    create.resolve()
    await flush()
    expect(setColumnsCalls[1]!.columns).toEqual({ ...create.columns, groups: ['topics'] })
  })

  it('第一次取回列配置之前改分组:改动排在这一次取数之后,按取回的配置算,已有的自定义列留着', async () => {
    mount()
    // I won’t answer papers.columns() when mounting. In the meantime, select a group from the group menu.
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const gear = document.querySelector<HTMLButtonElement>('.grpgear')!
    await act(async () => { gear.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    const readState = [...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')]
      .find((el) => el.textContent === '状态')!
    await act(async () => { press(readState) })

    columnsCall.resolve(SELECT_COLUMNS)
    await flush()
    await flush()
    expect(setColumnsCalls.map((c) => c.columns))
      .toEqual([{ hidden: [], custom: SELECT_COLUMNS.custom, groups: ['readState'] }])
  })

  it('建列的写在路上时,列菜单改类型排在建列之后发出', async () => {
    const host = mount()
    columnsCall.resolve(SELECT_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const create = await startCreate(host, '建列时序')
    await act(async () => { host.querySelector<HTMLButtonElement>('[title="列设置"]')!.click() })
    await act(async () => { document.querySelector<HTMLButtonElement>('[title="改类型"]')!.click() })
    // There is also a "multi-select" button on the layer below the column creation placeholder, which is limited to the type row of the column menu.
    await act(async () => { document.querySelector<HTMLButtonElement>('.typerow [title="多选"]')!.click() })
    expect(setColumnTypeCalls).toHaveLength(0)

    create.resolve()
    await flush()
    expect(setColumnTypeCalls.map((c) => [c.key, c.type])).toEqual([['pick', 'multi']])
  })

  it('列菜单改类型的写还在路上时,方向键从刚请求的那一档接着走', async () => {
    await openNoteTypeRow()
    await act(async () => { typeButton('文本').focus() })
    await pressKey('ArrowRight')
    await flush()
    await pressKey('ArrowLeft')
    columnsCall = controlled()
    columnsCall.resolve(NOTE_AS_SELECT)
    setColumnTypeCalls[0]!.resolve()
    for (let i = 0; i < 8; i++) await flush()
    expect(setColumnTypeCalls.map((c) => [c.key, c.type])).toEqual([['note', 'select'], ['note', 'text']])
  })

  it('列菜单改类型的写还在路上时,连点两下同一档只发一次', async () => {
    await openNoteTypeRow()
    await act(async () => { typeButton('单选').click() })
    await act(async () => { typeButton('单选').click() })
    columnsCall = controlled()
    columnsCall.resolve(NOTE_AS_SELECT)
    setColumnTypeCalls[0]!.resolve()
    for (let i = 0; i < 8; i++) await flush()
    expect(setColumnTypeCalls.map((c) => [c.key, c.type])).toEqual([['note', 'select']])
  })

  it('列菜单里点当下那一档不发改类型', async () => {
    await openNoteTypeRow()
    await act(async () => { typeButton('文本').click() })
    await flush()
    expect(setColumnTypeCalls).toHaveLength(0)
  })

  it('列菜单改类型被 core 拒:档位行回到确认的类型,方向键从它算起', async () => {
    await openNoteTypeRow()
    await act(async () => { typeButton('文本').focus() })
    await pressKey('ArrowRight')
    // Writing is still on the way: first select the "single selection" just requested for the stall line
    expect(typeButton('单选').getAttribute('aria-checked')).toBe('true')

    setColumnTypeCalls[0]!.reject(new Error('论文页写不进去'))
    for (let i = 0; i < 8; i++) await flush()
    expect(toastMessages).toEqual(['论文页写不进去'])
    expect(typeButton('文本').getAttribute('aria-checked')).toBe('true')

    await pressKey('ArrowRight')
    await flush()
    expect(setColumnTypeCalls.map((c) => [c.key, c.type])).toEqual([['note', 'select'], ['note', 'select']])
  })

  it('第一次写落地而第二次还在路上时,档位行仍选着第二次请求的那一档', async () => {
    await openNoteTypeRow()
    await act(async () => { typeButton('文本').focus() })
    await pressKey('ArrowRight')
    await flush()
    await pressKey('ArrowLeft')
    columnsCall = controlled()
    columnsCall.resolve(NOTE_AS_SELECT)
    setColumnTypeCalls[0]!.resolve()
    for (let i = 0; i < 8; i++) await flush()
    expect(typeButton('文本').getAttribute('aria-checked')).toBe('true')
    await pressKey('ArrowRight')
    for (let i = 0; i < 8; i++) await flush()
    columnsCall = controlled()
    columnsCall.resolve(NOTE_COLUMNS)
    setColumnTypeCalls[1]!.resolve()
    for (let i = 0; i < 8; i++) await flush()
    expect(setColumnTypeCalls.map((c) => [c.key, c.type])).toEqual([['note', 'select'], ['note', 'text'], ['note', 'select']])
  })
})
