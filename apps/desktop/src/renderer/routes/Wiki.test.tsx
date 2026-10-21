// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  WikiAggregation, WikiAggregationCard, WikiHome, WikiPaper, WikiProposal, WikiSignal,
} from '../../shared/contract.js'
import { IconTrash } from '../components/icons.js'
import { TOOLTIP_DELAY } from '../components/Tooltip.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const card = (id: string, title: string): WikiAggregationCard => ({
  id, kind: 'topic', kindLabel: '主题', title, summary: '', updated: '2026-10-01',
  childCount: 0, memberCount: 1, parentCount: 1,
})

const fixture = vi.hoisted(() => ({
  aggregation: vi.fn(),
  paper: vi.fn(),
  backlinks: vi.fn(),
  proposals: vi.fn(),
  signals: vi.fn(),
  open: vi.fn(),
}))

const HOME: WikiHome = {
  aggregationCount: 2,
  kinds: [{ key: 'topic', label: '主题', dir: 'topics', count: 2 }, { key: 'method', label: '方法', dir: 'methods', count: 0 }],
  roots: [card('topics/sd', '推测解码')],
}

const AGG: WikiAggregation = {
  ...card('topics/sd', '推测解码'),
  parents: [{ id: 'topics/root', title: '推理' }],
  children: [card('topics/tree', '树形草稿')],
  columns: [{ key: 'bits', label: '位宽' }],
  derivedColumns: [{ key: 'method', label: '方法' }],
  rows: [{
    paper: { id: 'papers/p1', title: 'EAGLE-2' },
    cells: { bits: { value: 'W4', page: 3, quote: 'four bits' } },
    derived: { method: [{ id: 'methods/tree', title: '树' }] },
  }],
  related: [{ label: '方法', links: [{ id: 'methods/tree', title: '树' }] }],
  claims: [],
  body: '## 背景\n\n见 [[methods/tree|树]]。\n\n## 结果\n\n略。',
  titles: { 'methods/tree': { id: 'methods/tree', title: '树' } },
  version: { fm: 'a', body: 'b' },
}

const PAPER: WikiPaper = {
  id: 'papers/p1', title: 'EAGLE-2', short: 'EAGLE-2', authors: [], venue: 'ICML', pdf: '', updated: '2026-10-01',
  body: '', titles: {}, version: { fm: 'a', body: 'b' },
  memberships: [{ aggregation: { id: 'topics/sd', title: '推测解码' }, kind: 'topic', kindLabel: '主题', cells: [] }],
}

vi.mock('../ipc.js', () => ({
  papers: {
    list: () => Promise.resolve({
      rows: [{ id: 'p1', title: 'EAGLE-2', venue: 'ICML', topics: [], noteCount: 0, conclusionCount: 0 }], total: 1,
    }),
    reading: () => new Promise(() => {}),
    get: (id: string) => Promise.resolve({ id, title: id === 'p1' ? 'EAGLE-2' : id }),
  },
  project: { list: () => Promise.resolve([{ id: 'p-47', name: '推测解码加速' }]) },
  wiki: {
    home: () => Promise.resolve(HOME),
    proposals: fixture.proposals,
    signals: fixture.signals,
    aggregation: fixture.aggregation,
    paper: fixture.paper,
    backlinks: fixture.backlinks,
    cards: () => Promise.resolve([card('topics/sd', '推测解码')]),
  },
}))

vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useCrumbTail: () => {},
  useJump: () => ({ jump: null, open: fixture.open, returnTo: vi.fn() }),
  useScreenEntry: () => 0,
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

vi.mock('../hooks/useVaultWrite.js', () => ({ useVaultWrite: () => async (op: Promise<unknown>) => { await op; return true } }))
vi.mock('../components/wiki/WikiClaims.js', () => ({ WikiClaims: () => null }))

const { Wiki } = await import('./Wiki.js')

