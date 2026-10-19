// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WikiAggregation, WikiAggregationCard, WikiHome, WikiPaper } from '../../shared/contract.js'
import { IconTrash } from '../components/icons.js'
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
  useBanner: () => vi.fn(),
  useToast: () => vi.fn(),
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

  it('reaches every link, chip, contents entry and remove control of an aggregation page by keyboard', async () => {
    await press(host.querySelector<HTMLElement>('[data-wk="topics/sd"] .tt')!)
    expect(tags('.wkmain .wkcard .tt')).toEqual(['BUTTON'])
    expect(tags('.cmp td.rh .entity-link')).toEqual(['BUTTON'])
    expect(tags('.cmp td.dv .tagchip')).toEqual(['BUTTON'])
    expect(tags('.cmp td.rx > *')).toEqual(['BUTTON'])
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
    await press(host.querySelector<HTMLElement>('.cmp thead [title="列设置"]')!)
    const remove = document.querySelector<HTMLButtonElement>('.coledit .row button')!
    expect([remove.className, remove.getAttribute('aria-label')]).toEqual(['icbtn sm danger', '删除列'])
    expect(remove.querySelector('svg')!.outerHTML).toBe(renderToStaticMarkup(<IconTrash />))
    vi.unstubAllGlobals()
  })
})
