// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  DiscoveryProfile, InboxDownloadResult, InboxEntry, JobsStatus,
} from '../../shared/contract.js'
import { IconCheck, IconSeen, IconTrash } from '../components/icons.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

let status: JobsStatus | null = null
const api = vi.hoisted(() => ({
  entries: [] as InboxEntry[],
  profiles: [] as DiscoveryProfile[],
  mode: 'watch' as 'watch' | 'discovery',
  dismiss: vi.fn<(id: string) => Promise<void>>(async () => {}),
  downloads: {} as Record<string, InboxDownloadResult>,
  feedback: vi.fn(async () => {}),
  setIntent: vi.fn(async () => {}),
  openCategory: vi.fn(),
}))

vi.mock('../ipc.js', () => ({
  inbox: {
    list: async (params: { kind?: InboxEntry['kind'] }) => api.entries
      .filter((entry) => params.kind === undefined || entry.kind === params.kind),
    dismiss: api.dismiss, readLater: async () => false,
    download: async (id: string) => api.downloads[id] ?? { kind: 'added', paper: 'p1' },
    fetch: async () => {},
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
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    api.entries = []
    api.profiles = []
    api.mode = 'watch'
    api.dismiss.mockClear()
    api.downloads = {}
    api.feedback.mockClear()
    api.setIntent.mockClear()
    api.openCategory.mockClear()
  })
  afterEach(() => { host.remove(); status = null; vi.unstubAllGlobals() })

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
    const more = host.querySelector<HTMLButtonElement>('[aria-label="更多类似"]')!
    await act(async () => { more.click() })
    expect(api.feedback).toHaveBeenCalledWith('d1', 'more')
    await act(async () => { root.unmount() })
  })

  it('发现按项目分组：每组标题带条数，点标题折叠这一组，其它组不受影响', async () => {
    const entry = (id: string, project: string, name: string): InboxEntry => ({
      id, kind: 'discovery', watch: '', project, source: `项目 · ${name}`,
      title: `Paper ${id}`, authors: 'Ada', venue: 'ICLR', abstract: 'Abstract', rec: '',
      reasons: [], downloaded: false, paper: '', pdf: 'https://arxiv.org/pdf/2609.1',
    })
    api.entries = [entry('d1', 'p1', '项目一'), entry('d2', 'p2', '项目二'), entry('d3', 'p1', '项目一')]
    api.mode = 'discovery'
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    const groups = [...host.querySelectorAll<HTMLElement>('.collapsible-group')]
    expect(groups.map((group) => group.dataset['group'])).toEqual(['p1', 'p2'])
    expect(groups[0]!.querySelector('.collapsible-group-title')?.textContent).toBe('项目 · 项目一')
    expect(groups[0]!.querySelector('.collapsible-group-count')?.textContent).toBe('2')
    expect(groups[0]!.querySelectorAll('.paper-card')).toHaveLength(2)

    await act(async () => { groups[0]!.querySelector<HTMLButtonElement>('.collapsible-group-toggle')!.click() })
    expect(groups[0]!.querySelector('.collapsible-group-toggle')?.getAttribute('aria-expanded')).toBe('false')
    expect(groups[0]!.querySelectorAll('.paper-card')).toHaveLength(0)
    expect(groups[1]!.querySelectorAll('.paper-card')).toHaveLength(1)
    await act(async () => { root.unmount() })
  })

  it('推送按关注分组：「全部忽略」只忽略自己这一组，这一组折叠着也一样', async () => {
    const entry = (id: string, watch: string): InboxEntry => ({
      id, kind: 'watch', watch, project: '', source: `主题 · ${watch}`,
      title: `Paper ${id}`, authors: 'Ada', venue: 'ICLR', abstract: 'Abstract', rec: '',
      reasons: [], downloaded: false, paper: '', pdf: 'https://arxiv.org/pdf/2609.1',
    })
    api.entries = [entry('a1', 'w1'), entry('b1', 'w2'), entry('a2', 'w1')]
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    const groups = [...host.querySelectorAll<HTMLElement>('.collapsible-group')]
    expect(groups.map((group) => group.dataset['group'])).toEqual(['w1', 'w2'])

    await act(async () => { groups[0]!.querySelector<HTMLButtonElement>('.collapsible-group-toggle')!.click() })
    const dismissAll = (group: HTMLElement) => [...group.querySelectorAll<HTMLButtonElement>('.collapsible-group-actions .btn')]
      .filter((button) => button.textContent === '全部忽略')
    await act(async () => { dismissAll(groups[0]!)[0]!.click() })
    await act(async () => { await new Promise((done) => { setTimeout(done, 300) }) })
    expect(api.dismiss.mock.calls.map(([id]) => id).sort()).toEqual(['a1', 'a2'])
    expect(groups[1]!.querySelectorAll('.paper-card.is-leaving')).toHaveLength(0)
    expect(dismissAll(groups[1]!)).toHaveLength(1)
    await act(async () => { root.unmount() })
  })

  it('一个图标只表示一种操作：忽略进垃圾桶画垃圾桶，已经了解不用选中的勾，更多类似按下后报出按下', async () => {
    const card = (kind: InboxEntry['kind']): InboxEntry => ({
      id: kind, kind, watch: kind === 'watch' ? 'w1' : '', project: kind === 'watch' ? '' : 'p1', source: '主题 · w1',
      title: `Paper ${kind}`, authors: 'Ada', venue: 'ICLR', abstract: 'Abstract', rec: '', feedback: 'more',
      reasons: [], downloaded: false, paper: '', pdf: 'https://arxiv.org/pdf/2609.1',
    })
    const glyph = (title: string) => host.querySelector(`[aria-label="${title}"] svg`)!.outerHTML
    api.entries = [card('watch')]
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    expect(glyph('忽略')).toBe(renderToStaticMarkup(<IconTrash />))
    await act(async () => { root.unmount() })

    api.entries = [card('discovery')]
    api.mode = 'discovery'
    const again = createRoot(host)
    await act(async () => { again.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    expect(glyph('已经了解')).toBe(renderToStaticMarkup(<IconSeen />))
    expect(glyph('已经了解')).not.toBe(renderToStaticMarkup(<IconCheck />))
    expect(host.querySelector('[aria-label="更多类似"]')!.getAttribute('aria-pressed')).toBe('true')
    await act(async () => { again.unmount() })
  })

  it('发现的卡片不能忽略，分组标题上也没有「全部忽略」', async () => {
    api.entries = [{
      id: 'd1', kind: 'discovery', watch: '', project: 'p1', source: '项目 · 项目一',
      title: 'A Discovery', authors: 'Ada', venue: 'ICLR', abstract: 'Abstract', rec: '',
      reasons: [], downloaded: false, paper: '', pdf: 'https://arxiv.org/pdf/2609.1',
    }]
    api.mode = 'discovery'
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    expect(host.querySelectorAll('.collapsible-group')).toHaveLength(1)
    expect(host.querySelector('[aria-label="忽略"]')).toBeNull()
    expect(host.querySelector('.collapsible-group-actions')).toBeNull()
    await act(async () => { root.unmount() })
  })

  it('检查新论文失败时状态行只显示失败原因', async () => {
    status = {
      writes: 0, uploads: [], downloads: [], fetch: { state: 'failed', checkedAt: null, reason: 'unavailable' },
    }
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    expect(host.querySelector('.fetchnote')?.textContent).toBe('检查失败 · 网络不可用')
    await act(async () => { root.unmount() })
  })

  it('下载失败时卡片上只显示失败原因与重试', async () => {
    const entry = (id: string): InboxEntry => ({
      id, kind: 'watch', watch: 'w1', project: '', source: '主题 · w1',
      title: `Paper ${id}`, authors: 'Ada', venue: 'ICLR', abstract: 'Abstract', rec: '',
      reasons: [], downloaded: false, paper: '', pdf: 'https://arxiv.org/pdf/2609.1',
    })
    api.entries = [entry('a1'), entry('a2')]
    api.downloads = {
      a1: { kind: 'failed', reason: 'unknown' },
      a2: { kind: 'failed', reason: 'server' },
    }
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    const card = (id: string) => host.querySelector<HTMLElement>(`.paper-card[data-pid="${id}"]`)!
    for (const id of ['a1', 'a2']) {
      await act(async () => { card(id).querySelector<HTMLButtonElement>('[aria-label="下载并入库"]')!.click() })
    }
    expect(card('a1').querySelector('.pfail span')?.textContent).toBe('下载失败')
    expect(card('a2').querySelector('.pfail span')?.textContent).toBe('下载失败 · 服务器出错')
    expect(card('a1').querySelector('.pfail .btn')?.textContent).toBe('重试')
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
    const gear = host.querySelector<HTMLButtonElement>('[aria-label="发现设置"]')!
    expect(gear.querySelector('svg')).not.toBeNull()
    expect(host.textContent).not.toContain('管理方向')
    expect(host.textContent).not.toContain('Draft Model')
    await act(async () => { gear.click() })
    expect(api.openCategory).toHaveBeenCalledWith('delivery-discovery')
    await act(async () => { root.unmount() })
  })
})