describe('Wiki keyboard reach', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // The page title measures whether it fits, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    fixture.aggregation.mockReset().mockResolvedValue(AGG)
    fixture.paper.mockReset().mockResolvedValue(PAPER)
    fixture.backlinks.mockReset().mockResolvedValue([])
    fixture.proposals.mockReset().mockResolvedValue([])
    fixture.signals.mockReset().mockResolvedValue([])
    fixture.open.mockReset()
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(<MessagesProvider><Wiki /></MessagesProvider>)
      await Promise.resolve()
    })
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    vi.unstubAllGlobals()
  })

  const all = (selector: string) => [...host.querySelectorAll<HTMLElement>(selector)]
  const tags = (selector: string) => all(selector).map((el) => el.tagName)
  const press = async (el: HTMLElement) => {
    await act(async () => {
      el.click()
      await Promise.resolve()
    })
  }

  it('首页不给没有卡片的种类留一个空标题', () => {
    expect(all('.section-heading').map((heading) => heading.textContent)).toEqual(['主题', '论文'])
  })

  it('opens each home card from the button that holds its title', async () => {
    expect(tags('.wkcard .tt')).toEqual(['BUTTON', 'BUTTON'])
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    expect(fixture.aggregation).toHaveBeenCalledWith('topics/sd')
  })

  it('首页论文卡片是论文那一种卡片：标题整句放进两行的框里，年份、会场和主题是一行淡出的字', () => {
    const card = host.querySelector<HTMLElement>('[data-wk="papers/p1"]')!
    expect(card.classList.contains('wkcard--paper')).toBe(true)
    expect(card.querySelector('.tt > .tt-lines')?.textContent).toBe('EAGLE-2')
    expect(card.querySelector('.wm')?.matches('.fade-text')).toBe(true)
  })

  it('home, subpage and paper cards are the shared research object card in its grid variant', async () => {
    expect(all('.wkcard').map((el) => el.className)).toEqual([
      'research-object-card research-object-card--grid wkcard', 'research-object-card research-object-card--grid wkcard wkcard--paper',
    ])
    expect(all('.wkcard .tt').map((el) => el.classList.contains('research-object-card-open'))).toEqual([true, true])
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    const child = host.querySelector('.wkmain .wkcard')!
    expect(child.classList.contains('research-object-card--grid')).toBe(true)
    expect([...child.querySelectorAll('.row-actions button')].map((b) => b.getAttribute('aria-label'))).toEqual(['从这一页移出'])
  })

  it('比较表每个表头格下面都有一个单元格，自动列在表头用标签标出', async () => {
    fixture.aggregation.mockResolvedValue({ ...AGG, columns: [...AGG.columns, { key: 'speed', label: '速度' }] })
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    const heads = all('.cmp thead th').length
    expect(all('.cmp tbody tr').map((tr) => tr.children.length)).toEqual([heads])
    expect(host.querySelector('.cmp td.na')!.textContent).toBe('—')
    expect(host.querySelector('.cmp th.dv .wkind')!.textContent).toBe('自动')
  })

  it('比较表那一行的移出在行尾操作槽里，行是槽的宿主', async () => {
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    const row = host.querySelector('.cmp tbody tr')!
    expect(row.hasAttribute('data-row-actions')).toBe(true)
    expect([...row.querySelectorAll('.row-actions button')].map((b) => b.getAttribute('aria-label'))).toEqual(['从这一页移出'])
  })

  it('reaches every link, chip, contents entry and remove control of an aggregation page by keyboard', async () => {
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    expect(tags('.wkmain .wkcard .tt')).toEqual(['BUTTON'])
    expect(tags('.cmp td.rh .entity-link')).toEqual(['BUTTON'])
    expect(tags('.cmp td.dv .tagchip')).toEqual(['BUTTON'])
    expect(tags('.cmp td.rx .row-actions > *')).toEqual(['BUTTON'])
    expect(tags('.wkside .wkrel .tagchip')).toEqual(['BUTTON', 'BUTTON'])
    expect(all('.wktoc li > button').map((b) => b.textContent)).toEqual(['背景', '结果'])
    expect(tags('.wkmain .md .entity-link')).toEqual(['A'])

    await press(host.querySelector<HTMLElement>('.cmp td.dv .tagchip')!)
    expect(fixture.aggregation).toHaveBeenLastCalledWith('methods/tree')
  })

  it('比较表里的锚点是一个按钮:聚焦时显示原文,点它在阅读器里打开那篇论文的那一页', async () => {
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    const anchor = host.querySelector<HTMLButtonElement>('.cmp td .source-anchor')!
    expect([anchor.tagName, anchor.textContent, anchor.getAttribute('aria-label')]).toEqual(['BUTTON', 'p.3', '原文第 3 页'])
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
      anchor.focus()
    })
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('“four bits”')
    await press(anchor)
    expect(fixture.open).toHaveBeenCalledWith('reader', 'p1', { page: 3 })
  })

  it('论文页的「去论文列表查看」和「去阅读论文」都离开这一页,一起在屏头右端,分别到论文表里这篇和阅读器', async () => {
    expect(host.querySelector('.desk-head .page-actions')).toBeNull()
    await press(host.querySelector<HTMLElement>('[data-wk="papers/p1"] .tt')!)
    const [list, read] = [...host.querySelectorAll<HTMLButtonElement>('.desk-head > .page-actions > .btn')]
    expect([list!.textContent, read!.textContent]).toEqual(['去论文列表查看', '去阅读论文'])
    expect(host.querySelector('.wkside .btn')).toBeNull()
    expect(host.querySelector('.paper-understanding .section-heading-actions')).toBeNull()
    await press(list!)
    expect(fixture.open).toHaveBeenCalledWith('papers', 'EAGLE-2')
    await press(read!)
    expect(fixture.open).toHaveBeenLastCalledWith('reader', 'p1')
  })

  it('比较表格子里的锚点能用 Tab 停上去，悬停或聚焦都在共享 tooltip 里显示原文', async () => {
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    const anchor = host.querySelector<HTMLElement>('.cmp .source-anchor')!
    expect([anchor.tabIndex, anchor.parentElement!.textContent]).toEqual([0, 'W4 p.3'])
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
      anchor.focus()
    })
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('“four bits”')
    act(() => anchor.blur())
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    vi.useFakeTimers()
    act(() => { anchor.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
    act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
    vi.useRealTimers()
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('“four bits”')
    expect(document.querySelector('#wktip')).toBeNull()
  })

  it('右栏的反向链接在关联(论文页是归属)之下、目录之上;点一页在 Wiki 里打开,点项目、想法、对话去它们自己的屏', async () => {
    fixture.backlinks.mockResolvedValue([
      { kind: 'page', id: 'methods/tree', title: '树', kindLabel: '方法' },
      { kind: 'project', id: 'p-47', title: '推测解码加速' },
      { kind: 'idea', id: 'idea-1', title: '按接受率调树宽' },
      { kind: 'chat', id: 'chat-2', title: 'EAGLE 阅读' },
    ])
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    expect(fixture.backlinks).toHaveBeenLastCalledWith('topics/sd')
    expect(all('.wkside > .section-heading').map((heading) => heading.textContent)).toEqual(['属性', '关联', '反向链接', '目录'])
    const link = (name: string) => all('.wkside .wkrel .entity-link').find((el) => el.textContent === name)!
    await press(link('推测解码加速'))
    expect(fixture.open).toHaveBeenLastCalledWith('project', 'p-47')
    await press(link('按接受率调树宽'))
    expect(fixture.open).toHaveBeenLastCalledWith('ideas', 'idea-1')
    await press(link('EAGLE 阅读'))
    expect(fixture.open).toHaveBeenLastCalledWith('chat', 'chat-2')

    fixture.paper.mockResolvedValue({ ...PAPER, body: '## 要点\n\n略。' })
    fixture.backlinks.mockResolvedValue([{ kind: 'page', id: 'topics/sd', title: '推测解码', kindLabel: '主题' }])
    await press(host.querySelector<HTMLElement>('.cmp td.rh .entity-link')!)
    expect(fixture.backlinks).toHaveBeenLastCalledWith('papers/p1')
    expect(all('.wkside > .section-heading').map((heading) => heading.textContent)).toEqual(['属性', '归属', '反向链接', '目录'])
    fixture.aggregation.mockClear()
    await press(link('推测解码'))
    expect(fixture.aggregation).toHaveBeenLastCalledWith('topics/sd')
  })

  it('没有东西指向这一页时右栏没有反向链接这一块', async () => {
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    expect(all('.wkside > .section-heading').map((heading) => heading.textContent)).toEqual(['属性', '关联', '目录'])
  })

  it('opens a paper page membership from a button', async () => {
    await press(host.querySelector<HTMLElement>('[data-wk="papers/p1"] .tt')!)
    expect(fixture.paper).toHaveBeenCalledWith('papers/p1')
    const chip = host.querySelector<HTMLElement>('.memb .tagchip')!
    expect(chip.tagName).toBe('BUTTON')
    await press(chip)
    expect(fixture.aggregation).toHaveBeenLastCalledWith('topics/sd')
  })

  it('列设置里删除一列的是共享的图标按钮，图标有尺寸，不再是一个空方块', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    await press(host.querySelector<HTMLElement>('.cmp thead [aria-label="列设置"]')!)
    const remove = document.querySelector<HTMLButtonElement>('.coledit .row button')!
    expect([remove.className, remove.getAttribute('aria-label')]).toEqual(['icbtn sm danger', '删除列'])
    expect(remove.querySelector('svg')!.outerHTML).toBe(renderToStaticMarkup(<IconTrash />))
    vi.unstubAllGlobals()
  })
})

