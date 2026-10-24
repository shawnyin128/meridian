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

/** The rating and reading-status callbacks of a test that changes neither. */
const NO_WRITES = { onRate: () => {}, onPickReadState: () => {} }

describe('ResearchMap', () => {
  beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh'))

  it('还在整理时显示载入占位，不借空状态写一句正在整理', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider>
        <ResearchMap rows={[]} total={0} loading onOpenPaper={() => {}} onReadPaper={() => {}} {...NO_WRITES} />
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
        <ResearchMap rows={rows} total={rows.length} loading={false} onOpenPaper={() => {}} onReadPaper={() => {}} {...NO_WRITES} />
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

  it('分组名、选中分组的名字、论文标题和归入理由放不下时都淡出，不出省略号', () => {
    const title = 'Accelerating Large Language Model Decoding with Speculative Sampling'
    const rows = [paper('a', title, { topics: ['Speculative decoding'] }), paper('b', 'Bravo', { topics: ['Speculative decoding'] })]
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(
      <MessagesProvider>
        <ResearchMap rows={rows} total={rows.length} loading={false} onOpenPaper={() => {}} onReadPaper={() => {}} {...NO_WRITES} />
      </MessagesProvider>,
    )
    const faded = (selector: string) => [...host.querySelectorAll(`${selector} .fade-text:not(.tag-text)`)].map((line) => line.textContent)
    expect(faded('.research-map-group-copy')).toEqual(['Speculative decoding'])
    expect(faded('.research-map-detail-head')).toEqual(['Speculative decoding'])
    expect(faded('.research-map-paper')).toEqual([title, '主题：Speculative decoding', 'Bravo', '主题：Speculative decoding'])
    expect([...host.querySelectorAll('.research-map-group-name, .research-map-detail-name')].every((name) => name.matches('.fade-text')))
      .toBe(true)
  })

  it('只写分组、数量和归入理由，不写说明句子', () => {
    const rows = [
      paper('a', 'Alpha', { topics: ['Speculative decoding'] }),
      paper('b', 'Bravo', { topics: ['Speculative decoding'] }),
      paper('c', 'Kernel fusion tricks'),
      paper('d', 'Kernel fusion at scale'),
      paper('e', 'Unrelated'),
    ]
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(
      <MessagesProvider>
        <ResearchMap rows={rows} total={7} loading={false} onOpenPaper={() => {}} onReadPaper={() => {}} {...NO_WRITES} />
      </MessagesProvider>,
    )
    expect(host.querySelector('.research-map-copy p')).toBeNull()
    expect(host.querySelector('.research-map-title .tag')).toBeNull()
    expect(host.querySelector('.research-map-limit')?.textContent).toBe('5 / 7 篇')
    const kinds = [...host.querySelectorAll('.research-map-group')]
      .map((group) => [
        group.querySelector('.research-map-group-name')?.textContent,
        group.querySelector('.research-map-group-copy>span:not(.research-map-group-name)')?.textContent ?? null,
      ])
    expect(kinds).toContainEqual(['Speculative decoding', '主题或方法信号'])
    expect(kinds).toContainEqual(['Kernel fusion', null])
    const detail = host.querySelector('.research-map-detail')!
    expect(detail.querySelector('.research-map-readonly')).toBeNull()
    expect(detail.querySelector('.research-map-why')!.textContent).toBe('主题：Speculative decoding')
  })

  it('一篇论文只占一个 Tab 停靠点：进来先到标题，方向键依次走过五颗星和阅读状态；按标题打开详情，按星只改评分', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const rows = [paper('a', 'Alpha', { topics: ['Speculative decoding'] }), paper('b', 'Bravo', { topics: ['Speculative decoding'] })]
    const onOpenPaper = vi.fn()
    const onRate = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(
      <MessagesProvider>
        <ResearchMap
          rows={rows} total={rows.length} loading={false} onOpenPaper={onOpenPaper} onReadPaper={() => {}}
          onRate={onRate} onPickReadState={() => {}}
        />
      </MessagesProvider>,
    ))

    const list = host.querySelector<HTMLElement>('.research-map-papers')!
    const paperRows = [...list.querySelectorAll<HTMLElement>('.research-map-paper')]
    const stops = [...list.querySelectorAll<HTMLElement>('*')]
      .filter((element) => element.tabIndex >= 0 && !(element as HTMLButtonElement).disabled)
    expect(stops).toEqual(paperRows)
    await act(async () => { paperRows[0]!.focus() })
    const walked: string[] = []
    for (let step = 0; step < 8; step += 1) {
      walked.push(document.activeElement!.getAttribute('aria-label') ?? document.activeElement!.textContent ?? '')
      await act(async () => {
        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
        await new Promise((done) => setTimeout(done, 0))
      })
    }
    expect(walked).toEqual(['Alpha', '1 星', '2 星', '3 星', '4 星', '5 星', '未读', 'Alpha'])

    await act(async () => { paperRows[0]!.querySelector<HTMLButtonElement>('[aria-label="3 星"]')!.click() })
    expect(onRate).toHaveBeenCalledExactlyOnceWith(rows[0], 3)
    expect(onOpenPaper).not.toHaveBeenCalled()
    await act(async () => { paperRows[0]!.querySelector<HTMLElement>('.research-map-paper-open')!.click() })
    expect(onOpenPaper).toHaveBeenCalledExactlyOnceWith(rows[0])
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  it('论文行的右键菜单可以打开详情,也可以直接在阅读器中打开', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // The titles measure whether they fit, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const rows = [paper('a', 'Alpha', { topics: ['Speculative decoding'] }), paper('b', 'Bravo', { topics: ['Speculative decoding'] })]
    const onOpenPaper = vi.fn()
    const onReadPaper = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(
      <MessagesProvider>
        <ResearchMap rows={rows} total={rows.length} loading={false} onOpenPaper={onOpenPaper} onReadPaper={onReadPaper} {...NO_WRITES} />
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
    vi.unstubAllGlobals()
  })
})
