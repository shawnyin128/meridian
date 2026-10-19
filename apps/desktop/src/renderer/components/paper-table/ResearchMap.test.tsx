// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaperRow } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ResearchMap } from './ResearchMap.js'

const paper = (id: string, title: string, patch: Partial<PaperRow> = {}): PaperRow => ({
  id, title, venue: 'arXiv', topics: [], methods: [], datasets: [], metrics: [], pageState: 'draft',
  readState: '未读', projects: [], pageCount: 1, noteCount: 0, conclusionCount: 0,
  updated: '2026-09-21', custom: {}, ...patch,
})

describe('ResearchMap', () => {
  beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh'))

  it('还在整理时显示载入占位，不借空状态写一句正在整理', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider>
        <ResearchMap rows={[]} total={0} loading onOpenPaper={() => {}} onReadPaper={() => {}} />
      </MessagesProvider>,
    )
    expect(html).not.toContain('empty-state')
    expect(html).toContain('loading-placeholder')
  })

  it('scrolls the selected group\'s papers inside the list after the fifth row', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    // Every row draws a 78px box, stacked from the top of its list.
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const rows = [...this.closest('.structured-list')!.querySelectorAll('.structured-row')]
      return { top: 0, bottom: 78 * (rows.indexOf(this) + 1) } as DOMRect
    })
    const grouped = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf']
      .map((title, index) => paper(`p${index}`, title, { topics: ['Speculative decoding'] }))
    const rows = [...grouped, paper('x', 'Hotel'), paper('y', 'India')]
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(
      <MessagesProvider>
        <ResearchMap rows={rows} total={rows.length} loading={false} onOpenPaper={() => {}} onReadPaper={() => {}} />
      </MessagesProvider>,
    ))

    const list = host.querySelector<HTMLElement>('.research-map-papers')!
    expect(list.querySelectorAll('.research-map-paper')).toHaveLength(grouped.length)
    expect(list.classList.contains('structured-list--scrollable')).toBe(true)
    expect(list.style.maxHeight).toBe(`${78 * 5}px`)
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('论文行的右键菜单可以打开详情,也可以直接在阅读器中打开', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const rows = [paper('a', 'Alpha', { topics: ['Speculative decoding'] }), paper('b', 'Bravo', { topics: ['Speculative decoding'] })]
    const onOpenPaper = vi.fn()
    const onReadPaper = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(
      <MessagesProvider>
        <ResearchMap rows={rows} total={rows.length} loading={false} onOpenPaper={onOpenPaper} onReadPaper={onReadPaper} />
      </MessagesProvider>,
    ))

    const row = [...host.querySelectorAll<HTMLElement>('.research-map-paper')].find((el) => el.textContent?.includes('Bravo'))!
    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 }))
    })
    const items = () => [...document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')]
    expect(items().map((item) => item.textContent)).toEqual(['打开详情', '在阅读器中打开'])
    await act(async () => { items()[1]!.click() })
    expect(onReadPaper).toHaveBeenCalledExactlyOnceWith(rows[1])
    expect(onOpenPaper).not.toHaveBeenCalled()
    act(() => root.unmount())
  })
})
