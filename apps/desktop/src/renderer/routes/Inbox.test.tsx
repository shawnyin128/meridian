// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscoveryProfile, InboxEntry, JobsStatus } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

let status: JobsStatus | null = null
const api = vi.hoisted(() => ({
  entries: [] as InboxEntry[],
  profiles: [] as DiscoveryProfile[],
  mode: 'watch' as 'watch' | 'discovery',
  feedback: vi.fn(async () => {}),
  setIntent: vi.fn(async () => {}),
  openCategory: vi.fn(),
}))

vi.mock('../ipc.js', () => ({
  inbox: {
    list: async (params: { kind?: InboxEntry['kind'] }) => api.entries
      .filter((entry) => params.kind === undefined || entry.kind === params.kind),
    dismiss: async () => {}, readLater: async () => false,
    download: async () => ({ kind: 'added', paper: 'p1' }), fetch: async () => {},
  },
  discovery: {
    profiles: async () => api.profiles,
    fetch: async () => ({
      projects: api.profiles.length, intents: 0, added: 0, deferredProjects: 0,
      cachedIntents: 0, failedIntents: 0,
    }),
    setIntent: api.setIntent,
    feedback: api.feedback,
  },
  watch: { list: async () => [] },
}))
vi.mock('../shell/AppShell.js', () => ({
  ALL_WATCHES: 'all',
  useCrumbTail: () => {},
  useInboxMode: () => api.mode,
  useInboxScope: () => 'all',
  useJump: () => ({ open: vi.fn() }),
  useSettingsOpen: () => ({
    open: false, requestedCategory: null, setOpen: vi.fn(), openCategory: api.openCategory,
  }),
  useToast: () => vi.fn(),
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))
vi.mock('../shell/useJobs.js', () => ({ useJobs: () => status }))
vi.mock('../hooks/useVaultWrite.js', () => ({ useVaultWrite: () => (work: Promise<unknown>) => work }))

const { Inbox } = await import('./Inbox.js')

describe('Inbox', () => {
  let host: HTMLDivElement
  beforeEach(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    api.entries = []
    api.profiles = []
    api.mode = 'watch'
    api.feedback.mockClear()
    api.setIntent.mockClear()
    api.openCategory.mockClear()
  })
  afterEach(() => { host.remove(); status = null })

  it('后台进程还没重启、状态缺少新字段时仍能正常渲染', async () => {
    status = { writes: 0, uploads: [] } as unknown as JobsStatus
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    expect(host.querySelector('.desk-head .btn')?.textContent).toBe('检查新论文')
    expect(host.querySelector('.empty-state')).not.toBeNull()
    await act(async () => { root.unmount() })
  })

  it('把确定性关注与项目发现分开,并显示 Core 给出的推荐依据', async () => {
    api.profiles = [{
      id: 'p1', name: '项目一', seedCount: 2, positiveCount: 0, negativeCount: 0,
      intentCount: 1, lastFetchedAt: null,
      intents: [{
        id: 'i1', label: 'speculative · decoding', core: true, enabled: true, seedCount: 2,
        seeds: [{ id: 'ARXIV:1', title: 'Draft Model' }, { id: 'ARXIV:2', title: 'Verifier' }],
      }],
    }]
    api.entries = [{
      id: 'd1', kind: 'discovery', watch: '', project: 'p1', source: '项目 · 项目一',
      title: 'A Discovery', authors: 'Ada', venue: 'ICLR', abstract: 'Abstract', rec: '',
      reasons: [
        { kind: 'project', label: '来自项目「项目一」' },
        { kind: 'seed', label: '基于 2 篇相关论文' },
      ],
      downloaded: false, paper: '', pdf: 'https://arxiv.org/pdf/2609.1',
    }]
    api.mode = 'discovery'
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    expect(host.querySelector('.desk-head .t')?.textContent).toBe('论文发现 · 1')
    expect(host.querySelector('.prec')?.textContent)
      .toContain('来自项目「项目一」 · 基于 2 篇相关论文')
    const more = host.querySelector<HTMLButtonElement>('[title="更多类似"]')!
    await act(async () => { more.click() })
    expect(api.feedback).toHaveBeenCalledWith('d1', 'more')
    await act(async () => { root.unmount() })
  })

  it('发现页用小齿轮直接打开发现设置，不在页面重复渲染方向编辑器', async () => {
    api.mode = 'discovery'
    api.profiles = [{
      id: 'p1', name: '项目一', seedCount: 2, positiveCount: 0, negativeCount: 0,
      intentCount: 2, lastFetchedAt: null,
      intents: [
        {
          id: 'i1', label: 'draft · decoding', core: true, enabled: true, seedCount: 1,
          seeds: [{ id: 'ARXIV:1', title: 'Draft Model' }],
        },
        {
          id: 'i2', label: 'verification · tree', core: false, enabled: true, seedCount: 1,
          seeds: [{ id: 'ARXIV:2', title: 'Tree Verification' }],
        },
      ],
    }]
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    const gear = host.querySelector<HTMLButtonElement>('[title="发现设置"]')!
    expect(gear.querySelector('svg')).not.toBeNull()
    expect(host.textContent).not.toContain('管理方向')
    expect(host.textContent).not.toContain('Draft Model')
    await act(async () => { gear.click() })
    expect(api.openCategory).toHaveBeenCalledWith('delivery-discovery')
    await act(async () => { root.unmount() })
  })
})
