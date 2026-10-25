// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChangeEntry } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({ entries: [] as ChangeEntry[], open: vi.fn() }))

vi.mock('../ipc.js', () => ({
  changelog: { list: async () => structuredClone(api.entries) },
}))

vi.mock('../shell/AppShell.js', () => ({
  useJump: () => ({ jump: null, open: api.open }),
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useToday: () => '2026-10-16',
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>) => { await work; return true },
}))

const { Changelog } = await import('./Changelog.js')

const entry = (id: string, title: string, source: ChangeEntry['source']): ChangeEntry => ({
  id, title, meta: '今天', date: '2026-10-16', source, diff: [], lines: [], undone: false, undoable: false, archived: false,
})

describe('最近变动的来源标签', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // The page title measures whether it fits, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  it('agent 做的那条跟一个 agent 标签,提案再写明来自笔记还是实验;我自己做的不带标签', async () => {
    api.entries = [
      entry('c1', '项目「draft 效率」· 改了字段', '我'),
      entry('c2', '项目「draft 效率」· 新增任务', 'Meridian'),
      entry('c3', 'Wiki · 记下拐点', '笔记'),
      entry('c4', 'Wiki · 记下实验结果', '实验'),
    ]
    await act(async () => root.render(<MessagesProvider><Changelog /></MessagesProvider>))
    const labels = [...host.querySelectorAll('.crow')].map((row) => row.querySelector('.ct .source-label')?.textContent ?? null)
    expect(labels).toEqual([null, 'agent', 'agent · 笔记', 'agent · 实验'])
  })

  it('灰字只写撤销状态：已撤销、无法撤销，能撤销的不写一句提示', async () => {
    api.entries = [
      { ...entry('c1', '改了字段', '我'), undoable: true, meta: '今天 · 会议后' },
      { ...entry('c2', '删掉笔记', '我'), undone: true },
      entry('c3', '实验回流', '实验'),
    ]
    await act(async () => root.render(<MessagesProvider><Changelog /></MessagesProvider>))
    expect([...host.querySelectorAll('.crow .cm')].map((line) => line.textContent)).toEqual(['会议后', '已撤销', '无法撤销'])
  })

  it('删除、归档和撤销是行尾操作槽里的图标钮，删除悬停时标红', async () => {
    api.entries = [{ ...entry('c1', '项目「draft 效率」· 改了字段', '我'), undoable: true }]
    await act(async () => root.render(<MessagesProvider><Changelog /></MessagesProvider>))
    const slot = (row: Element) => [...row.querySelectorAll('.row-actions button')].map((item) => [
      item.getAttribute('aria-label'), item.textContent, item.classList.contains('icbtn'), item.classList.contains('danger'),
    ])
    expect(slot(host.querySelector('.crow')!)).toEqual([
      ['删除', '', true, true], ['归档', '', true, false], ['撤销', '', true, false],
    ])
  })

  it('一条变动用共享的展开控件展开它的差异:带箭头,按钮以这条变动命名,点一下展开、再点收起', async () => {
    api.entries = [{ ...entry('c1', '项目「draft 效率」· 改了字段', '我'), diff: ['- 旧', '+ 新'], lines: [['- 旧'], ['+ 新']] }]
    await act(async () => root.render(<MessagesProvider><Changelog /></MessagesProvider>))
    const toggle = host.querySelector<HTMLButtonElement>('.crow .card-tray-toggle')!
    expect(toggle.parentElement!.querySelector('.fold-caret svg')).not.toBeNull()
    expect(toggle.getAttribute('aria-label')).toBeNull()
    expect(document.getElementById(toggle.getAttribute('aria-labelledby')!)!.textContent).toContain('项目「draft 效率」· 改了字段')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    act(() => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('.crow .card-tray')!.classList.contains('is-open')).toBe(true)
    act(() => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('标题点名的论文、项目和 Wiki 页是链接:点名字打开它、这一行不展开;展开钮照样展开', async () => {
    const named = (title: string, name: string, kind: NonNullable<ChangeEntry['named']>['kind'], id: string): ChangeEntry => ({
      ...entry(id, title, '我'), named: { kind, id, from: title.indexOf(name), to: title.indexOf(name) + name.length },
    })
    api.entries = [
      named('项目「draft 效率」· 改了字段', 'draft 效率', 'project', 'draft'),
      named('撤销：论文「Mixtral of Experts」· 改了随笔', 'Mixtral of Experts', 'paper', 'mixtral'),
      named('Wiki · 「PTQ」· 改了正文', 'PTQ', 'page', 'topics/ptq'),
      entry('c4', '论文表 · 新建列「备注」', '我'),
    ]
    await act(async () => root.render(<MessagesProvider><Changelog /></MessagesProvider>))
    const rows = [...host.querySelectorAll('.crow')]
    expect(rows.map((row) => {
      const link = row.querySelector('.ct .entity-link')
      return [row.querySelector('.ct')!.textContent, link?.tagName ?? null, link?.textContent ?? null]
    })).toEqual([
      ['项目「draft 效率」· 改了字段', 'A', 'draft 效率'],
      ['撤销：论文「Mixtral of Experts」· 改了随笔', 'A', 'Mixtral of Experts'],
      ['Wiki · 「PTQ」· 改了正文', 'A', 'PTQ'],
      ['论文表 · 新建列「备注」', null, null],
    ])
    for (const row of rows.slice(0, 3)) act(() => row.querySelector<HTMLElement>('.ct .entity-link')!.click())
    expect(api.open.mock.calls).toEqual([['project', 'draft'], ['reader', 'mixtral'], ['wiki', 'topics/ptq']])
    const expanded = () => rows.map((row) => row.querySelector('.card-tray-toggle')!.getAttribute('aria-expanded'))
    expect(expanded()).toEqual(['false', 'false', 'false', 'false'])
    act(() => rows[0]!.querySelector<HTMLElement>('.card-tray-toggle')!.click())
    expect(expanded()).toEqual(['true', 'false', 'false', 'false'])
  })

  it('展开的一条按 Core 给的显示行画:页名照写,论文名按论文文本显示,增删照旧着色', async () => {
    api.entries = [{
      ...entry('c1', 'Wiki · 记一条', '我'),
      diff: ['+ papers/h2o ∈ topics/kv(1 格)'], lines: [['+ ', { paper: 'H$_2$O' }, ' ∈ KV cache(1 格)'], ['- 旧']],
    }]
    await act(async () => root.render(<MessagesProvider><Changelog /></MessagesProvider>))
    act(() => host.querySelector<HTMLButtonElement>('.crow .card-tray-toggle')!.click())
    const [added, removed] = [...host.querySelectorAll('.crow .diff div')]
    expect(added!.className).toBe('add')
    expect(added!.innerHTML).toMatch(/^\+ H<span><span class="katex">.*<\/span><\/span>O ∈ KV cache\(1 格\)$/)
    expect(added!.textContent).not.toContain('papers/')
    expect(removed!.className).toBe('del')
  })
})
