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
  writes, uploads, downloads: [], fetch: { state: 'idle', checkedAt: null, reason: null },
})

describe('ParseProgress', () => {
  let host: HTMLDivElement
  beforeEach(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    notice.success.mockClear()
  })
  afterEach(() => { host.remove(); status = null })

  it('显示当前步骤,解析成功后只通知已入库并自动收卡', async () => {
    const parsed = vi.fn()
    const root = createRoot(host)
    status = state([job()])
    await act(async () => { root.render(<MessagesProvider><ParseProgress onParsed={parsed} onOpenPaper={() => {}} /></MessagesProvider>) })
    expect(document.body.querySelector('.parse-float .upt')?.textContent).toContain('正在完善论文信息')
    expect(document.body.querySelector('.parse-float [role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('65')

    status = state([job({ step: 'done', found: 'arxiv', title: 'Parsed Paper' })], 1)
    await act(async () => { root.render(<MessagesProvider><ParseProgress onParsed={parsed} onOpenPaper={() => {}} /></MessagesProvider>) })
    expect(parsed).toHaveBeenCalledWith(expect.objectContaining({ title: 'Parsed Paper' }))
    expect(notice.success).toHaveBeenCalledWith('已入库')
    expect(document.body.querySelector('.parse-float')).toBeNull()
    await act(async () => { root.unmount() })
  })

  it('失败时只给补全提示,不暴露服务器状态', async () => {
    const root = createRoot(host)
    status = state([job({ step: 'failed', error: '服务器返回 429' })], 1)
    await act(async () => { root.render(<MessagesProvider><ParseProgress onParsed={() => {}} onOpenPaper={() => {}} /></MessagesProvider>) })
    expect(document.body.querySelector('.parse-float .upt')?.textContent).toContain('元数据暂未补全')
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
    expect(card()!.querySelector('.upt')!.textContent).toContain('2 篇论文已入库')
    expect(actions().map((button) => [button.textContent, button.className])).toEqual([['重试', 'btn sm'], ['填写元数据', 'btn sm']])
    await act(async () => { actions()[0]!.click() })
    expect(retried).toEqual(['p-failed'])
    expect(card()!.querySelector('.upt')!.textContent).toContain('1 篇论文已入库')
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
