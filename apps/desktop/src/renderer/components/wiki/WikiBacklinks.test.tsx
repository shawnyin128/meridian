// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WikiBacklink } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { WikiBacklinks } from './WikiBacklinks.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** Core's order: pages by kind in schema order before papers, then projects, ideas and chats. */
const LINKS: WikiBacklink[] = [
  { kind: 'page', id: 'topics/sd', title: '推测解码', kindLabel: '主题' },
  { kind: 'page', id: 'topics/kv', title: 'KV 压缩', kindLabel: '主题' },
  { kind: 'page', id: 'methods/heads', title: '草稿头', kindLabel: '方法' },
  { kind: 'page', id: 'papers/h2o', title: 'H$_2$O', fullTitle: 'H$_2$O: Heavy-Hitter Oracle' },
  { kind: 'project', id: 'p-47', title: '推测解码加速' },
  { kind: 'idea', id: 'idea-1', title: '按 $k$ 调整树宽' },
  { kind: 'chat', id: 'chat-2', title: 'EAGLE 阅读' },
]

describe('WikiBacklinks', () => {
  let root: Root
  let host: HTMLDivElement
  const onOpen = vi.fn()

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // A chip measures whether its name fits, and jsdom has no ResizeObserver.
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

  const render = (links: WikiBacklink[]) => act(() => root.render(
    <MessagesProvider><WikiBacklinks links={links} onOpen={onOpen} /></MessagesProvider>,
  ))

  it('没有任何东西指向这一页时整块不出现', () => {
    render([])
    expect(host.innerHTML).toBe('')
  })

  it('是右栏的一块:栏标题「反向链接」,同一种归在一行,行首是种类,后面是这一种的链接', () => {
    render(LINKS)
    const heading = host.querySelector('.section-heading')!
    expect(heading.classList.contains('section-heading--group')).toBe(true)
    expect(heading.textContent).toBe('反向链接')
    const rows = [...host.querySelectorAll('.wkrel')].map((row) => [
      row.querySelector('.rl')!.textContent, [...row.querySelectorAll('.tagchip')].map((link) => link.textContent),
    ])
    expect(rows).toEqual([
      ['主题', ['推测解码', 'KV 压缩']], ['方法', ['草稿头']], ['论文', [expect.stringContaining('O')]],
      ['项目', ['推测解码加速']], ['想法', ['按 $k$ 调整树宽']], ['对话', ['EAGLE 阅读']],
    ])
    expect([...host.querySelectorAll('.wkrel')].map((row) => [...row.children].map((part) => part.className))).toEqual([
      ['rl', ...Array(2).fill('tag tag--chip tag--neutral tagchip')], ...Array(5).fill(['rl', 'tag tag--chip tag--neutral tagchip']),
    ])
  })

  it('每个都是关联块那种标签按钮:论文名按 LaTeX 显示,页面带页 id,点哪个就把哪个交给调用方', () => {
    render(LINKS)
    const links = [...host.querySelectorAll<HTMLElement>('.tagchip')]
    expect(links.map((link) => [link.tagName, link.dataset.wk])).toEqual([
      ['BUTTON', 'topics/sd'], ['BUTTON', 'topics/kv'], ['BUTTON', 'methods/heads'], ['BUTTON', 'papers/h2o'],
      ['BUTTON', undefined], ['BUTTON', undefined], ['BUTTON', undefined],
    ])
    expect(links[3]!.querySelector('.katex')).not.toBeNull()
    act(() => links[4]!.click())
    expect(onOpen).toHaveBeenCalledWith(LINKS[4])
    act(() => links[6]!.click())
    expect(onOpen).toHaveBeenLastCalledWith(LINKS[6])
  })
})