describe('Wiki 首页屏头的待审阅与需要整理', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  const proposal = (id: string, status: WikiProposal['status']) => ({
    id, status, received: Date.parse('2026-10-14T08:00:00Z'), reason: null, decided: null, notice: null, staleNow: false,
    proposal: { title: id, producer: { kind: 'ai', id: 'skill.meridian' }, trigger: { kind: 'manual' }, ops: [] },
    pages: [], titles: {}, claimTexts: {},
  }) as unknown as WikiProposal
  const signal = (kind: WikiSignal['kind'], page: string): WikiSignal => ({ kind, page, related: [], detail: '一句' })

  const render = async () => {
    await act(async () => {
      root!.render(<MessagesProvider><Wiki /></MessagesProvider>)
      await Promise.resolve()
    })
    for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve() })
  }
  const actions = () => [...host.querySelectorAll<HTMLButtonElement>('.desk-head > .page-actions > .btn')]
  const press = async (el: HTMLElement) => {
    await act(async () => { el.click() })
    for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve() })
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    fixture.aggregation.mockReset().mockResolvedValue(AGG)
    fixture.backlinks.mockReset().mockResolvedValue([])
    fixture.proposals.mockReset().mockResolvedValue([proposal('p1', 'queued'), proposal('p2', 'queued'), proposal('p0', 'applied')])
    fixture.signals.mockReset().mockResolvedValue([
      signal('unfiled-paper', 'papers/p1'), signal('broken-link', 'projects/p-47'), signal('broken-link', 'projects/p-47'),
      signal('single-child', 'topics/sd'), signal('open-conflict', 'topics/sd'),
    ])
    fixture.open.mockReset()
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    vi.unstubAllGlobals()
  })

  it('屏头右端是「待审阅 N」和「需要整理 N」两个普通按钮,数是灰的计数;正文只有主题、方法、论文,没有单独的待审阅按钮', async () => {
    await render()
    expect(actions().map((button) => [button.className, button.textContent, button.querySelector('.count-badge')?.textContent]))
      .toEqual([['btn', '待审阅2', '2'], ['btn', '需要整理3', '3']])
    expect(host.querySelector('.desk-body .page-toolbar, .desk-body .btn')).toBeNull()
    expect(all('.desk-body > .section-heading').map((heading) => heading.textContent)).toEqual(['主题', '论文'])
  })

  it('数为零的按钮不出现,两个都为零时屏头没有操作', async () => {
    fixture.signals.mockResolvedValue([signal('single-child', 'topics/sd')])
    await render()
    expect(actions().map((button) => button.textContent)).toEqual(['待审阅2'])
    fixture.proposals.mockResolvedValue([proposal('p0', 'applied')])
    fixture.signals.mockResolvedValue([signal('thin-aggregation', 'topics/sd')])
    act(() => root!.unmount())
    root = createRoot(host)
    await render()
    expect(actions().map((button) => button.textContent)).toEqual(['需要整理1'])
    fixture.signals.mockResolvedValue([])
    act(() => root!.unmount())
    root = createRoot(host)
    await render()
    expect(host.querySelector('.desk-head .page-actions')).toBeNull()
  })

  it('需要整理打开整理页:屏头有返回和「需要整理 · N」,一行一个信号,点一行打开它的页或项目;待审阅打开审阅队列', async () => {
    await render()
    await press(actions().find((button) => button.textContent!.startsWith('需要整理'))!)
    expect(host.querySelector('.desk-head .t')!.textContent).toBe('需要整理 · 3')
    expect(host.querySelector('.desk-head .back')).not.toBeNull()
    expect(host.querySelector('.desk-head .page-actions')).toBeNull()
    const rows = all('.desk-body .structured-row')
    expect(rows.map((row) => [row.tagName, row.textContent])).toEqual([
      ['BUTTON', '冲突推测解码'], ['BUTTON', '断链推测解码加速'], ['BUTTON', '未归类EAGLE-2'],
    ])
    await press(rows[1]!)
    expect(fixture.open).toHaveBeenCalledWith('project', 'p-47')
    await press(rows[0]!)
    expect(fixture.aggregation).toHaveBeenLastCalledWith('topics/sd')
    expect(host.querySelector('.desk-head .t')!.textContent).toBe('推测解码')
    await press(host.querySelector<HTMLElement>('.desk-head .back')!)
    await press(host.querySelector<HTMLElement>('.desk-head .back')!)
    await press(actions().find((button) => button.textContent!.startsWith('待审阅'))!)
    expect(host.querySelector('.desk-head .t')!.textContent).toBe('待审阅 · 2')
  })

  const all = (selector: string) => [...host.querySelectorAll<HTMLElement>(selector)]
})

