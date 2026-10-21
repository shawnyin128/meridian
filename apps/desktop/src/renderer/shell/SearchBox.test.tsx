// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchHit } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from './language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const HITS: SearchHit[] = [
  { kind: 'project', title: '项目：推测解码', meta: '进行中', target: 'p1' },
  { kind: 'aggregation', title: '主题：推测解码', meta: '3 篇', target: 'topics/sd' },
  { kind: 'chat', title: '对话：草稿', meta: '1 条', target: 'c1' },
]

/** Hits that each open somewhere else: a paper at a note, a paper with no PDF, a task, a read-later entry. */
const OPENED: SearchHit[] = [
  {
    kind: 'paper', title: '论文：EAGLE', meta: '2024 arXiv', target: 'eagle', pdf: true,
    snippet: '草稿头只用一层 decoder', anchor: { note: 'note-3', page: 4 },
  },
  { kind: 'paper', title: '论文：Switch', meta: '2021 arXiv', target: 'switch', pdf: false },
  { kind: 'task', title: '任务：跑基线', meta: '压缩实验', target: 'p1', anchor: { task: 'task-9' } },
  { kind: 'later', title: '稍后阅读：Rotation Revisited', meta: 'ICLR 2026', target: 'later-1' },
]

vi.mock('../ipc.js', () => ({
  search: { query: (q: string) => Promise.resolve(q === '无此词' ? [] : q === '打开' ? OPENED : HITS) },
}))

const { SearchBox } = await import('./SearchBox.js')

/** Types `value` into the search field and lets the results arrive. */
async function type(value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('#sSearch')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { await new Promise((done) => setTimeout(done, 20)) })
}

describe('SearchBox', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
  let root: Root | null = null
  /** The screen, target and anchor of each jump a chosen hit asked for. */
  let jumps: unknown[][]

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.id === 'searchBox') return DOMRect.fromRect({ x: 12, y: 40, width: 220, height: 30 })
      if (this.id === 'sSearch') return DOMRect.fromRect({ x: 42, y: 45, width: 170, height: 20 })
      return DOMRect.fromRect()
    })
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    jumps = []
    act(() => root!.render(<MessagesProvider><SearchBox onJump={(...jump) => { jumps.push(jump) }} /></MessagesProvider>))
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    vi.restoreAllMocks()
  })

  it('搜不到时面板仍开着,写没有找到;清空搜索词后才收起', async () => {
    await type('无此词')
    const panel = document.querySelector<HTMLElement>('#sRes')
    expect(panel?.querySelector('.empty-state')?.textContent).toBe('没有找到匹配的内容')
    expect(panel?.querySelectorAll('[role="option"], .mi')).toHaveLength(0)
    await type('')
    expect(document.querySelector('#sRes')).toBeNull()
  })

  it('结果面板按整个搜索框对齐,不按框里那段输入', async () => {
    await type('推测')
    const wrapper = document.querySelector<HTMLElement>('[data-radix-popper-content-wrapper]')!
    expect(wrapper.style.getPropertyValue('--radix-popper-anchor-width')).toBe('220px')
    expect(wrapper.style.transform).toMatch(/^translate\(12px, /)
  })

  it('指针移到的结果就是唯一高亮的当前行,方向键从它往下走', async () => {
    await type('推测')
    const rows = () => [...document.querySelectorAll<HTMLElement>('#sRes .rrow')]
    const lit = () => rows().map((row) => row.classList.contains('on'))
    await act(async () => { rows()[1]!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })) })
    expect(lit()).toEqual([false, true, false])

    const input = document.querySelector<HTMLInputElement>('#sSearch')!
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })) })
    expect(lit()).toEqual([false, false, true])
  })

  it('正文里命中的那条,第二行写命中的那句话;标题命中的写它的说明', async () => {
    await type('打开')
    expect([...document.querySelectorAll('#sRes .rrow .rm')].map((line) => line.textContent))
      .toEqual(['草稿头只用一层 decoder', '2021 arXiv', '压缩实验', 'ICLR 2026'])
  })

  it('有原文的论文在阅读器里打开到命中的笔记,没有原文的打开详情,任务在项目里定位,稍后阅读进稍后阅读', async () => {
    for (const at of [0, 1, 2, 3]) {
      await type('')
      await type('打开')
      await act(async () => { document.querySelectorAll<HTMLElement>('#sRes .rrow')[at]!.click() })
    }
    expect(jumps).toEqual([
      ['reader', 'eagle', { note: 'note-3', page: 4, panel: 'notes' }],
      ['papers', 'switch', { detail: true }],
      ['project', 'p1', { task: 'task-9' }],
      ['later', 'later-1', undefined],
    ])
  })

  it('命中一个实体时打开的屏和实体链接打开它的屏是同一个:Wiki 页、项目、论文、想法、对话', async () => {
    const { openHit } = await import('./SearchBox.js')
    const { ENTITY_SCREEN } = await import('../components/EntityLink.js')
    const opened: string[] = []
    for (const kind of ['aggregation', 'project', 'paper', 'idea', 'chat'] as const) {
      openHit({ kind, title: '一条', meta: '', target: 'x', pdf: true }, (screen) => { opened.push(screen) })
    }
    expect(opened).toEqual([ENTITY_SCREEN.page, ENTITY_SCREEN.project, ENTITY_SCREEN.paper, ENTITY_SCREEN.idea, ENTITY_SCREEN.chat])
  })
})

