// @vitest-environment jsdom
import { act, Profiler, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Facet, ListParams, PaperColumns, PaperImportResult, PaperRow } from '../../shared/contract.js'
import { PAPER_COLUMNS } from '../../shared/vocabulary.js'
import { IconTrash } from '../components/icons.js'
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
/** A created select column with one option: a cell's picker adds options, the column menu renames them. */
const SELECT_COLUMNS: PaperColumns = {
  hidden: [], groups: [],
  custom: [{ key: 'pick', label: '选择', type: 'select', options: ['existing'] }],
}
/** A created multi-select column with one option: several values can be picked one after another in one cell. */
const MULTI_COLUMNS: PaperColumns = {
  hidden: [], groups: [],
  custom: [{ key: 'pick', label: '多选', type: 'multi', options: ['existing'] }],
}
/** A select column and a text column: in one row, pick in the select cell first, then save the text cell. */
const PICK_AND_NOTE: PaperColumns = {
  hidden: [], groups: [],
  custom: [
    { key: 'pick', label: '选择', type: 'select', options: ['existing', 'other'] },
    { key: 'note', label: '备注', type: 'text', options: [] },
  ],
}
/** One custom text column, the note column, whose type the tests change in the column menu. */
const NOTE_COLUMNS: PaperColumns = {
  hidden: [], groups: [], custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
}
/** The columns Core confirms after the note column becomes a single-select column. */
const NOTE_AS_SELECT: PaperColumns = {
  hidden: [], groups: [], custom: [{ key: 'note', label: '备注', type: 'select', options: [] }],
}

let columnsCall: Controlled<PaperColumns>
let listCall: Controlled<{ rows: PaperRow[]; total: number }>
let getCall: Controlled<PaperRow>
let importCall: Controlled<PaperImportResult> & { filename: string; bytes: Uint8Array }
/** Each papers.setColumns call's own controlled promise, in the order the calls were made. */
let setColumnsCalls: (Controlled<void> & { columns: PaperColumns })[]
/** Each papers.update has its own controlled promise, arranged in the order in which it was initiated. */
let updateCalls: (Controlled<void> & { id: string; patch: Record<string, unknown> })[]
/** The arguments of each papers.renameOption call, in the order the calls were made. */
let renameOptionCalls: [key: string, from: string, to: string][]
/** Each papers.setColumnType call's own controlled promise, in the order the calls were made. */
let setColumnTypeCalls: (Controlled<void> & { key: string; type: string })[]
/** The text of each toast, in the order shown. */
let toastMessages: string[]
let deletedPapers: string[]
/** An error the next papers.update throws synchronously, instead of rejecting, to simulate an unexpected throw. */
let throwOnNextUpdate: Error | null
/** How many times papers.columns / papers.list were called, including the calls on mount. */
let columnsCallCount: number
let listCallCount: number
let listParams: ListParams[]
/** What usePaperCount returns: the vault's paper count, or null before it has been fetched. */
let vaultPaperCount: number | null
/** The group values papers.facets answers with. */
let facetRows: Facet[]
let openedScreens: [screen: string, id?: string][]
/** How many times the table bumped the vault revision. */
let bumps: number

