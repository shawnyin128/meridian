// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobsStatus, MetadataJob } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

let status: JobsStatus | null = null
const notice = { success: vi.fn(), refusal: vi.fn() }
const retried = vi.hoisted(() => [] as string[])
vi.mock('../shell/AppShell.js', () => ({ useNotice: () => notice }))
vi.mock('../shell/useJobs.js', () => ({ useJobs: () => status }))
vi.mock('../ipc.js', () => ({ papers: { retryMetadata: (id: string) => { retried.push(id); return Promise.resolve() } } }))
const { ParseProgress } = await import('./ParseProgress.js')

const job = (over: Partial<MetadataJob> = {}): MetadataJob => ({
  id: 'parse-1', batch: 1, paperId: 'p1', title: 'Paper', bytes: 100,
  step: 'lookup', found: null, error: null, ...over,
})
const state = (uploads: MetadataJob[], writes = 0): JobsStatus => ({
  writes, uploads, downloads: [], fetch: { state: 'idle', checkedAt: null, reason: null }, generating: [], generatingWiki: [], wikiFailures: {},
})

describe('ParseProgress', () => {
  let host: HTMLDivElement
  beforeEach(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    // The count tag measures whether it fits, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    host = document.createElement('div')
    document.body.append(host)
    notice.success.mockClear()
  })
  afterEach(() => { host.remove(); status = null; vi.unstubAllGlobals() })

  it('处理中只有进度条和篇数,不写一句正在完善,解析成功后自动收卡,不弹通知', async () => {
    const parsed = vi.fn()
    const root = createRoot(host)
    status = state([job()])
    await act(async () => { root.render(<MessagesProvider><ParseProgress onParsed={parsed} onOpenPaper={() => {}} /></MessagesProvider>) })
    expect(document.body.querySelector('.parse-float .upt')?.textContent).toBe('1 篇')
    expect(document.body.querySelector('.parse-float [role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('65')

    status = state([job({ step: 'done', found: 'arxiv', title: 'Parsed Paper' })], 1)
    await act(async () => { root.render(<MessagesProvider><ParseProgress onParsed={parsed} onOpenPaper={() => {}} /></MessagesProvider>) })
    expect(parsed).toHaveBeenCalledWith(expect.objectContaining({ title: 'Parsed Paper' }))
    expect(notice.success).not.toHaveBeenCalled()
    expect(document.body.querySelector('.parse-float')).toBeNull()
    await act(async () => { root.unmount() })
  })

  it('失败时只给警示色的篇数和补全的动作,不写句子,不暴露服务器状态', async () => {
    const root = createRoot(host)
    status = state([job({ step: 'failed', error: '服务器返回 429' })], 1)
    await act(async () => { root.render(<MessagesProvider><ParseProgress onParsed={() => {}} onOpenPaper={() => {}} /></MessagesProvider>) })
    const tag = document.body.querySelector('.parse-float .upt .tag')
    expect([tag?.textContent, tag?.classList.contains('tag--warning'), document.body.querySelector('.parse-float .upt')?.textContent]).toEqual(['1 篇', true, '1 篇'])
    expect(document.body.textContent).not.toContain('服务器返回 429')
    await act(async () => { root.unmount() })
  })

  it('失败的卡片带着修复的动作:查询失败的可以重试,每一篇都能去填写元数据;处理过的那一篇离开卡片', async () => {
    const root = createRoot(host)
    const opened = vi.fn()
    retried.length = 0
    status = state([
      job({ id: 'a', paperId: 'p-failed', step: 'failed', error: '网络不可用' }),
      job({ id: 'b', paperId: 'p-none', step: 'done', found: 'none' }),
    ], 1)
    await act(async () => { root.render(<MessagesProvider><ParseProgress onParsed={() => {}} onOpenPaper={opened} /></MessagesProvider>) })
    const card = () => document.body.querySelector<HTMLElement>('.parse-float .upcard')
    const actions = () => [...card()!.querySelectorAll<HTMLButtonElement>('.upacts .btn')]
    expect(card()!.querySelector('.upt .tag')!.textContent).toBe('2 篇')
    expect(actions().map((button) => [button.textContent, button.className])).toEqual([['重试', 'btn sm'], ['填写元数据', 'btn sm']])
    await act(async () => { actions()[0]!.click() })
    expect(retried).toEqual(['p-failed'])
    expect(card()!.querySelector('.upt .tag')!.textContent).toBe('1 篇')
    expect(actions().map((button) => button.textContent)).toEqual(['填写元数据'])
    await act(async () => { actions()[0]!.click() })
    expect(opened).toHaveBeenCalledWith('p-none')
    expect(card()).toBeNull()
    await act(async () => { root.unmount() })
  })

  it('includes completed papers when calculating active-batch progress', async () => {
    const root = createRoot(host)
    status = state([
      ...Array.from({ length: 18 }, (_, index) => job({
        id: `done-${index}`, paperId: `done-paper-${index}`, step: 'done', found: 'arxiv',
      })),
      job({ id: 'waiting-1', paperId: 'waiting-paper-1', step: 'read' }),
      job({ id: 'waiting-2', paperId: 'waiting-paper-2', step: 'read' }),
    ])
    await act(async () => { root.render(<MessagesProvider><ParseProgress onParsed={() => {}} onOpenPaper={() => {}} /></MessagesProvider>) })
    expect(document.body.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('91')
    await act(async () => { root.unmount() })
  })
})
