// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  DiscoveryProfile, InboxDownloadResult, InboxEntry, JobsStatus, Watch,
} from '../../shared/contract.js'
import { IconCheck, IconSeen, IconTrash } from '../components/icons.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

let status: JobsStatus | null = null
const api = vi.hoisted(() => ({
  entries: [] as InboxEntry[],
  profiles: [] as DiscoveryProfile[],
  mode: 'watch' as 'watch' | 'discovery',
  dismiss: vi.fn<(id: string) => Promise<{ trash: string }>>(async (id) => ({ trash: `trash-${id}` })),
  restored: [] as string[],
  writes: [] as { result: unknown; opts: { note?: unknown; action?: (result: never) => { label: string; onAction: () => void } } }[],
  downloads: {} as Record<string, InboxDownloadResult>,
  feedback: vi.fn(async () => {}),
  setIntent: vi.fn(async () => {}),
  openCategory: vi.fn(),
  /** While true the inbox list never arrives. */
  loading: false,
  scope: 'all',
  watches: [] as Watch[],
  setActive: vi.fn(async () => {}),
  enter: vi.fn(),
  open: vi.fn(),
  /** The sort order of each inbox.list call, in order. */
  sorts: [] as (string | undefined)[],
}))

vi.mock('../ipc.js', () => ({
  inbox: {
    list: (params: { kind?: InboxEntry['kind']; sort?: string }) => {
      api.sorts.push(params.sort)
      return api.loading ? new Promise(() => {}) : Promise.resolve(api.entries
        .filter((entry) => params.kind === undefined || entry.kind === params.kind))
    },
    dismiss: api.dismiss, readLater: async () => false,
    download: async (id: string) => api.downloads[id] ?? { kind: 'added', paper: 'p1' },
    fetch: async () => {},
  },
  discovery: {
    profiles: async () => api.profiles,
    fetch: async () => ({
      projects: api.profiles.length, intents: 0, added: 0, deferredProjects: 0,
      cachedIntents: 0, failedIntents: 0, nothingNew: true, lastFetchedAt: null,
    }),
    setIntent: api.setIntent,
    feedback: api.feedback,
  },
  watch: { list: async () => api.watches, setActive: api.setActive },
  trash: { restore: async (id: string) => { api.restored.push(id) } },
}))
vi.mock('../shell/AppShell.js', () => ({
  ALL_WATCHES: 'all',
  useCrumbTail: () => {},
  useInboxMode: () => api.mode,
  useInboxScope: () => api.scope,
  useJump: () => ({ open: api.open, enter: api.enter }),
  useSettingsOpen: () => ({
    open: false, requestedCategory: null, setOpen: vi.fn(), openCategory: api.openCategory,
  }),
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))
vi.mock('../shell/useJobs.js', () => ({ useJobs: () => status }))
vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>, opts = {}) => { api.writes.push({ result: await work, opts }); return true },
}))

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
    api.open.mockClear()
  })
  afterEach(() => {
    host.remove()
    status = null
    api.loading = false
    api.scope = 'all'
    api.watches = []
    vi.unstubAllGlobals()
  })

  it('全部项目的发现为空、项目里还没有带 arXiv 编号的论文时，空状态只写状态，带一个打开项目列表的操作', async () => {
    api.mode = 'discovery'
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    const empty = host.querySelector('.empty-state')!
    expect(empty.querySelector('span')?.textContent).toBe('还没有带 arXiv 编号的项目论文')
    const action = empty.querySelector<HTMLButtonElement>('button')!
    expect(action.textContent).toBe('打开项目列表')
    act(() => action.click())
    expect(api.enter).toHaveBeenCalledWith('project')
    act(() => root.unmount())
  })

  it('暂停的关注在它自己的页上写着已暂停，旁边就能恢复', async () => {
    api.scope = 'w-paused'
    api.watches = [{ id: 'w-paused', type: 'topic', name: 'speculative decoding', active: false }]
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    const head = host.querySelector('.desk-head')!
    expect(head.querySelector('.tag.tag--label')?.textContent).toBe('已暂停')
    const resume = [...head.querySelectorAll('button')].find((button) => button.textContent === '恢复')!
    await act(async () => { resume.click() })
    expect(api.setActive).toHaveBeenCalledWith('w-paused', true)
    await act(async () => { root.unmount() })
  })

  it('列表空着时不摆排序，设置的齿轮还在', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    expect(host.querySelector('.empty-state')).not.toBeNull()
    expect(host.querySelector('.sort-menu')).toBeNull()
    expect(host.querySelector('.desk-head > .page-actions [aria-label="关注设置"]')).not.toBeNull()
    await act(async () => { root.unmount() })
  })

  it('推送还没读到时显示载入占位，不说暂时没有新的推送', async () => {
    api.loading = true
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    expect(host.querySelector('.empty-state')).toBeNull()
    expect(host.querySelector('.desk-body .loading-placeholder')).not.toBeNull()
    await act(async () => { root.unmount() })
  })

  it('后台进程还没重启、状态缺少新字段时仍能正常渲染', async () => {
    status = { writes: 0, uploads: [] } as unknown as JobsStatus
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    expect(host.querySelector('.desk-head .btn')?.textContent).toBe('检查新论文')
    expect(host.querySelector('.empty-state')).not.toBeNull()
    await act(async () => { root.unmount() })
  })

  it('排序、推送设置和检查新论文都是整页的操作,在屏头右端,检查在最后;正文开头没有工具栏', async () => {
    api.entries = [{
      id: 'a1', kind: 'watch', watch: 'w1', project: '', source: '主题 · w1',
      title: 'Paper a1', authors: 'Ada', venue: 'ICLR', abstract: 'Abstract', rec: '',
      reasons: [], downloaded: false, paper: '', pdf: 'https://arxiv.org/pdf/2609.1',
    }]
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    const actions = [...host.querySelector('.desk-head > .page-actions')!.children]
    expect(actions.map((child) => child.getAttribute('aria-label') ?? child.textContent)).toEqual(['', '排序', '关注设置', '检查新论文'])
    expect([actions[1]!.className, actions[2]!.className]).toEqual(['btn sort-menu', 'icbtn'])
    expect(host.querySelector('.desk-body > .page-toolbar')).toBeNull()
    await act(async () => { root.unmount() })
  })

  it('屏头的排序菜单列出收件的几种次序,勾着当前的那一种;选一种就一直按它排', async () => {
    api.entries = [{
      id: 'a1', kind: 'watch', watch: 'w1', project: '', source: '关键词 · w1',
      title: 'Paper a1', authors: 'Ada', venue: 'ICLR', abstract: 'Abstract', rec: '',
      reasons: [], downloaded: false, paper: '', pdf: 'https://arxiv.org/pdf/2609.1',
    }]
    api.sorts = []
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    const open = async () => {
      await act(async () => {
        host.querySelector('.desk-head .sort-menu')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      })
      return [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    }
    const items = await open()
    expect(items.map((item) => [item.textContent, item.getAttribute('aria-checked')])).toEqual([
      ['推荐', 'true'], ['最新', 'false'], ['已发表', 'false'], ['影响力', 'false'],
    ])
    await act(async () => { items[1]!.click() })
    expect(api.sorts.at(-1)).toBe('latest')
    expect((await open()).map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'false'])
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
    expect(groups[0]!.querySelector('.collapsible-group-count')?.textContent).toBe(' · 2')
    expect(groups[0]!.querySelectorAll('.paper-card')).toHaveLength(2)

    await act(async () => { groups[0]!.querySelector<HTMLButtonElement>('.collapsible-group-toggle')!.click() })
    expect(groups[0]!.querySelector('.collapsible-group-toggle')?.getAttribute('aria-expanded')).toBe('false')
    expect(groups[0]!.querySelectorAll('.paper-card')).toHaveLength(0)
    expect(groups[1]!.querySelectorAll('.paper-card')).toHaveLength(1)
    await act(async () => { root.unmount() })
  })

  it('同一个关键词关注早先存的主题 · 和现在的关键词 · 条目是一组,组名用现在的词,存的来源不改', async () => {
    const entry = (id: string, source: string): InboxEntry => ({
      id, kind: 'watch', watch: 'w1', project: '', source,
      title: `Paper ${id}`, authors: 'Ada', venue: 'ICLR', abstract: 'Abstract', rec: '',
      reasons: [], downloaded: false, paper: '', pdf: 'https://arxiv.org/pdf/2609.1',
    })
    api.entries = [entry('old', '主题 · speculative decoding'), entry('new', '关键词 · speculative decoding')]
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    expect([...host.querySelectorAll('.collapsible-group-title')].map((title) => title.textContent))
      .toEqual(['关键词 · speculative decoding'])
    expect(api.entries.map((held) => held.source)).toEqual(['主题 · speculative decoding', '关键词 · speculative decoding'])
    await act(async () => { root.unmount() })
  })

  it('推送按关注分组：「全部忽略」只忽略自己这一组，这一组折叠着也一样；提示里的撤销把这一组放回', async () => {
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
    const dismissed = api.writes.at(-1)!
    const action = dismissed.opts.action!(dismissed.result as never)
    expect([dismissed.opts.note, action.label]).toEqual(['已全部忽略', '撤销'])
    await act(async () => { action.onAction() })
    expect(api.restored.sort()).toEqual(['trash-a1', 'trash-a2'])
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

  it('上次检查的时刻像全 App 的时间一样写成日期与时刻', async () => {
    status = {
      writes: 0, uploads: [], downloads: [], fetch: { state: 'idle', checkedAt: new Date(2026, 8, 20, 14, 5).getTime(), reason: null },
    }
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    const note = host.querySelector('.fetchnote')!
    expect(note.firstChild!.textContent).toBe('上次检查')
    expect([...note.querySelectorAll('.date-time-display .date-chip')].map((chip) => chip.textContent)).toEqual(['9月20日', '14:05'])
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
    api.entries = [entry('a1'), entry('a2'), entry('a3')]
    api.downloads = {
      a1: { kind: 'failed', reason: 'unknown' },
      a2: { kind: 'failed', reason: 'server' },
      a3: { kind: 'failed', reason: 'write' },
    }
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    const card = (id: string) => host.querySelector<HTMLElement>(`.paper-card[data-pid="${id}"]`)!
    for (const id of ['a1', 'a2', 'a3']) {
      await act(async () => { card(id).querySelector<HTMLButtonElement>('[aria-label="下载并入库"]')!.click() })
    }
    expect(card('a1').querySelector('.pfail span')?.textContent).toBe('下载失败')
    expect(card('a2').querySelector('.pfail span')?.textContent).toBe('下载失败 · 服务器出错')
    expect(card('a3').querySelector('.pfail span')?.textContent).toBe('下载失败 · 没能写入论文库')
    expect(card('a1').querySelector('.pfail .btn')?.textContent).toBe('重试')
    await act(async () => { root.unmount() })
  })

  it('入库撞上库里已有的那一篇时,提示里的打开进的是库里那一篇', async () => {
    // As Core writes a new entry, it names no paper.
    api.entries = [{
      id: 'a1', kind: 'watch', watch: 'w1', project: '', source: '主题 · w1',
      title: 'Paper a1', authors: 'Ada', venue: 'ICLR', abstract: 'Abstract', rec: '',
      reasons: [], downloaded: false, paper: '', pdf: 'https://arxiv.org/pdf/2609.1',
    }]
    api.downloads = { a1: { kind: 'existing', paper: 'Held-Paper', title: 'Held Paper' } }
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Inbox /></MessagesProvider>) })
    const card = host.querySelector<HTMLElement>('.paper-card[data-pid="a1"]')!
    await act(async () => { card.querySelector<HTMLButtonElement>('[aria-label="下载并入库"]')!.click() })
    expect(card.querySelector('.pdup span')?.textContent).toBe('库里已经有这一篇：「Held Paper」')
    await act(async () => { card.querySelector<HTMLButtonElement>('.pdup .btn')!.click() })
    expect(api.open).toHaveBeenCalledWith('reader', 'Held-Paper')
    await act(async () => { root.unmount() })
  })

  it('发现页用小齿轮直接打开发现设置，不在页面重复渲染方向编辑器；概况只写数量', async () => {
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
    expect(host.querySelector('.discovery-note')?.textContent).toBe('1 个项目 · 2 个启用方向')
    expect(gear.querySelector('svg')).not.toBeNull()
    expect(host.textContent).not.toContain('管理方向')
    expect(host.textContent).not.toContain('Draft Model')
    await act(async () => { gear.click() })
    expect(api.openCategory).toHaveBeenCalledWith('delivery-discovery')
    await act(async () => { root.unmount() })
  })
})