vi.mock('../ipc.js', () => ({
  papers: {
    list: (params: ListParams) => { listCallCount += 1; listParams.push(params); return listCall.promise },
    facets: () => Promise.resolve(facetRows),
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
      // As in Core, the columns a landed write sent are what papers.columns answers from then on.
      return c.promise.then(() => {
        columnsCall = controlled()
        columnsCall.resolve(columns)
      })
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
  usePaperCount: () => vaultPaperCount,
  useScreen: () => 'papers',
  useToast: () => (message: string) => { toastMessages.push(message) },
  // Only real revision state makes bump re-run the effects that fetch on revision, as in the app.
  useVaultRevision: () => {
    const [revision, setRevision] = useState(0)
    return { revision, bump: () => { bumps += 1; setRevision((r) => r + 1) } }
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

/** Mounts the table in a real container and returns the container. */
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

/** Sets an input's value through the native setter React tracks, then dispatches input; works controlled or not. */
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
 * Drafts a new column: opens the draft header, picks `type` (the default "text" if not given), fills
 * in the name, presses Enter, and returns the papers.setColumns call that started.
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

/** Mounts a table whose only custom column is the note column, opens the column menu and its type row. */
async function openNoteTypeRow(): Promise<void> {
  const host = mount()
  columnsCall.resolve(NOTE_COLUMNS)
  listCall.resolve({ rows: [ROW], total: 1 })
  await flush()
  await act(async () => { host.querySelector<HTMLButtonElement>('[title="列设置"]')!.click() })
  await act(async () => { document.querySelector<HTMLButtonElement>('[title="改类型"]')!.click() })
}

/** The option button titled `title` in the column menu's type row. */
function typeButton(title: string): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(`.typerow [title="${title}"]`)!
}

/** Presses `key` on the element currently holding focus. */
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
    vaultPaperCount = null
    facetRows = []
    openedScreens = []
    bumps = 0
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

  it('标题的篇数就是表格在搜索、阅读状态筛选与分组取值之下的行数，没有筛选时是论文库的总数', async () => {
    vaultPaperCount = 10
    facetRows = [{ value: 'speculative decoding', count: 4, newestTitle: '一篇论文' }]
    const host = mount()
    columnsCall.resolve({ hidden: [], custom: [], groups: ['topics', 'readState'] })
    listCall.resolve({ rows: [ROW], total: 10 })
    await flush()
    const title = () => host.querySelector('.desk-head .t')?.textContent
    expect(host.querySelectorAll('.ptable tbody tr .pt-title')).toHaveLength(1)
    expect(title()).toBe('论文 · 10')

    listCall = controlled()
    const input = host.querySelector<HTMLInputElement>('#libq')!
    act(() => setValue(input, 'note phrase'))
    listCall.resolve({ rows: [], total: 0 })
    await flush()
    expect(host.querySelectorAll('.ptable tbody tr .pt-title')).toHaveLength(0)
    expect(title()).toBe('论文 · 0')
    listCall = controlled()
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="清除论文搜索"]')!.click())
    listCall.resolve({ rows: [ROW], total: 10 })
    await flush()
    expect(title()).toBe('论文 · 10')

    listCall = controlled()
    await act(async () => {
      host.querySelector('.filters .read-state-filter')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    await act(async () => {
      press([...document.querySelectorAll('.ctxmenu .mi')].find((item) => item.textContent?.includes('未读'))!)
    })
    listCall.resolve({ rows: [ROW], total: 3 })
    await flush()
    expect(listParams.at(-1)?.facet).toEqual({ field: 'readState', value: '未读' })
    expect(title()).toBe('论文 · 3')

    listCall = controlled()
    const groups = host.querySelector('.filters .segmented-control[aria-label="分组字段"]')!
    await act(async () => {
      [...groups.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === '主题')!.click()
    })
    await flush()
    expect(title()).toBe('论文 · 10')
    await act(async () => { host.querySelector<HTMLElement>('.gxrow')!.click() })
    listCall.resolve({ rows: [ROW], total: 4 })
    await flush()
    expect(listParams.at(-1)?.facet).toEqual({ field: 'topics', value: 'speculative decoding' })
    expect(title()).toBe('论文 · 4')
  })

  it('论文搜索框与关注屏的一句话添加框是同一种带框的字段输入框', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    expect(host.querySelector('#libq')?.classList).toContain('form-control-field')
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

  it('放不下的自定义文本格与随笔格一样标成截断,整段字装在悬停展开的 .ci 里', async () => {
    const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
      .mockImplementation(function () { return this.classList.contains('ci') ? 200 : 0 })
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockImplementation(function () { return this.classList.contains('ci') ? 100 : 0 })
    try {
      const host = mount()
      const text = '一段比格子宽得多的文字'
      columnsCall.resolve(NOTE_COLUMNS)
      listCall.resolve({ rows: [{ ...ROW, remark: text, custom: { note: text } }], total: 1 })
      await flush()

      const cells = ['td.pt-remark', 'td.pt-cust'].map((selector) => {
        const td = host.querySelector<HTMLElement>(selector)!
        return { trunc: td.classList.contains('trunc'), ci: td.querySelector('.ci')?.textContent }
      })
      expect(cells).toEqual([{ trunc: true, ci: text }, { trunc: true, ci: text }])
    } finally {
      scrollWidth.mockRestore()
      clientWidth.mockRestore()
    }
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

  it('论文行是操作槽的宿主，行尾的删除在槽里', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()
    const row = host.querySelector('.ptable tbody tr')!
    expect(row.hasAttribute('data-row-actions')).toBe(true)
    expect([...row.querySelectorAll('.row-actions button')].map((item) => item.getAttribute('aria-label'))).toEqual(['删除'])
  })

  it('行尾的删除把论文移到垃圾桶，画的是垃圾桶而不是关闭用的叉', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()
    const remove = host.querySelector<HTMLButtonElement>('.ptable tbody tr .rowx')!
    expect(remove.getAttribute('aria-label')).toBe('删除')
    expect(remove.querySelector('svg')!.outerHTML).toBe(renderToStaticMarkup(<IconTrash />))
  })

  it('能排序的表头里各有一个排序按钮，按它排序，表头报出排序方向', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const header = (key: string) => host.querySelector<HTMLElement>(`.ptable th[data-k="${key}"]`)!
    expect(['title', 'authors', 'year'].map((key) => header(key).querySelector(':scope > button')?.tagName))
      .toEqual(['BUTTON', 'BUTTON', 'BUTTON'])
    expect(header('year').getAttribute('aria-sort')).toBeNull()
    await act(async () => { header('year').querySelector<HTMLElement>(':scope > button')!.click() })
    await flush()
    expect(listParams.at(-1)).toMatchObject({ sort: 'year', direction: 'desc' })
    expect(header('year').getAttribute('aria-sort')).toBe('descending')
  })

  it('聚焦的论文行按回车打开详情，行里按钮上的回车不算', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const row = host.querySelector<HTMLElement>('.ptable tbody tr')!
    const enter = (target: Element) => act(async () => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    getCall.resolve(ROW)
    await enter(row.querySelector('.rowx')!)
    await flush()
    expect(row.classList).not.toContain('selected')
    await enter(row)
    await flush()
    expect(row.classList).toContain('selected')
  })

  it('分组索引里的每个值都是按钮，按它列出这一组的论文', async () => {
    facetRows = [{ value: '推理', count: 2, newestTitle: '一篇论文' }]
    const host = mount()
    columnsCall.resolve({ hidden: [], custom: [], groups: ['topics'] })
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const topics = [...host.querySelectorAll<HTMLElement>('.filters .segmented-control > button')]
      .find((button) => button.textContent === '主题')!
    await act(async () => { topics.click() })
    await flush()
    const value = host.querySelector<HTMLElement>('.gxrow')!
    expect(value.tagName).toBe('BUTTON')
    await act(async () => { value.click() })
    await flush()
    expect(listParams.at(-1)?.facet).toEqual({ field: 'topics', value: '推理' })
  })

  it('选定分组取值后，取值换成一个选择器：按钮显示当前值，从菜单里换一个值就列出那一组', async () => {
    facetRows = [
      { value: '推理', count: 2, newestTitle: '一篇论文' },
      { value: '检索', count: 1, newestTitle: '一篇论文' },
    ]
    const host = mount()
    columnsCall.resolve({ hidden: [], custom: [], groups: ['topics'] })
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()
    const topics = [...host.querySelectorAll<HTMLElement>('.filters .segmented-control > button')]
      .find((button) => button.textContent === '主题')!
    await act(async () => { topics.click() })
    await flush()
    await act(async () => { host.querySelector<HTMLElement>('.gxrow')!.click() })
    await flush()

    expect(host.querySelector('.gnav .segmented-control')).toBeNull()
    const picker = host.querySelector<HTMLButtonElement>('.gnav button[aria-label="分组取值"]')!
    expect(picker.textContent).toBe('推理(2)')
    expect(picker.className).toBe(host.querySelector('#gxBack')!.className)
    await act(async () => { picker.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    await flush()
    const items = [...document.querySelectorAll<HTMLElement>('.ctxmenu [role="menuitemradio"]')]
    expect(items.map((item) => [item.textContent, item.getAttribute('aria-checked'), item.querySelectorAll('svg').length]))
      .toEqual([['推理2', 'true', 1], ['检索1', 'false', 0]])
    await act(async () => { press(items[1]!) })
    await flush()
    expect(listParams.at(-1)?.facet).toEqual({ field: 'topics', value: '检索' })
    expect(host.querySelector('.gnav button[aria-label="分组取值"]')!.textContent).toBe('检索(1)')
  })

  it('列设置里能显隐的内置列是按钮并报出是否显示，锁定的列不是按钮', async () => {
    const host = mount()
    columnsCall.resolve({ hidden: ['venue'], custom: [], groups: [] })
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    await act(async () => { host.querySelector<HTMLButtonElement>('[title="列设置"]')!.click() })
    const row = (label: string) => [...document.querySelectorAll<HTMLElement>('.mi.colrow')]
      .find((el) => el.textContent === label)!
    expect([row('主题').tagName, row('主题').getAttribute('aria-pressed')]).toEqual(['BUTTON', 'true'])
    expect([row('发表').tagName, row('发表').getAttribute('aria-pressed')]).toEqual(['BUTTON', 'false'])
    expect(row('作者').tagName).toBe('DIV')
  })

  it('列设置只在能点着显隐的行上打勾，自定义列的行不打勾', async () => {
    const host = mount()
    columnsCall.resolve({ ...SELECT_COLUMNS, hidden: ['venue'] })
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    await act(async () => { host.querySelector<HTMLButtonElement>('[title="列设置"]')!.click() })
    const checked = (label: string) => [...document.querySelectorAll<HTMLElement>('.mi.colrow')]
      .find((el) => el.textContent === label)!.querySelector('.ck svg') !== null
    expect([checked('主题'), checked('发表'), checked('选择')]).toEqual([true, false, false])
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
    // CSS owns the responsive width entirely; an inline pixel min-width would bring back horizontal scrolling.
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

  it('论文行的右键菜单用方向键在条目间移动,Home 与 End 到两头,只有当前条目是 Tab 停靠点', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const row = host.querySelector<HTMLElement>('.ptable tbody tr')!
    row.focus()
    await act(async () => { row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true })) })
    const items = [...document.body.querySelectorAll<HTMLElement>('.paper-row-menu [role="menuitem"]')]
    // Radix moves the roving focus on the next task, not inside the keydown.
    const key = async (name: string) => {
      await act(async () => {
        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))
        await new Promise((done) => setTimeout(done, 0))
      })
    }
    expect(document.activeElement).toBe(items[0])
    await key('ArrowDown')
    expect(document.activeElement).toBe(items[1])
    expect(items.filter((item) => item.tabIndex === 0)).toEqual([items[1]])
    await key('End')
    expect(document.activeElement).toBe(items.at(-1))
    await key('Home')
    expect(document.activeElement).toBe(items[0])
  })

  it('论文行的右键菜单可以直接在阅读器中打开这篇论文', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    const row = host.querySelector<HTMLElement>('.ptable tbody tr')!
    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 80 }))
    })
    const items = [...document.body.querySelectorAll<HTMLElement>('.paper-row-menu [role="menuitem"]')]
    expect(items.map((item) => item.textContent)).toEqual(['打开详情', '在阅读器中打开', '移到垃圾桶'])
    await act(async () => { press(items[1]!) })
    expect(openedScreens).toEqual([['reader', ROW.id]])
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

  it('表格和详情用同一组评分、阅读状态与主题编辑：点当前那颗星清空评分，状态是同一个选择器，主题是带 × 的标签加 +', async () => {
    const rated = { ...ROW, rating: 4, topics: ['推理', '检索'] }
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [rated], total: 1 })
    await flush()

    const row = host.querySelector<HTMLElement>('.ptable tbody tr')!
    await act(async () => { row.querySelector<HTMLButtonElement>('.rating-stars [aria-label="4 星"]')!.click() })
    expect(updateCalls.at(-1)!.patch).toEqual({ rating: null })
    await act(async () => {
      [...row.querySelectorAll<HTMLElement>('.tagchip')].find((chip) => chip.textContent === '检索')!
        .querySelector<HTMLButtonElement>('button')!.click()
    })
    expect(updateCalls.at(-1)!.patch).toEqual({ topics: ['推理'] })

    await act(async () => { press(row.querySelector<HTMLElement>('td')!) })
    getCall.resolve(rated)
    await flush()
    const panel = host.querySelector<HTMLElement>('.pdetail .paper-meta')!
    expect(panel.querySelector('select')).toBeNull()
    const tableStatus = row.querySelector('.stchip')!
    const panelStatus = panel.querySelector('.stchip')!
    expect([panelStatus.tagName, panelStatus.getAttribute('aria-haspopup'), panelStatus.textContent])
      .toEqual([tableStatus.tagName, tableStatus.getAttribute('aria-haspopup'), tableStatus.textContent])
    expect([...panel.querySelectorAll('.tagchip:not(.tagadd)')].map((chip) => chip.textContent))
      .toEqual(expect.arrayContaining(['推理', '检索']))
    expect(panel.querySelector('.tagadd')).not.toBeNull()
  })

  it('详情里的标题和短标题按 LaTeX 显示，点开编辑时仍是原文', async () => {
    const latex = { ...ROW, title: '\\textbf{F}luxBin $\\times$', shortTitle: '\\emph{Flux}' }
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [latex], total: 1 })
    await flush()
    await act(async () => { press(host.querySelector<HTMLElement>('.ptable tbody tr')!) })
    getCall.resolve(latex)
    await flush()

    const [title, short] = [...host.querySelectorAll<HTMLElement>('.paper-meta-list .paper-meta-editable')]
    expect(title!.innerHTML).toMatch(/<strong>F<\/strong>luxBin <span><span class="katex">/)
    expect(short!.innerHTML).toContain('<em>Flux</em>')
    await act(async () => { title!.querySelector('button')!.click() })
    expect(title!.querySelector<HTMLInputElement>('input, textarea')!.value).toBe('\\textbf{F}luxBin $\\times$')
  })

  it('详情的论文信息直接列出，不带「元数据」标题，并按 LaTeX 显示摘要', async () => {
    const withAbstract = { ...ROW, abstract: '我们提出 \\textbf{FluxBin}，把误差降到 $O(n)$。' }
    // The folded abstract measures itself, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [withAbstract], total: 1 })
    await flush()
    await act(async () => { press(host.querySelector<HTMLElement>('.ptable tbody tr')!) })
    getCall.resolve(withAbstract)
    await flush()

    const panel = host.querySelector<HTMLElement>('.paper-meta')!
    expect(panel.textContent).not.toContain('元数据')
    expect(panel.firstElementChild!.tagName).toBe('DL')
    const labels = [...panel.querySelectorAll('dt')].map((dt) => dt.textContent)
    const abstract = panel.querySelectorAll('dd')[labels.indexOf('摘要')]!
    expect(labels.indexOf('摘要')).toBe(labels.indexOf('作者') + 1)
    expect(abstract.innerHTML).toContain('<strong>FluxBin</strong>')
    expect(abstract.querySelector('.katex')).not.toBeNull()
    vi.unstubAllGlobals()
  })

  it('详情面板收掉建列草稿之后,关面板新开的草稿不受它落地影响', async () => {
    const host = mount()
    columnsCall.resolve(EMPTY_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()

    await startCreate(host, '第一次')
    expect(setColumnsCalls).toHaveLength(1)

    // Clicking a row opens the details panel, which calls setNewCol(false) directly, not NewColumnHead's onCancel.
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

    // The first column write lands: the details panel already dismissed that draft, so the second must stay as is.
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

    // The write has not landed yet: the draft header, the type popover and the selected option all stay.
    expect(host.querySelector('th.th-new')).not.toBeNull()
    const selectBtn = document.querySelector<HTMLButtonElement>('[title="单选"]')!
    expect(selectBtn.getAttribute('aria-checked')).toBe('true')
    expect(selectBtn.className).toContain('on')

    call.resolve()
    await flush()
    // Once it lands, the draft header and the type popover close together, with not one frame of overlap
    // (the next test checks this frame by frame).
    expect(host.querySelector('th.th-new')).toBeNull()
    expect(document.querySelector('[data-radix-popper-content-wrapper]')).toBeNull()
  })

  // A Profiler snapshots the table header at every commit; after the column write lands, no commit may
  // show both the draft header and the new column, or neither. act commits in batches at its own flush
  // points, so one flush point is the finest grain this can tell apart.
  it('建列写成时,新列出现与占位(连同类型层)撤下落在同一次提交里,不会有只画一半的一帧', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    /** The table header after each commit: whether the draft header is there and whether the new column is. */
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
    snapshots.length = 0 // Only the commits after the write lands count

    setColumnsCalls[0]!.resolve()
    await flush()

    expect(snapshots.length).toBeGreaterThan(0)
    // Every commit shows exactly one of the draft header and the new column, never both or neither.
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

    // First pick an existing option in the multi-select cell: it creates no option, so it enters the
    // chain and is sent at once; leave it pending.
    const cell = host.querySelector<HTMLElement>('td.pt-cust')!
    await act(async () => { press(cell) })
    const existingRow = document.querySelector<HTMLElement>('.rrow.opt')!
    await act(async () => { press(existingRow) })
    await flush()
    expect(updateCalls).toHaveLength(1)
    const firstUpdate = updateCalls[0]!

    // Then submit a new option: it queues behind the first pick. The column creation has not landed
    // yet, so the closure captured at submission lacks the new column.
    const picker = host.querySelector<HTMLInputElement>('td.pt-cust input.celledit')!
    await act(async () => { setValue(picker, '新选项') })
    await act(async () => {
      picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await flush()
    expect(setColumnsCalls).toHaveLength(1) // Queued behind the first pick, it has not written yet.

    // The column creation lands: the columns Core confirmed now include the new column
    createCall.resolve()
    await flush()

    // Only once the first write lands does the chain move on to running the second option.
    firstUpdate.resolve()
    await flush()

    // The second option's actual write: its payload carries the new column, not the closure's copy from
    // submission time, which lacks it.
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

    // Submit the first new option: with no column creation to wait for, it enters the chain and writes
    // at once; leave it pending as a gate.
    const picker = host.querySelector<HTMLInputElement>('td.pt-cust input.celledit')!
    await act(async () => { setValue(picker, '新选项A') })
    await act(async () => {
      picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await flush()
    expect(setColumnsCalls).toHaveLength(1)
    const firstSetColumns = setColumnsCalls[0]!

    // Then submit the second new option: it queues behind the first, which has not landed yet.
    await act(async () => { setValue(picker, '新选项B') })
    await act(async () => {
      picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await flush()
    expect(setColumnsCalls).toHaveLength(1) // Queued behind the first, it has not had its turn yet

    // The first one lands: setColumns completes, and the papers.update it sends next needs an answer too.
    firstSetColumns.resolve()
    await flush()
    expect(updateCalls).toHaveLength(1)
    updateCalls[0]!.resolve()
    await flush()

    // The second one writes now, with the values confirmed after the first landed, not the ones computed
    // from the columns and row at submission (before the first landed), which would miss option A.
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
    // The throw happened before any controlled promise was recorded, so this pick left no papers.update call.
    expect(updateCalls).toHaveLength(0)

    // Pick in the same cell again: the error did not jam the queue; the write is computed and sent as usual.
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
    // The pick's write is left pending: the table's row still holds the old 'existing'.
    expect(updateCalls).toHaveLength(1)

    // Close the pick cell's picker with a focusin outside it first, then dispatch the note cell's click
    // separately, so the two state changes do not land in the same render.
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
    // After the rejection, the table fetched the columns from Core again to correct itself.
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
    // The second pick queues behind the first; it is neither computed nor sent until the first settles.
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

    // Pick again; this time the rejected pick is the cell's last one. After the row is fetched again
    // from Core, a pick in the same cell sends exactly one write, computed from the refetched row.
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
    // With the typed text cleared, the filter is lifted and this row is the existing option; this pick
    // queues behind the new option.
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
    // The group menu is a Radix DropdownMenu: its trigger opens on a left-button pointerdown and ignores click.
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
    // Look only inside the option row: the column draft header is in the document too, with the same
    // input.celledit class.
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

  it('删一列的写落地之后推一次库的版本,侧栏的数与最近变动跟着重取', async () => {
    const host = mount()
    columnsCall.resolve(NOTE_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()
    await act(async () => { host.querySelector<HTMLButtonElement>('[title="列设置"]')!.click() })
    await act(async () => { document.querySelector<HTMLButtonElement>('[title="删除列"]')!.click() })
    expect(setColumnsCalls.map((c) => c.columns.custom)).toEqual([[]])

    const before = bumps
    await act(async () => { setColumnsCalls[0]!.resolve() })
    await flush()
    expect(bumps).toBe(before + 1)
    expect(headTexts(host)).not.toContain('备注')
  })

  it('列菜单里改列名、改选项名,点到菜单外都像回车一样改掉', async () => {
    const host = mount()
    columnsCall.resolve(SELECT_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()
    const gear = host.querySelector<HTMLButtonElement>('[title="列设置"]')!
    // Radix closes the menu on the click that ends the press, once the rename has been accepted.
    const pressOutside = async () => {
      await act(async () => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) })
      await act(async () => { press(document.body) })
      await flush()
    }

    await act(async () => { gear.click() })
    await act(async () => { document.querySelector<HTMLButtonElement>('[title="重命名列"]')!.click() })
    await act(async () => { setValue(document.querySelector<HTMLInputElement>('.mi.colrow input.celledit')!, '挑选') })
    await pressOutside()
    expect(setColumnsCalls.at(-1)?.columns.custom.map((c) => c.label)).toEqual(['挑选'])
    expect(document.querySelector('.mi.colrow')).toBeNull()
    await act(async () => { setColumnsCalls.at(-1)!.resolve() })
    await flush()

    await act(async () => { gear.click() })
    await act(async () => { document.querySelector<HTMLButtonElement>('[title="选项"]')!.click() })
    await act(async () => { document.querySelector<HTMLButtonElement>('[title="重命名选项"]')!.click() })
    await act(async () => { setValue(document.querySelector<HTMLInputElement>('.mi.optrow input.celledit')!, 'renamed') })
    await pressOutside()
    expect(renameOptionCalls).toEqual([['pick', 'existing', 'renamed']])

    // A name another column already has is refused: the menu, the input and its text stay.
    await act(async () => { gear.click() })
    await act(async () => { document.querySelector<HTMLButtonElement>('[title="重命名列"]')!.click() })
    await act(async () => { setValue(document.querySelector<HTMLInputElement>('.mi.colrow input.celledit')!, '标题') })
    await pressOutside()
    const refused = document.querySelector<HTMLInputElement>('.mi.colrow input.celledit')!
    expect(refused.value).toBe('标题')
    expect(refused.getAttribute('aria-invalid')).toBe('true')
  })

  it('列菜单改列名时输入法组字的 Esc 与回车归输入法:重命名不撤也不提交;组完字后 Esc 只撤重命名', async () => {
    const host = mount()
    columnsCall.resolve(SELECT_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()
    await act(async () => { host.querySelector<HTMLButtonElement>('[title="列设置"]')!.click() })
    await act(async () => { document.querySelector<HTMLButtonElement>('[title="重命名列"]')!.click() })
    const input = document.querySelector<HTMLInputElement>('.mi.colrow input.celledit')!
    await act(async () => { setValue(input, '挑选') })
    for (const key of ['Escape', 'Enter']) {
      await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key, isComposing: true, bubbles: true })) })
    }
    expect(document.querySelector('.mi.colrow input.celledit')).toBe(input)
    expect(setColumnsCalls).toEqual([])

    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(document.querySelector('.mi.colrow input.celledit')).toBeNull()
    expect(document.querySelector('[title="重命名列"]')).not.toBeNull()
  })

  it('列菜单改列名时点菜单里别的地方:先存下这一列;名字重了就带着字留着标红,另一列的重命名不开', async () => {
    const host = mount()
    columnsCall.resolve(PICK_AND_NOTE)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()
    await act(async () => { host.querySelector<HTMLButtonElement>('[title="列设置"]')!.click() })
    const pencil = (at: number) => document.querySelectorAll<HTMLButtonElement>('[title="重命名列"]')[at]!
    const renameInput = () => document.querySelector<HTMLInputElement>('.mi.colrow input.celledit')
    /** Presses `el` in the menu as a user would: the press, then the click. */
    const pressInMenu = async (el: Element) => {
      await act(async () => { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) })
      await act(async () => { press(el) })
      await flush()
    }

    await act(async () => { pencil(0).click() })
    await act(async () => { setValue(renameInput()!, '挑选') })
    await pressInMenu([...document.querySelectorAll('.mi.colrow')].find((row) => row.textContent === '主题')!)
    expect(setColumnsCalls[0]?.columns.custom.map((c) => c.label)).toEqual(['挑选', '备注'])
    expect(renameInput()).toBeNull()
    await act(async () => { setColumnsCalls[0]!.resolve() })
    await flush()

    await act(async () => { pencil(1).click() })
    await act(async () => { setValue(renameInput()!, '标题') })
    await pressInMenu(pencil(0))
    expect(renameInput()!.value).toBe('标题')
    expect(renameInput()!.getAttribute('aria-invalid')).toBe('true')
    expect(setColumnsCalls).toHaveLength(2)
  })

  it('文本格离开时的写还在路上就点了另一格:写成了才开那一格;写被拒时原格带着字留着并标红', async () => {
    const host = mount()
    columnsCall.resolve(NOTE_COLUMNS)
    listCall.resolve({ rows: [ROW], total: 1 })
    await flush()
    const noteCell = host.querySelector<HTMLElement>('td.pt-cust')!
    const remarkCell = host.querySelector<HTMLElement>('td.pt-remark')!
    /** Types `value` into the note cell, then presses on the remark cell as a user would. */
    const typeThenOpenRemark = async (value: string) => {
      await act(async () => { press(noteCell) })
      await act(async () => { setValue(noteCell.querySelector<HTMLInputElement>('input')!, value) })
      await act(async () => { remarkCell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) })
      await act(async () => { press(remarkCell) })
    }

    await typeThenOpenRemark('读到一半')
    expect(updateCalls.map((u) => u.patch)).toEqual([{ custom: { note: '读到一半' } }])
    expect(remarkCell.querySelector('input')).toBeNull()
    await act(async () => { updateCalls[0]!.resolve() })
    await flush()
    expect(noteCell.querySelector('input')).toBeNull()
    expect(remarkCell.querySelector('input')).not.toBeNull()
    await act(async () => {
      remarkCell.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    await typeThenOpenRemark('写不进去')
    await act(async () => { updateCalls[1]!.reject(new Error('论文不存在')) })
    await flush()
    const kept = noteCell.querySelector<HTMLInputElement>('input')!
    expect(kept.value).toBe('写不进去')
    expect(kept.getAttribute('aria-invalid')).toBe('true')
    expect(remarkCell.querySelector('input')).toBeNull()
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
    // With the typed text cleared, the filter is lifted and this row is the existing option.
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
    // The first write landed; the second draft header stays open, its text still there.
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
    // Core rejects a pick in a cell: PaperTable bumps itself and fetches the columns again, and the test
    // leaves that fetch unanswered for now.
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
    // Leave the papers.columns() call on mount unanswered, and meanwhile pick a group in the group menu.
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
    // The column draft header's popover also has a multi-select button, so look only in the column menu's type row.
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
    // The write is still in flight: the type row already selects the requested single-select option.
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
