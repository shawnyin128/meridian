// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProposalOp, WikiAggregation, WikiAggregationCard, WikiHome, WikiPaper, WikiProposal, WikiSignal,
} from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import { IconTrash } from '../components/icons.js'
import { TOOLTIP_DELAY } from '../components/Tooltip.js'
import { MessagesProvider } from '../messages/useMessages.js'
import type { ScreenJump } from '../shell/AppShell.js'
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
  returnTo: vi.fn(),
  jump: null as ScreenJump | null,
  apply: vi.fn(),
  undo: vi.fn(),
  /** The `onApply` the page hands its claims. */
  applyClaims: null as null | ((title: string, ops: ProposalOp[], undoNote?: string) => Promise<boolean>),
  writes: [] as { result: unknown; opts?: { note?: unknown; action?: (result: never) => { label: string; onAction: () => void } } }[],
  /** What papers.reading and wiki.cards reject with instead of answering, when a test makes them fail. */
  readingError: null as unknown,
  cardsError: null as unknown,
  /** What wiki.home answers instead of HOME, and the papers papers.list pages through instead of the one paper. */
  home: null as WikiHome | null,
  papers: null as { id: string; title: string }[] | null,
  /** The page and size of each papers.list call, in order. */
  listed: [] as { page: number; size: number }[],
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
    list: ({ page, size }: { page: number; size: number }) => {
      fixture.listed.push({ page, size })
      const all = fixture.papers ?? [{ id: 'p1', title: 'EAGLE-2' }]
      return Promise.resolve({
        rows: all.slice((page - 1) * size, page * size).map((p) => ({ ...p, venue: 'ICML', topics: [], noteCount: 0, conclusionCount: 0 })),
        total: all.length,
      })
    },
    reading: () => (fixture.readingError === null ? new Promise(() => {}) : Promise.reject(fixture.readingError)),
    get: (id: string) => Promise.resolve({ id, title: id === 'p1' ? 'EAGLE-2' : id }),
  },
  project: { list: () => Promise.resolve([{ id: 'p-47', name: '推测解码加速' }]) },
  wiki: {
    home: () => Promise.resolve(fixture.home ?? HOME),
    proposals: fixture.proposals,
    signals: fixture.signals,
    aggregation: fixture.aggregation,
    paper: fixture.paper,
    backlinks: fixture.backlinks,
    cards: () => (fixture.cardsError === null
      ? Promise.resolve([card('topics/sd', '推测解码')]) : Promise.reject(fixture.cardsError)),
    apply: fixture.apply,
  },
  changelog: { undo: fixture.undo },
}))

vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useCrumbTail: () => {},
  useJump: () => ({ jump: fixture.jump, open: fixture.open, returnTo: fixture.returnTo }),
  useScreenEntry: () => 0,
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (op: Promise<unknown>, opts?: (typeof fixture.writes)[number]['opts']) => {
    fixture.writes.push({ result: await op, ...(opts === undefined ? {} : { opts }) })
    return true
  },
}))
vi.mock('../components/wiki/WikiClaims.js', () => ({
  WikiClaims: ({ arrival, onApply }: { arrival?: string; onApply: NonNullable<typeof fixture.applyClaims> }) => {
    fixture.applyClaims = onApply
    return <i className="claims-probe" data-arrival={arrival ?? ''} />
  },
}))

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

  it('home, subpage and paper cards are the shared card Item, actionable', async () => {
    expect(all('.wkcard').map((el) => el.className)).toEqual([
      'item item--card item--slotted item--actionable wkcard', 'item item--card item--slotted item--actionable wkcard wkcard--paper',
    ])
    expect(all('.wkcard .tt').map((el) => el.classList.contains('item-open'))).toEqual([true, true])
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    const child = host.querySelector('.wkmain .wkcard')!
    expect(child.classList.contains('item--card')).toBe(true)
    expect([...child.querySelectorAll('.row-actions button')].map((b) => b.getAttribute('aria-label'))).toEqual(['从这一页移出'])
  })

  it('撤回结论的通知带撤销,按下撤销撤回最近变动里记下的那一条;别的结论写入页上看得到,不写通知', async () => {
    fixture.apply.mockResolvedValue({ change: 'c-9' })
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    const ops: ProposalOp[] = [{ op: 'retractClaim', page: 'topics/sd', claim: 'knee', reason: '撤回' }]
    await act(async () => { await fixture.applyClaims!('撤回「推测解码」的一条结论', ops, '已撤回') })
    expect(fixture.apply).toHaveBeenLastCalledWith({ source: 'user', title: '撤回「推测解码」的一条结论', ops })
    const { result, opts } = fixture.writes.at(-1)!
    expect(opts!.note).toBe('已撤回')
    const undo = opts!.action!(result as never)
    expect(undo.label).toBe('撤销')
    await act(async () => { undo.onAction() })
    expect(fixture.undo).toHaveBeenCalledWith('c-9')
    await act(async () => { await fixture.applyClaims!('给「推测解码」添加结论', ops) })
    expect([fixture.writes.at(-1)!.opts?.note, fixture.writes.at(-1)!.opts?.action]).toEqual([undefined, undefined])
  })

  it('比较表每个表头格下面都有一个单元格，自动列在表头用标签标出', async () => {
    fixture.aggregation.mockResolvedValue({ ...AGG, columns: [...AGG.columns, { key: 'speed', label: '速度' }] })
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    const heads = all('.cmp thead th').length
    expect(all('.cmp tbody tr').map((tr) => tr.children.length)).toEqual([heads])
    expect(host.querySelector('.cmp td.na')!.textContent).toBe('—')
    expect(host.querySelector('.cmp thead .wkind')!.textContent).toBe('自动')
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
    expect(tags('.cmp td.table-actions .row-actions > *')).toEqual(['BUTTON'])
    expect(tags('.split-rail .wkrel .tagchip')).toEqual(['BUTTON', 'BUTTON'])
    expect(all('.wktoc li > button').map((b) => b.textContent)).toEqual(['背景', '结果'])
    expect(tags('.wkmain .md .entity-link')).toEqual(['A'])

    await press(host.querySelector<HTMLElement>('.cmp td.dv .tagchip')!)
    expect(fixture.aggregation).toHaveBeenLastCalledWith('methods/tree')
  })

  it('点目录里的一节,正文滚到那一节的标题,标题闪一下', async () => {
    const scrolled: [string, ScrollLogicalPosition | undefined][] = []
    // jsdom lays nothing out and has no scrollIntoView.
    Element.prototype.scrollIntoView = function (this: Element, options?: boolean | ScrollIntoViewOptions) {
      scrolled.push([this.textContent ?? '', typeof options === 'object' ? options.block : undefined])
    }
    try {
      await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
      await press(all('.wktoc li > button').find((button) => button.textContent === '结果')!)
      expect(scrolled).toEqual([['结果', 'start']])
      expect([...host.querySelectorAll('.wkmain [data-arrived]')].map((heading) => heading.textContent)).toEqual(['结果'])
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView
    }
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

  it('比较表的格子先是值,再是一段不断行的「空格 + 锚点」,紧贴值的最后一个字', async () => {
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    const cell = host.querySelector<HTMLElement>('.cmp .source-anchor')!.closest('.table-text')!
    expect([...cell.childNodes].map((node) => (node instanceof Element ? `${node.className}|${node.textContent}` : node.textContent)))
      .toEqual(['W4', 'source-anchor-keep| p.3'])
  })

  it('论文页的「去论文列表查看」和「去阅读论文」都离开这一页,一起在屏头右端,分别到论文表里这篇和阅读器', async () => {
    expect(host.querySelector('.desk-head .page-actions')).toBeNull()
    await press(host.querySelector<HTMLElement>('[data-wk="papers/p1"] .tt')!)
    const [list, read] = [...host.querySelectorAll<HTMLButtonElement>('.desk-head > .page-actions > .btn')]
    expect([list!.textContent, read!.textContent]).toEqual(['去论文列表查看', '去阅读论文'])
    expect(host.querySelector('.split-rail .btn')).toBeNull()
    expect(host.querySelector('.paper-understanding .section-heading-actions')).toBeNull()
    await press(list!)
    expect(fixture.open).toHaveBeenCalledWith('papers', 'EAGLE-2')
    await press(read!)
    expect(fixture.open).toHaveBeenLastCalledWith('reader', 'p1')
  })

  it('比较表格子里的锚点能用 Tab 停上去，悬停或聚焦都在共享 tooltip 里显示原文', async () => {
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    const anchor = host.querySelector<HTMLElement>('.cmp .source-anchor')!
    expect([anchor.tabIndex, anchor.closest('td')!.textContent]).toEqual([0, 'W4 p.3'])
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
    expect(all('.split-rail > .section-heading').map((heading) => heading.textContent)).toEqual(['属性', '关联', '反向链接', '目录'])
    const link = (name: string) => all('.split-rail .rail-links .tagchip').find((el) => el.textContent === name)!
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
    expect(all('.split-rail > .section-heading').map((heading) => heading.textContent)).toEqual(['属性', '归属', '反向链接', '目录'])
    fixture.aggregation.mockClear()
    await press(link('推测解码'))
    expect(fixture.aggregation).toHaveBeenLastCalledWith('topics/sd')
  })

  it('右栏反向链接的行和上面关联的行是同一种:种类在前,后面每个都是同一种标签按钮', async () => {
    fixture.backlinks.mockResolvedValue([
      { kind: 'page', id: 'methods/tree', title: '树', kindLabel: '方法' },
      { kind: 'project', id: 'p-47', title: '推测解码加速' },
    ])
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    const rows = all('.split-rail .wkrel').map((row) => [
      row.className, ...[...row.children].map((part) => `${part.tagName} ${part.className}`),
    ])
    expect(rows.map((row) => row.slice(1))).toEqual(Array(4).fill(['SPAN rl', 'BUTTON tag tag--chip tag--neutral tagchip']))
    expect(new Set(rows.map((row) => row[0])).size).toBe(1)
  })

  it('从别的屏点链接打开一页时屏头左端有返回,按它回到来的那一屏', async () => {
    fixture.jump = { screen: 'wiki', target: 'topics/sd', from: 'chat', seq: 9 }
    try {
      await act(async () => { root!.render(<MessagesProvider><Wiki /></MessagesProvider>) })
      await act(async () => { await Promise.resolve() })
      expect(host.querySelector('.desk-head')!.firstElementChild?.classList.contains('back')).toBe(true)
      await act(async () => { host.querySelector<HTMLButtonElement>('.desk-head > .back')!.click() })
      expect(fixture.returnTo).toHaveBeenCalledWith('chat')
    } finally {
      fixture.jump = null
    }
  })

  it('从关联打开另一页再按返回,回到的那一页等内容出来后回到原来滚到的位置', async () => {
    fixture.aggregation.mockImplementation(async (id: string) => ({ ...AGG, id, title: id === 'topics/sd' ? '推测解码' : '树' }))
    // A page's main column scrolls inside itself.
    const body = () => host.querySelector<HTMLElement>('.wiki-body .split-column')!
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    body().scrollTop = 160
    await press(all('.split-rail .rail-links .tagchip').find((el) => el.textContent === '树')!)
    expect(host.querySelector('.desk-head .t')!.textContent).toBe('树')
    body().scrollTop = 40
    let arrive: (page: WikiAggregation) => void = () => {}
    fixture.aggregation.mockImplementationOnce(() => new Promise((done) => { arrive = done }))
    await press(host.querySelector<HTMLElement>('.desk-head > .back')!)
    // While the page waits behind its placeholder it has no column, so the column it gets starts at the top.
    expect(host.querySelector('.wiki-body .split-column')).toBeNull()
    await act(async () => { arrive({ ...AGG, title: '推测解码' }); await Promise.resolve() })
    expect(host.querySelector('.desk-head .t')!.textContent).toBe('推测解码')
    expect(body().scrollTop).toBe(160)
  })

  it('首页按列表屏的栏宽排，打开的一页按阅读页的栏宽排', async () => {
    const prose = () => host.querySelector('.wiki-body')!.classList.contains('desk-body--prose')
    expect(prose()).toBe(false)
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    expect(prose()).toBe(true)
  })

  it('从首页打开一页再按返回,首页回到原来滚到的位置', async () => {
    const body = () => host.querySelector<HTMLElement>('.wiki-body')!
    body().scrollTop = 120
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    body().scrollTop = 0
    await press(host.querySelector<HTMLElement>('.desk-head > .back')!)
    expect(host.querySelector('[data-wk="topics/sd"]')).not.toBeNull()
    expect(body().scrollTop).toBe(120)
  })

  it('聚合页和论文页的正文和右栏是同一个分栏页的两栏,各在自己那一栏里滚动,不随整页滚', async () => {
    const columns = () => {
      const split = host.querySelector('.wiki-body > .split-page')
      return split === null ? null : [split.className, ...[...split.children].map((column) => column.className)]
    }
    expect(columns()).toBeNull()
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    expect(columns()).toEqual(['split-page split-page--rail wkpage', 'scroll-area scroll-area--y split-column wkmain', 'scroll-area scroll-area--y split-rail'])
    await press(host.querySelector<HTMLElement>('.desk-head > .back')!)
    await press(host.querySelector<HTMLElement>('[data-wk="papers/p1"] .tt')!)
    expect(columns()).toEqual(['split-page split-page--rail wkpage', 'scroll-area scroll-area--y split-column wkmain', 'scroll-area scroll-area--y split-rail'])
  })

  it('没有东西指向这一页时右栏没有反向链接这一块', async () => {
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    expect(all('.split-rail > .section-heading').map((heading) => heading.textContent)).toEqual(['属性', '关联', '目录'])
  })

  it('opens a paper page membership from a button', async () => {
    await press(host.querySelector<HTMLElement>('[data-wk="papers/p1"] .tt')!)
    expect(fixture.paper).toHaveBeenCalledWith('papers/p1')
    const chip = host.querySelector<HTMLElement>('.memb .tagchip')!
    expect(chip.tagName).toBe('BUTTON')
    await press(chip)
    expect(fixture.aggregation).toHaveBeenLastCalledWith('topics/sd')
  })

  /** Lets the write chain a click started run to its end. */
  const settle = () => act(async () => { await new Promise((done) => setTimeout(done, 0)) })

  /** The last write's notice text and the label of the action it offers; runs that action once. */
  const undoLast = async (): Promise<[unknown, string | undefined]> => {
    const { result, opts } = fixture.writes.at(-1)!
    const action = opts?.action?.(result as never)
    await act(async () => { action?.onAction() })
    return [opts?.note, action?.label]
  }

  it('从这一页移出一个细分页,提示带撤销,撤销的是这次写入记下的那一条', async () => {
    fixture.apply.mockResolvedValue({ change: 'c-page' })
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    fixture.aggregation.mockResolvedValue({
      ...AGG, ...card('topics/tree', '树形草稿'), parents: [{ id: 'topics/sd', title: '推测解码' }],
    })
    await press(host.querySelector<HTMLElement>('.wkmain .wkcard .rx')!)
    await settle()
    expect(fixture.apply).toHaveBeenLastCalledWith({
      source: 'user', title: '把 树形草稿 从 推测解码 下移出', ops: [{ op: 'setParents', page: 'topics/tree', parents: [] }],
    })
    expect(await undoLast()).toEqual(['把 树形草稿 从 推测解码 下移出', '撤销'])
    expect(fixture.undo).toHaveBeenLastCalledWith('c-page')
  })

  it('从这一页移出一篇论文,提示带撤销,撤销的是这次写入记下的那一条', async () => {
    fixture.apply.mockResolvedValue({ change: 'c-paper' })
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    await press(host.querySelector<HTMLElement>('.cmp td.table-actions button')!)
    await settle()
    expect(fixture.apply).toHaveBeenLastCalledWith({
      source: 'user', title: '把 EAGLE-2 从 推测解码 移出', ops: [{ op: 'removeMembership', paper: 'papers/p1', in: 'topics/sd' }],
    })
    expect(await undoLast()).toEqual(['把 EAGLE-2 从 推测解码 移出', '撤销'])
    expect(fixture.undo).toHaveBeenLastCalledWith('c-paper')
  })

  it('列设置里删掉一列再保存,提示带撤销,撤销的是这次写入记下的那一条', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    fixture.apply.mockResolvedValue({ change: 'c-column' })
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    await press(host.querySelector<HTMLElement>('.cmp thead [aria-label="列设置"]')!)
    await press(document.querySelector<HTMLElement>('.coledit .row [aria-label="删除列"]')!)
    await press(document.querySelector<HTMLElement>('.coledit .btn.pri')!)
    await settle()
    expect(fixture.apply).toHaveBeenLastCalledWith({
      source: 'user', title: '改 推测解码 的列', ops: [{ op: 'setColumns', page: 'topics/sd', columns: [] }],
    })
    expect(await undoLast()).toEqual(['改 推测解码 的列', '撤销'])
    expect(fixture.undo).toHaveBeenLastCalledWith('c-column')
    vi.unstubAllGlobals()
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
  const signal = (kind: WikiSignal['kind'], page: string, related: string[] = []): WikiSignal => ({ kind, page, related, detail: '一句' })
  /** A broken link from `page` to `target`, which Core names by the target's last segment. */
  const broken = (page: string, target: string): WikiSignal => ({
    ...signal('broken-link', page, [target]), missing: { name: target.split('/').at(-1)!, trashed: false },
  })

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
      signal('unfiled-paper', 'papers/p1'), broken('projects/p-47', 'topics/old'), broken('projects/p-47', 'topics/old'),
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

  it('需要整理里冲突那一行打开它的页,并落到冲突的那条结论', async () => {
    fixture.signals.mockResolvedValue([signal('open-conflict', 'topics/sd', ['topics/sd#knee'])])
    await render()
    await press(actions().find((button) => button.textContent!.startsWith('需要整理'))!)
    await press(all('.desk-body .item')[0]!)
    expect(fixture.aggregation).toHaveBeenLastCalledWith('topics/sd')
    expect(host.querySelector('.claims-probe')!.getAttribute('data-arrival')).toBe('knee')
  })

  it('需要整理打开整理页:屏头有返回和「需要整理 · N」,一行一个信号,点一行打开它的页或项目;待审阅打开审阅队列', async () => {
    await render()
    await press(actions().find((button) => button.textContent!.startsWith('需要整理'))!)
    expect(host.querySelector('.desk-head .t')!.textContent).toBe('需要整理 · 3')
    expect(host.querySelector('.desk-head .back')).not.toBeNull()
    expect(host.querySelector('.desk-head .page-actions')).toBeNull()
    const rows = all('.desk-body .item')
    expect(rows.map((row) => [row.querySelector('.tidy-open')!.tagName, row.textContent])).toEqual([
      ['BUTTON', '结论冲突推测解码'], ['BUTTON', '链接失效推测解码加速→ old'], ['BUTTON', '未归入主题EAGLE-2'],
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

  /** Opens Wiki place `target` as a jump from another screen would, with what failed in `fail`. */
  const openFailing = async (target: string, fail: () => void) => {
    fail()
    fixture.jump = { screen: 'wiki', target, from: 'project', seq: 30 }
    try {
      await render()
    } finally {
      fixture.jump = null
      fixture.readingError = null
      fixture.cardsError = null
    }
    return [host.querySelector('.page-error')?.textContent, host.querySelectorAll('.desk-body .loading-placeholder').length]
  }
  const newer = (method: 'wiki.proposals' | 'wiki.signals' | 'wiki.cards' | 'papers.reading') => new CallError(method, 'newer-version')

  it('读审阅队列失败时，待审阅不停在读取占位上，只写出原因', async () => {
    expect(await openFailing('review', () => fixture.proposals.mockReset().mockRejectedValue(newer('wiki.proposals'))))
      .toEqual(['需要更新 App', 0])
  })

  it('读整理信号失败时，需要整理不停在读取占位上，只写出原因', async () => {
    expect(await openFailing('tidy', () => fixture.signals.mockReset().mockRejectedValue(newer('wiki.signals'))))
      .toEqual(['需要更新 App', 0])
  })

  it('读整理各行的页名失败时，需要整理不停在读取占位上，只写出原因', async () => {
    expect(await openFailing('tidy', () => { fixture.cardsError = newer('wiki.cards') })).toEqual(['需要更新 App', 0])
  })

  it('读论文的阅读记录失败时，原因写在论文页的阅读一节里，不再停在读取占位上，也不在页头重复', async () => {
    fixture.paper.mockReset().mockResolvedValue(PAPER)
    await openFailing('papers/p1', () => { fixture.readingError = newer('papers.reading') })
    expect([...host.querySelectorAll('.page-error')].map((banner) => [banner.closest('.paper-understanding') !== null, banner.textContent]))
      .toEqual([[true, '需要更新 App']])
    expect(host.querySelectorAll('.desk-body .loading-placeholder')).toHaveLength(0)
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
      if (this.classList.contains('table-scroll')) return { top: 100, bottom: 100 } as DOMRect
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
    return host.querySelector<HTMLElement>('.cmp')!.parentElement!
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

describe('Wiki 首页各节各自翻页', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    fixture.proposals.mockReset().mockResolvedValue([])
    fixture.signals.mockReset().mockResolvedValue([])
    fixture.home = {
      aggregationCount: 15,
      kinds: [{ key: 'topic', label: '主题', dir: 'topics', count: 13 }, { key: 'method', label: '方法', dir: 'methods', count: 2 }],
      roots: [
        ...Array.from({ length: 13 }, (_, at) => card(`topics/t${at + 1}`, `主题${at + 1}`)),
        ...Array.from({ length: 2 }, (_, at) => ({ ...card(`methods/m${at + 1}`, `方法${at + 1}`), kind: 'method', kindLabel: '方法' })),
      ],
    }
    fixture.papers = Array.from({ length: 30 }, (_, at) => ({ id: `p${at + 1}`, title: `论文${at + 1}` }))
    fixture.listed = []
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
    fixture.home = null
    fixture.papers = null
    vi.unstubAllGlobals()
  })

  const grid = (section: string) => host.querySelector(`.list[data-stack-section="${section}"]`)!
  const titles = (section: string) => [...grid(section).querySelectorAll('.tt')].map((title) => title.textContent)
  const pagerOf = (section: string) => {
    const next = grid(section).nextElementSibling
    return next?.classList.contains('pagebar') ? next : null
  }
  const next = async (section: string) => {
    await act(async () => {
      pagerOf(section)!.querySelector<HTMLButtonElement>('[aria-label="下一页"]')!.click()
      await Promise.resolve()
    })
  }

  it('主题、方法和论文各有自己的翻页条，紧跟在各自的卡片后，页脚里没有翻页条', () => {
    expect(host.querySelector('.desk-foot .pagebar')).toBeNull()
    expect(pagerOf('topic')!.querySelector('.pginfo')!.textContent).toBe('共 13 条')
    expect(pagerOf('method')).toBeNull()
    expect(pagerOf('papers')!.querySelector('.pginfo')!.textContent).toBe('共 30 条')
  })

  it('翻主题那一节只换主题的卡片，论文那一节不动，反过来也一样', async () => {
    expect(titles('topic')).toHaveLength(12)
    await next('topic')
    expect(titles('topic')).toEqual(['主题13'])
    expect(titles('papers')[0]).toBe('论文1')
    expect(fixture.listed.at(-1)).toMatchObject({ page: 1 })

    await next('papers')
    expect(fixture.listed.at(-1)).toMatchObject({ page: 2 })
    expect(titles('papers')[0]).toBe('论文13')
    expect(titles('topic')).toEqual(['主题13'])
    expect(titles('method')).toEqual(['方法1', '方法2'])
  })
})
