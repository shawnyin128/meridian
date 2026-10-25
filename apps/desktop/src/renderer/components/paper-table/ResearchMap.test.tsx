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

  it('lets the selected group\'s papers take the detail card\'s height and scroll inside it, not stop at five rows', async () => {
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
    expect(list.classList.contains('structured-list--fill')).toBe(true)
    expect(list.style.maxHeight).toBe('')
    expect(host.querySelector('.research-map-index')?.classList.contains('list-column')).toBe(true)
    // The index and the detail are the two columns of the shared split page, which takes the view's remaining height.
    const split = host.querySelector('.research-map > .split-page')!
    expect([split.className, ...[...split.children].map((column) => column.className)])
      .toEqual(['split-page split-page--index', 'list-column research-map-index', 'research-map-detail'])
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
    const faded = (selector: string) => [...host.querySelectorAll(`${selector} .fade-text:not(.tag-text, .read-dots)`)].map((line) => line.textContent)
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
    expect(host.querySelector('.research-map-limit')?.textContent).toBe('5 / 7 篇')
    const kinds = [...host.querySelectorAll('.research-map-group')]
      .map((group) => [
        group.querySelector('.research-map-group-name')?.textContent,
        group.querySelector('.research-map-group-copy>span:not(.research-map-group-name, .read-dots)')?.textContent ?? null,
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

  it('不放概况卡：分组列表和详情直接排在视图切换下面，只在地图只取了一部分论文时写出取了多少', () => {
    const rows = [paper('a', 'Alpha', { topics: ['Speculative decoding'] }), paper('b', 'Bravo', { topics: ['Speculative decoding'] })]
    const render = (total: number) => {
      const host = document.createElement('div')
      host.innerHTML = renderToStaticMarkup(
        <MessagesProvider>
          <ResearchMap rows={rows} total={total} loading={false} onOpenPaper={() => {}} onReadPaper={() => {}} {...NO_WRITES} />
        </MessagesProvider>,
      )
      return host.querySelector('.research-map')!
    }
    expect([...render(2).children].map((child) => child.className)).toEqual(['split-page split-page--index'])
    expect([...render(9).children].map((child) => child.className)).toEqual(['research-map-limit', 'split-page split-page--index'])
    expect(render(9).textContent).not.toContain('自适应研究地图')
  })

  it('每个分组行在名字下面给每篇论文画一个点，已读的在前，读屏读出已读几篇，不写文字', () => {
    const rows = [
      paper('a', 'Alpha', { topics: ['Speculative decoding'], readState: '已读' }),
      paper('b', 'Bravo', { topics: ['Speculative decoding'] }),
      paper('c', 'Charlie', { topics: ['Speculative decoding', 'KV cache'], readState: '在读' }),
      paper('d', 'Delta', { topics: ['KV cache'], readState: '已读' }),
    ]
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(
      <MessagesProvider>
        <ResearchMap rows={rows} total={rows.length} loading={false} onOpenPaper={() => {}} onReadPaper={() => {}} {...NO_WRITES} />
      </MessagesProvider>,
    )
    const lines = [...host.querySelectorAll('.research-map-groups')[0]!.querySelectorAll('.research-map-group')].map((group) => {
      const line = group.querySelector('.research-map-group-copy>.research-map-group-name+.read-dots')
      return [
        group.querySelector('.research-map-group-name')?.textContent, line?.getAttribute('aria-label'), line?.textContent,
        [...line?.children ?? []].map((dot) => /status-dot--(half|ring)/.exec(dot.className)?.[1] ?? 'full'),
      ]
    })
    expect(lines).toEqual([
      ['Speculative decoding', '已读 1/3', '', ['full', 'half', 'ring']],
      ['KV cache', '已读 1/2', '', ['full', 'half']],
    ])
  })

  it('分组之后另起一组：跨组列出属于两个以上分组的论文并标出所在分组，未归组列出不在任何分组的论文', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const rows = [
      paper('a', 'Alpha', { topics: ['Speculative decoding', 'KV cache'], readState: '已读' }),
      paper('b', 'Bravo', { topics: ['Speculative decoding'] }),
      paper('c', 'Charlie', { topics: ['Speculative decoding'] }),
      paper('d', 'Delta', { topics: ['KV cache'] }),
      paper('e', 'Echo'),
    ]
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(
      <MessagesProvider>
        <ResearchMap rows={rows} total={rows.length} loading={false} onOpenPaper={() => {}} onReadPaper={() => {}} {...NO_WRITES} />
      </MessagesProvider>,
    ))

    const lists = [...host.querySelectorAll('.research-map-groups')]
    const rowsOf = (list: Element) => [...list.querySelectorAll<HTMLElement>('.research-map-group')]
      .map((group) => [group.querySelector('.research-map-group-name')?.textContent, group.querySelector('.count-badge')?.textContent])
    expect(lists.map(rowsOf)).toEqual([
      [['Speculative decoding', '3'], ['KV cache', '2']],
      [['跨组', '1'], ['未归组', '1']],
    ])
    expect([...lists[1]!.querySelectorAll('.read-dots')].map((line) => [line.getAttribute('aria-label'), line.children.length]))
      .toEqual([['已读 1/1', 1], ['已读 0/1', 1]])

    const pick = async (name: string) => {
      const row = [...host.querySelectorAll<HTMLElement>('.research-map-group')].find((group) => group.textContent?.startsWith(name))!
      await act(async () => { row.click() })
      expect(row.getAttribute('aria-pressed')).toBe('true')
      const detail = host.querySelector('.research-map-detail')!
      return {
        head: detail.querySelector('.research-map-detail-head')?.textContent,
        papers: [...detail.querySelectorAll('.research-map-paper')].map((item) => [
          item.querySelector('.research-map-paper-title')?.textContent,
          [...item.querySelectorAll('.research-map-why .tag')].map((tag) => tag.textContent),
        ]),
      }
    }
    expect(await pick('跨组')).toEqual({ head: '跨组1 篇论文', papers: [['Alpha', ['Speculative decoding', 'KV cache']]] })
    expect(await pick('未归组')).toEqual({ head: '未归组1 篇论文', papers: [['Echo', []]] })
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  it('每篇论文都在某个分组里时不画未归组那一行', () => {
    const rows = [
      paper('a', 'Alpha', { topics: ['Speculative decoding', 'KV cache'] }),
      paper('b', 'Bravo', { topics: ['Speculative decoding'] }),
      paper('c', 'Charlie', { topics: ['KV cache'] }),
    ]
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(
      <MessagesProvider>
        <ResearchMap rows={rows} total={rows.length} loading={false} onOpenPaper={() => {}} onReadPaper={() => {}} {...NO_WRITES} />
      </MessagesProvider>,
    )
    const names = [...host.querySelectorAll('.research-map-groups')[1]!.querySelectorAll('.research-map-group-name')]
      .map((name) => name.textContent)
    expect(names).toEqual(['跨组'])
  })
})
