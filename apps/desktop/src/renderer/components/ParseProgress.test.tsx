// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobsStatus, MetadataJob } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

let status: JobsStatus | null = null
const banner = vi.fn()
vi.mock('../shell/AppShell.js', () => ({ useBanner: () => banner }))
vi.mock('../shell/useJobs.js', () => ({ useJobs: () => status }))
const { ParseProgress } = await import('./ParseProgress.js')

const job = (over: Partial<MetadataJob> = {}): MetadataJob => ({
  id: 'parse-1', batch: 1, paperId: 'p1', title: 'Paper', bytes: 100,
  step: 'lookup', found: null, error: null, ...over,
})
const state = (uploads: MetadataJob[], writes = 0): JobsStatus => ({
  writes, uploads, downloads: [], fetch: { state: 'idle', checkedAt: null, error: null },
})

describe('ParseProgress', () => {
  let host: HTMLDivElement
  beforeEach(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    banner.mockClear()
  })
  afterEach(() => { host.remove(); status = null })

  it('显示当前步骤,解析成功后通知并自动收卡', async () => {
    const parsed = vi.fn()
    const root = createRoot(host)
    status = state([job()])
    await act(async () => { root.render(<MessagesProvider><ParseProgress onParsed={parsed} /></MessagesProvider>) })
    expect(document.body.querySelector('.parse-float .upt')?.textContent).toContain('正在完善论文信息')
    expect(document.body.querySelector('.parse-float [role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('65')

    status = state([job({ step: 'done', found: 'arxiv', title: 'Parsed Paper' })], 1)
    await act(async () => { root.render(<MessagesProvider><ParseProgress onParsed={parsed} /></MessagesProvider>) })
    expect(parsed).toHaveBeenCalledWith(expect.objectContaining({ title: 'Parsed Paper' }))
    expect(banner).toHaveBeenCalledWith('已入库 · 元数据可在表格中修正')
    expect(document.body.querySelector('.parse-float')).toBeNull()
    await act(async () => { root.unmount() })
  })

  it('失败时只给补全提示,不暴露服务器状态', async () => {
    const root = createRoot(host)
    status = state([job({ step: 'failed', error: '服务器返回 429' })], 1)
    await act(async () => { root.render(<MessagesProvider><ParseProgress onParsed={() => {}} /></MessagesProvider>) })
    expect(document.body.querySelector('.parse-float .upt')?.textContent).toContain('元数据暂未补全')
    expect(document.body.textContent).not.toContain('服务器返回 429')
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
    await act(async () => { root.render(<MessagesProvider><ParseProgress onParsed={() => {}} /></MessagesProvider>) })
    expect(document.body.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('91')
    await act(async () => { root.unmount() })
  })
})
