// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WikiAggregation, WikiAggregationCard, WikiHome, WikiPaper } from '../../shared/contract.js'
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
  },
  wiki: {
    home: () => Promise.resolve(HOME),
    proposals: () => Promise.resolve([]),
    aggregation: fixture.aggregation,
    paper: fixture.paper,
    cards: () => Promise.resolve([]),
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
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    fixture.aggregation.mockReset().mockResolvedValue(AGG)
    fixture.paper.mockReset().mockResolvedValue(PAPER)
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

  it('home, subpage and paper cards are the shared research object card in its grid variant', async () => {
    expect(all('.wkcard').map((el) => el.className)).toEqual([
      'research-object-card research-object-card--grid wkcard', 'research-object-card research-object-card--grid wkcard',
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
    act(() => anchor.focus())
    expect(host.querySelector('.source-anchor-quote')!.textContent).toBe('p.3 · 原文“four bits”')
    await press(anchor)
    expect(fixture.open).toHaveBeenCalledWith('reader', 'p1', { page: 3 })
  })

  it('论文页的「去论文列表查看」是整页的操作,在屏头右端,点它到论文表里找到这篇', async () => {
    expect(host.querySelector('.desk-head .page-actions')).toBeNull()
    await press(host.querySelector<HTMLElement>('[data-wk="papers/p1"] .tt')!)
    const go = host.querySelector<HTMLButtonElement>('.desk-head > .page-actions > .btn')!
    expect(go.textContent).toBe('去论文列表查看')
    expect(host.querySelector('.wkside .btn')).toBeNull()
    await press(go)
    expect(fixture.open).toHaveBeenCalledWith('papers', 'EAGLE-2')
  })

  it('比较表格子里的锚点能用 Tab 停上去，悬停或聚焦都在共享 tooltip 里显示原文', async () => {
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    const anchor = host.querySelector<HTMLElement>('.cmp .anc')!
    expect([anchor.tabIndex, anchor.textContent]).toEqual([0, 'W4p3'])
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
