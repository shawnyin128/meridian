// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { TopicChips } from './TopicChips.js'

/** The Wiki's aggregation cards: three topic pages, one of which no paper is filed under, and a method page. */
vi.mock('../ipc.js', () => ({
  wiki: {
    cards: async () => [
      { id: 'topics/spec', kind: 'topic', title: '推测解码' },
      { id: 'topics/kv', kind: 'topic', title: 'KV cache' },
      { id: 'topics/empty', kind: 'topic', title: '还没有论文' },
      { id: 'methods/heads', kind: 'method', title: '草稿头' },
    ],
  },
  papers: { facets: async () => [{ value: '推测解码', count: 2, newestTitle: 'a' }] },
}))

describe('主题的 chip 与选主题', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  it('点 + 的候选是 Wiki 里还没选的每一个主题页,没有论文的主题页也在,别的种类不在', async () => {
    await act(async () => {
      root.render(
        <MessagesProvider>
          <TopicChips topics={['推测解码']} keep={['paper', 'p1', 'topics']} onAdd={vi.fn(async () => true)} onRemove={vi.fn(async () => true)} onError={vi.fn()} />
        </MessagesProvider>,
      )
    })
    await act(async () => { host.querySelector<HTMLButtonElement>('.tagadd')!.click() })
    expect(document.querySelector('.pickhits .rh')?.textContent).toBe('已有主题')
    expect([...document.querySelectorAll('.pickhits .rrow:not(.mk)')].map((row) => row.textContent)).toEqual(['KV cache', '还没有论文'])
  })
})
