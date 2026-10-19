// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LaterEntry } from '../../shared/contract.js'
import { IconCross } from '../components/icons.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({ notes: [] as unknown[] }))

const ENTRY: LaterEntry = {
  id: 'later-1', title: 'MoE 路由用熵正则代替负载均衡 load balancing', source: 'arXiv', added: '2026-08-25',
  day: 'today', authors: 'Lin', venue: '', abstract: '', downloaded: true, paper: 'moe-entropy',
}

vi.mock('../ipc.js', () => ({
  inbox: { download: async () => ({ kind: 'added', paper: ENTRY.paper }) },
  later: { list: async () => [ENTRY], remove: async () => {} },
}))
vi.mock('../shell/AppShell.js', () => ({
  useJump: () => ({ open: vi.fn() }),
  useToast: () => vi.fn(),
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))
vi.mock('../shell/useJobs.js', () => ({ useJobs: () => null }))
vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>, opts: { note?: unknown } = {}) => {
    await work
    api.notes.push(opts.note)
    return true
  },
}))

const { Later } = await import('./Later.js')

describe('Later', () => {
  let host: HTMLDivElement
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    api.notes.length = 0
  })
  afterEach(() => { host.remove(); vi.unstubAllGlobals() })

  it('按时间/按来源是视图切换，放在正文开头的工具栏，屏头只有标题', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Later /></MessagesProvider>) })
    expect([...host.querySelector('.desk-head')!.children].map((child) => child.className)).toEqual(['t'])
    expect(host.querySelector('.desk-body > .page-toolbar .segmented-control')).not.toBeNull()
    await act(async () => { root.unmount() })
  })

  it('移出只是从队列里拿走，用表示移开的叉，不用进垃圾桶的图标', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Later /></MessagesProvider>) })
    expect(host.querySelector('button[title="移出"] svg')!.outerHTML).toBe(renderToStaticMarkup(<IconCross />))
    await act(async () => { root.unmount() })
  })

  it('按时间排时，论文从哪来写成中性的来源标签，不是醒目的强调徽标', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Later /></MessagesProvider>) })
    const metadata = host.querySelector('.paper-card-metadata')!
    expect(metadata.querySelector('.source-label')!.textContent).toBe('arXiv')
    expect(metadata.querySelector('.paper-card-badge')).toBeNull()
    await act(async () => { root.unmount() })
  })

  it('移出长标题的论文后，提示写出完整标题，标题放不下时淡出而不是截断', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Later /></MessagesProvider>) })
    await act(async () => { host.querySelector<HTMLButtonElement>('button[title="移出"]')!.click() })
    const toast = document.createElement('div')
    const shown = createRoot(toast)
    act(() => shown.render(<>{api.notes[0]}</>))
    expect(toast.textContent).toBe('已移出稍后阅读「MoE 路由用熵正则代替负载均衡 load balancing」')
    expect(toast.querySelector('.fade-text')!.textContent).toBe('MoE 路由用熵正则代替负载均衡 load balancing')
    act(() => shown.unmount())
    await act(async () => { root.unmount() })
  })
})
