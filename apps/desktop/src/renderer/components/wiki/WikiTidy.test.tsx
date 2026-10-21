// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WikiSignal } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { tidyRows, TidyList } from './WikiTidy.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const signal = (kind: WikiSignal['kind'], page: string, related: string[] = []): WikiSignal => ({ kind, page, related, detail: '一句' })

/** Core's order: by kind as write protocol §6.2 lists them, then by page. */
const SIGNALS: WikiSignal[] = [
  signal('unfiled-paper', 'papers/a'),
  signal('thin-aggregation', 'topics/moe', ['papers/a']),
  signal('single-child', 'topics/root'),
  signal('broken-link', 'papers/h2o', ['topics/eagle-3']),
  signal('broken-link', 'papers/h2o', ['topics/eagle-3']),
  signal('broken-link', 'papers/h2o', ['methods/gone']),
  signal('broken-link', 'projects/p-47', ['topics/old']),
  signal('claim-without-evidence', 'topics/kv'),
  signal('open-conflict', 'topics/kv', ['topics/kv#evict', 'methods/q#two-bit']),
]

const TITLES = {
  'papers/a': 'Paper \\textbf{A}', 'topics/moe': '混合专家', 'papers/h2o': 'H2O', 'projects/p-47': '推测解码加速', 'topics/kv': 'KV 压缩',
  'methods/q#two-bit': '2bit 量化更省显存',
}

describe('WikiTidy', () => {
  let root: Root
  let host: HTMLDivElement
  const onOpen = vi.fn()

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // FadeText measures whether its text fits, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  const render = (signals: WikiSignal[], titles: Record<string, string> | null = TITLES) => act(() => root.render(
    <MessagesProvider><TidyList rows={tidyRows(signals)} titles={titles} onOpen={onOpen} /></MessagesProvider>,
  ))

  it('只列结论冲突、链接失效、内容太少、未归入主题,按这个次序,同一种同一页只列一次,带上出错的那几处', () => {
    expect(tidyRows(SIGNALS)).toEqual([
      { kind: 'open-conflict', page: 'topics/kv', claim: 'topics/kv#evict', targets: ['methods/q#two-bit'] },
      { kind: 'broken-link', page: 'papers/h2o', targets: ['topics/eagle-3', 'methods/gone'] },
      { kind: 'broken-link', page: 'projects/p-47', targets: ['topics/old'] },
      { kind: 'thin-aggregation', page: 'topics/moe', targets: [] },
      { kind: 'unfiled-paper', page: 'papers/a', targets: [] },
    ])
  })

  it('一行一个信号:种类标签、页名和出错的那几处,只有名字,不写 Core 的句子;列表随页面滚动', () => {
    render([...SIGNALS, signal('unfiled-paper', 'papers/b')])
    const rows = [...host.querySelectorAll<HTMLElement>('.structured-row')]
    expect(rows.map((row) => [row.querySelector('.tag')!.textContent, row.querySelector('.tidy-open')!.textContent, row.querySelector('.tidy-wrong')?.textContent ?? ''])).toEqual([
      ['结论冲突', 'KV 压缩', '↔ 2bit 量化更省显存'], ['链接失效', 'H2O', '→ topics/eagle-3 · methods/gone'],
      ['链接失效', '推测解码加速', '→ topics/old'], ['内容太少', '混合专家', ''], ['未归入主题', 'Paper A', ''], ['未归入主题', 'papers/b', ''],
    ])
    expect(rows.map((row) => row.querySelector('.tag')!.className)).toEqual([
      'tag tag--label tag--bad', 'tag tag--label tag--bad', 'tag tag--label tag--bad',
      'tag tag--label tag--warn', 'tag tag--label tag--warn', 'tag tag--label tag--warn',
    ])
    expect(rows.every((row) => !row.textContent!.includes('一句'))).toBe(true)
    expect(rows[4]!.querySelector('.tidy-open strong')!.textContent).toBe('A')
    expect(host.querySelector('.structured-list--scrollable')).toBeNull()
  })

  it('一行打开它出错的地方:冲突落到那条结论,别的落到页上;冲突里另一条结论是链接,打开它所在的那条', () => {
    render(SIGNALS)
    const rows = [...host.querySelectorAll<HTMLElement>('.structured-row')]
    expect(rows.map((row) => row.querySelector('.tidy-open')!.tagName)).toEqual(Array(5).fill('BUTTON'))
    act(() => rows[0]!.click())
    expect(onOpen).toHaveBeenLastCalledWith('topics/kv', 'topics/kv#evict')
    act(() => rows[1]!.querySelector<HTMLElement>('.tidy-open')!.click())
    expect(onOpen).toHaveBeenLastCalledWith('papers/h2o', undefined)
    act(() => rows[2]!.click())
    expect(onOpen).toHaveBeenLastCalledWith('projects/p-47', undefined)
    onOpen.mockClear()
    act(() => rows[0]!.querySelector<HTMLElement>('.tidy-wrong .entity-link')!.click())
    expect(onOpen.mock.calls).toEqual([['methods/q', 'methods/q#two-bit']])
  })

  it('页名还没取到时是加载占位,没有要整理的时是分节空态', () => {
    render(SIGNALS, null)
    expect(host.querySelector('.loading-placeholder')).not.toBeNull()
    expect(host.querySelector('.structured-row')).toBeNull()
    render([])
    expect(host.querySelector('.empty-state--section')!.textContent).toBe('还没有需要整理的页')
    expect(host.querySelector('.structured-row')).toBeNull()
  })
})
