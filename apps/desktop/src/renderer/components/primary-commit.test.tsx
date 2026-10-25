// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, HarnessPlan, PaperReading, PaperRow, WikiProposal } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

const api = vi.hoisted(() => ({ pending: vi.fn(), prepare: vi.fn() }))

vi.mock('../ipc.js', () => ({
  harness: { pendingPaperWiki: api.pending, preparePaperWiki: api.prepare },
  papers: { update: vi.fn(), get: vi.fn() },
  project: { list: () => new Promise(() => {}), addPaper: vi.fn(), removePaper: vi.fn() },
  appUpdates: { status: () => Promise.resolve({ phase: 'ready', version: '0.0.16.1' }), onChange: () => () => {}, install: vi.fn() },
  appMenu: { platform: () => 'darwin' },
}))
vi.mock('../shell/AppShell.js', async (original) => ({
  ...await original<typeof import('../shell/AppShell.js')>(),
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
  useSettingsOpen: () => ({ open: false, requestedCategory: null, setOpen: vi.fn(), openCategory: vi.fn() }),
  useJump: () => ({ jump: null, open: vi.fn() }),
}))

const { ReaderSidePanel } = await import('./reader/ReaderSidePanel.js')
const { ChatMessageView } = await import('./chat/ChatMessage.js')
const { ReviewQueue } = await import('./wiki/ReviewQueue.js')
const { Sidebar } = await import('../shell/Sidebar.js')
const { GenerationsContext } = await import('../hooks/useGenerations.js')
/** A shell in which Core is generating nothing. */
const IDLE = {
  running: () => false, run: async (work: Promise<unknown>) => { await work }, stop: vi.fn(),
  wikiRunning: () => false, stopWiki: vi.fn(async () => {}), wikiFailure: () => undefined, dismissWiki: vi.fn(async () => {}),
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** The controls the stylesheets fill with the solid accent; shared/state-colours.test.ts keeps this list in step with them. */
const SOLID_ACCENT = '.btn.pri, .send'

/** The solid-accent controls rendered under `root`. */
const solid = (root: ParentNode) => [...root.querySelectorAll(SOLID_ACCENT)]

const PAPER: PaperRow = {
  id: 'paper-1', title: '一篇论文', venue: 'arXiv', topics: [], methods: [], datasets: [], metrics: [],
  pageState: 'draft', readState: '未读', pageCount: 1, noteCount: 0, conclusionCount: 0,
  updated: '2026-01-01', custom: {}, projects: [],
}
const READING: PaperReading = {
  paperId: 'paper-1', remark: '一段随笔',
  highlights: [1, 2].map((n) => ({
    id: `highlight-${n}`, page: n, quote: `quote ${n}`, rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
    color: 'yellow' as const, note: n === 1 ? '' : '有批注', created: '2026-09-14', updated: '2026-09-14',
  })),
  notes: [1, 2].map((n) => ({ id: `note-${n}`, page: n, text: `笔记 ${n}`, created: '2026-09-14', updated: '2026-09-14' })),
}
const PLAN: HarnessPlan = {
  id: 'plan-1', workflow: 'paper-wiki', targetId: 'paper-1', scopeDigest: 'digest', action: 'create', label: '生成 Wiki',
  scope: { paperTitle: '一篇论文', paperPages: 1, highlights: 2, annotatedHighlights: 1, notes: 2, hasRemark: true, existingWikiChars: 0 },
  model: { provider: 'Provider', name: 'model', configured: true, billable: true },
  expiresAt: '2026-09-17T13:00:00.000Z',
}
const PROPOSAL = (id: string, over: Partial<WikiProposal> = {}): WikiProposal => ({
  id, digest: '0000000000000000', received: 0, path: 'review', status: 'queued', reason: null, decided: null,
  change: null, notice: null, staleNow: false, pages: ['topics/sd'], titles: {}, claimTexts: {},
  proposal: {
    protocol: 1, key: id, producer: { kind: 'ai', id: 'skill.meridian' }, trigger: { kind: 'manual' }, title: `提案 ${id}`, base: {},
    ops: [{ op: 'addClaim', page: 'topics/sd', claim: { id: 'wide', text: '新结论', evidence: [] } }],
  },
  ...over,
})

describe('每个屏幕只有一个主操作', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    api.pending.mockReset().mockResolvedValue(null)
    api.prepare.mockReset().mockResolvedValue(PLAN)
    host = document.createElement('div')
    document.body.replaceChildren(host)
    root = createRoot(host)
  })
  afterEach(() => act(() => root.unmount()))

  const show = (node: ReactNode) => act(async () => {
    root.render(<MessagesProvider><GenerationsContext.Provider value={IDLE}>{node}</GenerationsContext.Provider></MessagesProvider>)
  })

  it('阅读器右栏的每个面板都不放实心强调色:这一屏的主操作是论文对话的发送', async () => {
    for (const tab of ['highlights', 'notes', 'remark', 'wiki'] as const) {
      await show(
        <ReaderSidePanel
          tab={tab} onTab={vi.fn()} paper={PAPER} onPaper={vi.fn()} reading={READING} currentPage={1}
          saving={false} onMutate={vi.fn()} onSaveRemark={vi.fn()} onJump={vi.fn()} focusHighlightId={null} selectedHighlightId={null}
        />,
      )
      expect(solid(host).map((element) => element.textContent), tab).toEqual([])
    }
  })

  it('内化到 Wiki 恢复出待审的提案时,确认写入也不是实心强调色', async () => {
    api.pending.mockResolvedValue({
      proposal: { id: 'proposal-old', targetId: 'paper-1', action: 'create', body: '# Recovered' },
      generatedAt: '2026-09-17T11:00:00.000Z', stale: false,
    })
    await show(
      <ReaderSidePanel
        tab="wiki" onTab={vi.fn()} paper={PAPER} onPaper={vi.fn()} reading={READING} currentPage={1}
        saving={false} onMutate={vi.fn()} onSaveRemark={vi.fn()} onJump={vi.fn()} focusHighlightId={null} selectedHighlightId={null}
      />,
    )
    expect(host.textContent).toContain('确认写入 Wiki')
    expect(solid(host).map((element) => element.textContent)).toEqual([])
  })

  it('对话里各条回答的动作都不是实心强调色:这一屏的主操作是发送', async () => {
    const message = (id: string): ChatMessage => ({
      id, role: 'ai', runs: [{ kind: 'text', text: '可以记下这条结论' }],
      actions: [{ kind: 'writeBack', label: '写回项目', project: 'draft', text: '结论' }],
    })
    await show(<>{['m1', 'm2'].map((id) => <ChatMessageView key={id} message={message(id)} onAct={vi.fn()} />)}</>)
    expect(solid(host).map((element) => element.textContent)).toEqual([])
  })

  it('审阅队列只有第一条能应用的提案的应用是实心强调色', async () => {
    await show(
      <ReviewQueue
        proposals={[PROPOSAL('p1', { staleNow: true }), PROPOSAL('p2'), PROPOSAL('p3')]} failed={false} pending={false}
        onApply={vi.fn()} onDecline={vi.fn()} links={{ openPage: vi.fn(), openProject: vi.fn(), openReader: vi.fn() }}
        onOpenConclusion={vi.fn()}
      />,
    )
    expect(solid(host).map((element) => [element.closest('[data-proposal]')!.getAttribute('data-proposal'), element.textContent]))
      .toEqual([['p2', '应用']])
  })

  it('侧栏的更新提示不放实心强调色:主操作留给当前屏幕', async () => {
    await show(
      <Sidebar
        screen="feed" onNavigate={vi.fn()} onJump={vi.fn()} paperCount={0} changeCount={0} projectCount={0}
        trashCount={0} wikiCount={0} ideaCount={0} inboxScope="all" inboxMode="watch" onOpenInbox={vi.fn()}
        watches={[]} inboxWatches={[]} discoveryCount={0} discoveryProjects={[]} laterCount={0} chats={[]}
        chatId={null} onOpenChat={vi.fn()} onNewChat={vi.fn()} onArchiveChat={vi.fn()} onDeleteChat={vi.fn()}
        grip={{ label: '侧栏宽度', value: 232, min: 180, max: 360, onResize: vi.fn(), onReset: vi.fn() }} collapsed={false}
      />,
    )
    expect(host.querySelector('.update-row')).not.toBeNull()
    expect(solid(host).map((element) => element.textContent)).toEqual([])
  })

  it('侧栏的更新提示是共享的中性提示框,重启是它唯一的操作', async () => {
    await show(
      <Sidebar
        screen="feed" onNavigate={vi.fn()} onJump={vi.fn()} paperCount={0} changeCount={0} projectCount={0}
        trashCount={0} wikiCount={0} ideaCount={0} inboxScope="all" inboxMode="watch" onOpenInbox={vi.fn()}
        watches={[]} inboxWatches={[]} discoveryCount={0} discoveryProjects={[]} laterCount={0} chats={[]}
        chatId={null} onOpenChat={vi.fn()} onNewChat={vi.fn()} onArchiveChat={vi.fn()} onDeleteChat={vi.fn()}
        grip={{ label: '侧栏宽度', value: 232, min: 180, max: 360, onResize: vi.fn(), onReset: vi.fn() }} collapsed={false}
      />,
    )
    const row = host.querySelector('.update-row')!
    expect([row.matches('.inline-message--box.inline-message--info[role="status"]'), row.querySelector('.inline-message-lead svg') !== null,
      row.querySelector('.inline-message-text')?.textContent, row.querySelector('.inline-message-action')?.textContent])
      .toEqual([true, true, '新版本 0.0.16.1 已就绪', '重启'])
  })
})