describe('论文对比表的五行上限', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  /** The topic page with `count` member papers, so its comparison table has that many rows. */
  const withRows = (count: number): WikiAggregation => ({
    ...AGG,
    rows: Array.from({ length: count }, (_, at) => ({ ...AGG.rows[0]!, paper: { id: `papers/p${at + 1}`, title: `论文 ${at + 1}` } })),
  })

  /**
   * Lays the comparison table out from y=100, the top of its scroll box: the header row is 30px tall
   * and body row `n` is `heights[n]` tall, the way a browser would stack them.
   */
  const layOut = (heights: number[]) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('cmpwrap')) return { top: 100, bottom: 100 } as DOMRect
      const table = this.closest('.cmp')
      if (table === null || this.tagName !== 'TR') return { top: 0, bottom: 0 } as DOMRect
      const sizes = [30, ...heights]
      const at = [...table.querySelectorAll('tr')].indexOf(this as HTMLTableRowElement)
      const bottom = 100 + sizes.slice(0, at + 1).reduce((sum, height) => sum + height, 0)
      return { top: bottom - sizes[at]!, bottom } as DOMRect
    })
  }

  const open = async (rows: number) => {
    fixture.aggregation.mockReset().mockResolvedValue(withRows(rows))
    await act(async () => {
      root!.render(<MessagesProvider><Wiki /></MessagesProvider>)
      await Promise.resolve()
    })
    await act(async () => {
      host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!.click()
      await Promise.resolve()
    })
    return host.querySelector<HTMLElement>('.cmpwrap')!
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('第六行起在表里滚动，高度是表头加前五行实际渲染的高度，不按固定行高算', async () => {
    layOut([36, 36, 50, 36, 36, 36, 36])
    const wrap = await open(7)
    expect(wrap.style.maxHeight).toBe(`${30 + 36 + 36 + 50 + 36 + 36}px`)
  })

  it('五行以内不设上限，整张表留在页面流里', async () => {
    layOut([36, 36, 50, 36, 36])
    const wrap = await open(5)
    expect(wrap.style.maxHeight).toBe('')
  })
})
