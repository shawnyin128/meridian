// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaperReading, PaperRow } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import type { JumpAnchor } from '../../shell/AppShell.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const PAPER: PaperRow = {
  id: 'p1', title: '一篇论文', venue: 'arXiv', topics: [], methods: [], datasets: [], metrics: [],
  pageState: 'draft', readState: '在读', pageCount: 1, noteCount: 3, conclusionCount: 0,
  updated: '2026-09-20', custom: {}, projects: [],
}

/** A remark and three notes: the summary shows the remark and the two latest notes, then "view all". */
const READING: PaperReading = {
  paperId: 'p1',
  remark: '先看第三节的消融。',
  highlights: [{
    id: 'h1', page: 2, quote: '固定上下文', rects: [{ x: 0, y: 0, width: 0.1, height: 0.1 }],
    color: 'yellow', note: '和自适应上下文对比', created: '2026-09-19', updated: '2026-09-19',
  }],
  notes: [
    { id: 'n1', page: 4, text: '第二条', created: '2026-09-18', updated: '2026-09-18' },
    { id: 'n2', page: 6, text: '最旧的一条', created: '2026-09-01', updated: '2026-09-01' },
  ],
}

vi.mock('../../ipc.js', () => ({
  papers: { reading: () => Promise.resolve(READING) },
}))

vi.mock('../../shell/AppShell.js', () => ({
  useVaultRevision: () => ({ revision: 0, bump: () => {} }),
}))

const { PaperReadingSummary } = await import('./PaperReadingSummary.js')

let root: Root | null = null

describe('PaperReadingSummary', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
  })
  afterEach(() => {
    act(() => { root?.unmount() })
    root = null
    document.body.innerHTML = ''
  })

  it('lists the remark and the latest notes as rows of the shared embedded list, with "view all" after it', async () => {
    const read: JumpAnchor[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <MessagesProvider>
          <PaperReadingSummary paper={PAPER} onRead={(anchor) => { read.push(anchor) }} />
        </MessagesProvider>,
      )
    })

    const list = host.querySelector('.paper-reading-summary .structured-list')
    expect(list?.classList.contains('structured-list--embedded')).toBe(true)
    const rows = [...list!.children]
    expect(rows.every((row) => row.classList.contains('structured-row'))).toBe(true)
    expect(rows.map((row) => row.textContent)).toEqual(['先看第三节的消融。', '“固定上下文”和自适应上下文对比', '第二条'])
    expect(list!.nextElementSibling?.textContent).toBe('共 3 条 · 阅读器中查看全部')
    expect(list!.nextElementSibling?.className).toBe('btn ghost sm reading-summary-all')

    await act(async () => { (rows[1] as HTMLElement).click() })
    expect(read).toEqual([{ page: 2, highlight: 'h1', panel: 'highlights' }])
  })

  it('shows the note and conclusion counts as plain property values, text like the other values of a property list', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <MessagesProvider>
          <PaperReadingSummary paper={PAPER} onRead={() => {}} />
        </MessagesProvider>,
      )
    })

    expect([...host.querySelectorAll('.paper-meta-list dd')].map((dd) => [dd.childElementCount, dd.textContent]))
      .toEqual([[0, '3'], [0, '0']])
  })
})
