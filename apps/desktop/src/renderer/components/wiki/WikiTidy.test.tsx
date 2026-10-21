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

const signal = (kind: WikiSignal['kind'], page: string): WikiSignal => ({ kind, page, related: [], detail: '一句' })

/** Core's order: by kind as write protocol §6.2 lists them, then by page. */
const SIGNALS: WikiSignal[] = [
  signal('unfiled-paper', 'papers/a'),
  signal('thin-aggregation', 'topics/moe'),
  signal('single-child', 'topics/root'),
  signal('broken-link', 'papers/h2o'),
  signal('broken-link', 'papers/h2o'),
  signal('broken-link', 'projects/p-47'),
  signal('claim-without-evidence', 'topics/kv'),
  signal('open-conflict', 'topics/kv'),
]

const TITLES = {
  'papers/a': 'Paper \\textbf{A}', 'topics/moe': '混合专家', 'papers/h2o': 'H2O', 'projects/p-47': '推测解码加速', 'topics/kv': 'KV 压缩',
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

  it('只列冲突、断链、内容少、未归类,按这个次序,同一种同一页只列一次', () => {
    expect(tidyRows(SIGNALS)).toEqual([
      { kind: 'open-conflict', page: 'topics/kv' },
      { kind: 'broken-link', page: 'papers/h2o' },
      { kind: 'broken-link', page: 'projects/p-47' },
      { kind: 'thin-aggregation', page: 'topics/moe' },
      { kind: 'unfiled-paper', page: 'papers/a' },
    ])
  })

  it('一行一个信号:种类标签和页名,点一行打开它的页;列表随页面滚动', () => {
    render([...SIGNALS, signal('unfiled-paper', 'papers/b')])
    const rows = [...host.querySelectorAll<HTMLButtonElement>('.structured-row')]
    expect(rows.map((row) => [row.tagName, row.querySelector('.tag')!.textContent, row.querySelector('.attn-text')!.textContent])).toEqual([
      ['BUTTON', '冲突', 'KV 压缩'], ['BUTTON', '断链', 'H2O'], ['BUTTON', '断链', '推测解码加速'],
      ['BUTTON', '内容少', '混合专家'], ['BUTTON', '未归类', 'Paper A'], ['BUTTON', '未归类', 'papers/b'],
    ])
    expect(rows.map((row) => row.querySelector('.tag')!.className)).toEqual([
      'tag tag--label tag--bad', 'tag tag--label tag--bad', 'tag tag--label tag--bad',
      'tag tag--label tag--warn', 'tag tag--label tag--warn', 'tag tag--label tag--warn',
    ])
    expect(rows[4]!.querySelector('.attn-text strong')!.textContent).toBe('A')
    expect(host.querySelector('.structured-list--scrollable')).toBeNull()
    act(() => rows[2]!.click())
    expect(onOpen).toHaveBeenCalledWith('projects/p-47')
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
