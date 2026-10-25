// @vitest-environment jsdom
import { act, useCallback, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HarnessPaperWikiQuality, HarnessPlan, JobsStatus, PaperReading, PaperRow,
} from '../../../shared/contract.js'
import { CallError } from '../../call-error.js'
import type { EditDraft } from '../../hooks/useDrafts.js'
import type { NoticeAction } from '../Notice.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'

/** The papers Core is running a Wiki proposal for, and how to make the shell ask Core for a new report now. */
const core = vi.hoisted(() => ({ runs: new Set<string>(), failures: {} as Record<string, 'model' | 'cancelled'>, poll: () => {} }))

/** The shell's generations over Core's reported runs, and its model status, as AppShell provides them. */
function Shell({ children }: { children: ReactNode }) {
  const reported = (): JobsStatus => ({
    writes: 0, uploads: [], downloads: [], fetch: { state: 'idle', checkedAt: null, reason: null },
    generating: [], generatingWiki: [...core.runs], wikiFailures: { ...core.failures },
  })
  const [status, setStatus] = useState(reported)
  const refresh = useCallback(() => setStatus(reported()), [])
  core.poll = refresh
  return (
    <GenerationsContext.Provider value={useCoreGenerations(status, refresh)}>
      <ModelStatusContext.Provider value={{ connected: api.connected, source: api.connected ? 'api' : null, track: (send) => send }}>
        {children}
      </ModelStatusContext.Provider>
    </GenerationsContext.Provider>
  )
}

const withMessages = (node: ReactNode) => {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
  return <MessagesProvider><Shell>{node}</Shell></MessagesProvider>
}

const review = {
  schemaVersion: 'meridian.paper-wiki-review.v1' as const,
  sections: [{
    id: 'remember', title: '记住什么', emptyLabel: '没有内容', groups: [{
      id: 'problem', title: '论文问题', provenance: 'paper-source' as const,
      anchors: ['page:1'], rows: [{ text: 'Problem' }],
    }],
  }],
}

const quality: HarnessPaperWikiQuality = {
  schemaVersion: 'meridian.paper-wiki-calibration.v1', caseId: 'p1', passed: true,
  dimensions: [
    'grounding', 'separation', 'retrieval', 'mechanism', 'evidence', 'implementation', 'uncertainty',
  ].map((id) => ({ id, passed: true })) as HarnessPaperWikiQuality['dimensions'],
  findings: [],
}

const api = vi.hoisted(() => ({
  pending: vi.fn(),
  prepare: vi.fn(),
  start: vi.fn(),
  cancel: vi.fn(),
  apply: vi.fn(),
  reject: vi.fn(),
  undo: vi.fn(),
  dismiss: vi.fn(),
  revision: 0,
  notices: [] as { note: unknown; action: NoticeAction | undefined }[],
  settingsOpen: false,
  /** Whether the shell's model status says a model is set up. */
  connected: true,
  openCategory: vi.fn(),
  open: vi.fn(),
  jump: vi.fn(),
}))

vi.mock('../../ipc.js', () => ({
  appMenu: { platform: () => 'darwin' },
  harness: {
    pendingPaperWiki: api.pending,
    preparePaperWiki: api.prepare,
    // Core counts a paper's run from its start until it settles or is stopped.
    start: (plan: HarnessPlan) => {
      core.runs.add(plan.targetId)
      return Promise.resolve(api.start(plan)).finally(() => core.runs.delete(plan.targetId))
    },
    cancel: (paperId: string) => {
      core.runs.delete(paperId)
      return api.cancel(paperId)
    },
    dismissFailure: (paperId: string) => {
      delete core.failures[paperId]
      return api.dismiss(paperId)
    },
    applyPaperWiki: api.apply,
    rejectPaperWiki: api.reject,
  },
  changelog: { undo: api.undo },
  trash: { restore: vi.fn() },
}))
vi.mock('../../shell/AppShell.js', () => ({
  useSettingsOpen: () => ({ open: api.settingsOpen, openCategory: api.openCategory }),
  useJump: () => ({ jump: null, open: api.open }),
  useVaultRevision: () => ({ revision: api.revision, bump: vi.fn() }),
}))
vi.mock('../../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (operation: Promise<unknown>, opts?: {
    note?: unknown; action?: (result: unknown) => NoticeAction
  }) => {
    const result = await operation
    api.notices.push({ note: opts?.note, action: opts?.action?.(result) })
    return true
  },
}))
vi.mock('../HarnessAction.js', () => ({
  HarnessAction: ({ running, onStart, onCancel }: {
    running: boolean; onStart: () => void; onCancel: () => void
  }) => (
    <button data-testid={running ? 'cancel-harness' : 'start-harness'}
      onClick={running ? onCancel : onStart}>{running ? '停止' : '生成'}</button>
  ),
}))

const { PaperWikiIngest } = await import('./PaperWikiIngest.js')
const { GenerationsContext, useCoreGenerations } = await import('../../hooks/useGenerations.js')
const { ModelStatusContext } = await import('../../hooks/useModelStatus.js')
const { useDrafts } = await import('../../hooks/useDrafts.js')

/** The panel with the drafts the reader's rail keeps for it. */
function Panel(props: Omit<Parameters<typeof PaperWikiIngest>[0], 'edits'>) {
  return <PaperWikiIngest {...props} edits={useDrafts<EditDraft>(['paper', props.paper.id, 'wiki-ingest'])} />
}

const paper = {
  id: 'p1', title: 'Paper', authors: ['A'], venue: 'arXiv', abstract: '', topics: [], methods: [],
  datasets: [], metrics: [], pageState: 'draft', readState: '未读', projects: [], pageCount: 1,
  noteCount: 0, conclusionCount: 0, updated: '2026-09-17', custom: {},
} satisfies PaperRow
const reading = {
  paperId: 'p1', highlights: [], notes: [], remark: '',
} satisfies PaperReading
const plan = {
  id: 'plan-1', workflow: 'paper-wiki', targetId: 'p1', scopeDigest: 'digest', action: 'create',
  label: '生成 Wiki', scope: {
    paperTitle: 'Paper', paperPages: 1, highlights: 0, annotatedHighlights: 0, notes: 0,
    hasRemark: false, existingWikiChars: 0,
  },
  model: { provider: 'Provider', name: 'model', configured: true, billable: true },
  expiresAt: '2026-09-17T13:00:00.000Z',
} satisfies HarnessPlan

describe('PaperWikiIngest', () => {
  let host: HTMLDivElement
  let root: Root
  const states = () => [...host.querySelectorAll('.wiki-ingest-body > .tag')].map((tag) => tag.textContent)
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.replaceChildren(host)
    root = createRoot(host)
    api.prepare.mockReset().mockResolvedValue(plan)
    api.connected = true
    api.pending.mockReset().mockResolvedValue(null)
    api.start.mockReset().mockResolvedValue({
      id: 'run-1', planId: 'plan-1', workflow: 'paper-wiki', targetId: 'p1',
      startedAt: '2026-09-17T12:00:00.000Z', state: 'proposal-ready', message: '请审核',
      proposal: {
        id: 'proposal-1', targetId: 'p1', action: 'create', body: '# Draft', review, quality,
      },
    })
    api.cancel.mockReset().mockResolvedValue({ paperId: 'p1', cancelled: true })
    core.runs.clear()
    core.failures = {}
    api.dismiss.mockReset().mockResolvedValue(null)
    api.apply.mockReset().mockResolvedValue({
      proposalId: 'proposal-1', wikiId: 'papers/p1', appliedAt: '2026-09-17T12:01:00.000Z',
    })
    api.reject.mockReset().mockResolvedValue({
      proposalId: 'proposal-1', rejectedAt: '2026-09-17T12:01:00.000Z',
    })
    api.undo.mockReset().mockResolvedValue(undefined)
    api.notices = []
  })
  afterEach(() => act(() => root.unmount()))

  it('shows the generated proposal without applying until the user reviews and confirms', async () => {
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="start-harness"]')!.click()
    })
    expect(api.apply).not.toHaveBeenCalled()
    expect(host.querySelector('.wiki-ingest-intro')).toBeNull()
    expect(host.querySelector('.wiki-ingest-body > small')).toBeNull()
    expect(host.textContent).toContain('记住什么')
    expect(host.textContent).toContain('论文原文')
    expect(host.textContent).toContain('7 项规则检查未发现问题')
    expect(host.querySelector('[aria-label="Wiki 提案内容"]')).toBeNull()
    expect(api.start).toHaveBeenCalledTimes(1)

    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === 'Markdown 编辑')!.click()
    })
    const editor = host.querySelector<HTMLTextAreaElement>('[aria-label="Wiki 提案内容"]')!
    expect(editor.value).toBe('# Draft')

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(editor, '# Reviewed')
      editor.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '结构化审核')!.click()
    })
    expect(host.querySelector('.wiki-ingest-review .proposal-change > .tag')?.textContent).toBe('Markdown 已修改')
    expect(api.start).toHaveBeenCalledTimes(1)
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '确认写入 Wiki')!.click()
    })
    expect(api.apply).toHaveBeenCalledWith('proposal-1', '# Reviewed')
    expect([...host.querySelectorAll('.wiki-ingest-status.inline-message--line.inline-message--done')].map((line) => line.textContent))
      .toEqual(['请审核', '已写入 Wiki'])
  })

  it('offers Undo in the notice of the Wiki write, undoing the change entry that write recorded', async () => {
    api.apply.mockResolvedValueOnce({
      proposalId: 'proposal-1', wikiId: 'papers/p1', appliedAt: '2026-09-17T12:01:00.000Z', change: 'change-9',
    })
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="start-harness"]')!.click()
    })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '确认写入 Wiki')!.click()
    })

    expect(api.notices.map(({ note, action }) => [note, action?.label])).toEqual([['Wiki 提案已写入论文页', '撤销']])
    await act(async () => { api.notices[0]!.action!.onAction() })
    expect(api.undo).toHaveBeenCalledExactlyOnceWith('change-9')
  })

  it('once its write is undone, shows the proposal for review again and no longer says it is written', async () => {
    const render = () => act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    await render()
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-testid="start-harness"]')!.click() })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '确认写入 Wiki')!.click()
    })
    expect(host.textContent).toContain('已写入 Wiki')

    api.pending.mockResolvedValue({
      proposal: { id: 'proposal-1', targetId: 'p1', action: 'create', body: '# Draft', review, quality },
      generatedAt: '2026-09-17T12:00:00.000Z',
      stale: false,
    })
    api.revision += 1
    await render()
    expect(host.textContent).not.toContain('已写入 Wiki')
    expect([...host.querySelectorAll('button')].some((button) => button.textContent === '确认写入 Wiki')).toBe(true)
    expect(api.start).toHaveBeenCalledOnce()
  })

  it('names an audit record that could not be written by its reason, next to the ready proposal', async () => {
    api.start.mockResolvedValueOnce({
      id: 'run-1', planId: 'plan-1', workflow: 'paper-wiki', targetId: 'p1',
      startedAt: '2026-09-17T12:00:00.000Z', state: 'proposal-ready', message: '请审核', warning: 'write',
      proposal: { id: 'proposal-1', targetId: 'p1', action: 'create', body: '# Draft', review, quality },
    })
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="start-harness"]')!.click()
    })

    expect([...host.querySelectorAll('.wiki-ingest-status.inline-message--line.inline-message--error[role="alert"]')]
      .map((line) => line.textContent)).toEqual(['审计记录没能保存 · 没能写入论文库'])
    expect(host.textContent).toContain('记住什么')
  })

  it('states that no model is connected in the neutral status tone, not as an error', async () => {
    api.prepare.mockResolvedValue({ ...plan, model: { ...plan.model, configured: false } })
    api.connected = false
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    const tag = [...host.querySelectorAll('.tag')].find((t) => t.textContent === 'AI 未连接')!
    expect(tag.className).toBe('tag tag--label tag--neutral')
  })

  it('AI 未连接 is the button that opens Settings at 模型, and the plan is prepared again once the model status says a model is set up', async () => {
    api.openCategory.mockReset()
    api.connected = false
    api.prepare.mockResolvedValue({ ...plan, model: { ...plan.model, configured: false } })
    const render = () => act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    await render()
    const tag = [...host.querySelectorAll<HTMLElement>('.tag')].find((t) => t.textContent === 'AI 未连接')!
    expect(tag.tagName).toBe('BUTTON')
    act(() => tag.click())
    expect(api.openCategory).toHaveBeenCalledWith('model')
    await render()
    expect(api.prepare).toHaveBeenCalledTimes(1)
    api.prepare.mockResolvedValue(plan)
    api.connected = true
    await render()
    expect(api.prepare).toHaveBeenCalledTimes(2)
    expect(states()).not.toContain('AI 未连接')
    await render()
    expect(api.prepare).toHaveBeenCalledTimes(2)
  })

  it('takes whether a model is set up from the plan Core prepared, and prepares it again once the model status changes', async () => {
    const render = () => act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    await render()
    expect(api.prepare).toHaveBeenCalledTimes(1)
    // The demo library's plan has a model of Core's own while no model is set up in Settings.
    api.connected = false
    await render()
    expect(api.prepare).toHaveBeenCalledTimes(2)
    expect(states()).not.toContain('AI 未连接')
    api.prepare.mockResolvedValue({ ...plan, model: { ...plan.model, configured: false } })
    api.connected = true
    await render()
    expect(api.prepare).toHaveBeenCalledTimes(2)
    api.connected = false
    await render()
    expect(api.prepare).toHaveBeenCalledTimes(3)
    expect(states()).toContain('AI 未连接')
  })

  it('lets the user stop an in-flight run and requires a fresh confirmation afterward', async () => {
    let rejectRun: ((cause: CallError) => void) | undefined
    api.start.mockImplementation(() => new Promise((_resolve, reject) => { rejectRun = reject }))
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="start-harness"]')!.click())
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="cancel-harness"]')!.click()
    })
    expect(api.cancel).toHaveBeenCalledWith('p1')

    await act(async () => {
      rejectRun!(new CallError('harness.start', 'cancelled'))
    })
    expect(host.textContent).toContain('已停止生成')
    expect(host.querySelector('[data-testid="start-harness"]')).toBeNull()
    expect(host.textContent).toContain('重新准备')
  })

  it('shows a run Core reports for the paper as running when it opens, with Stop and no Start, and Stop stops that run', async () => {
    core.runs.add('p1')
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })

    expect(host.querySelector('[data-testid="start-harness"]')).toBeNull()
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-testid="cancel-harness"]')!.click() })
    expect(api.cancel).toHaveBeenCalledExactlyOnceWith('p1')
    expect(api.start).not.toHaveBeenCalled()
    expect(host.querySelector('[data-testid="start-harness"]')).not.toBeNull()
  })

  it('shows why the paper\'s last run failed when it opens, without Start, until 重新准备 dismisses it', async () => {
    core.failures = { p1: 'model' }
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })

    expect([...host.querySelectorAll('.wiki-ingest-status.inline-message--error')].map((line) => line.textContent)).toEqual(['模型调用失败'])
    expect(host.querySelector('[data-testid="start-harness"]')).toBeNull()
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '重新准备')!.click()
    })
    expect(api.dismiss).toHaveBeenCalledExactlyOnceWith('p1')
    expect(host.querySelector('.wiki-ingest-status.inline-message--error')).toBeNull()
    expect(host.querySelector('[data-testid="start-harness"]')).not.toBeNull()
  })

  it('keeps the edited Markdown through the write, so an undo brings back what was reviewed', async () => {
    const render = () => act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    await render()
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-testid="start-harness"]')!.click() })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Markdown 编辑')!.click()
    })
    const editor = host.querySelector<HTMLTextAreaElement>('[aria-label="Wiki 提案内容"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor, '# Reviewed')
      editor.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '确认写入 Wiki')!.click()
    })
    api.pending.mockResolvedValue({
      proposal: { id: 'proposal-1', targetId: 'p1', action: 'create', body: '# Draft', review, quality },
      generatedAt: '2026-09-17T12:00:00.000Z',
      stale: false,
    })
    api.revision += 1
    await render()
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Markdown 编辑')!.click()
    })
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Wiki 提案内容"]')!.value).toBe('# Reviewed')
  })

  it('once a run it did not start ends, shows the proposal that run made without another run', async () => {
    core.runs.add('p1')
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    expect(host.querySelector('[data-testid="cancel-harness"]')).not.toBeNull()

    core.runs.delete('p1')
    api.pending.mockResolvedValue({
      proposal: { id: 'proposal-1', targetId: 'p1', action: 'create', body: '# Draft', review, quality },
      generatedAt: '2026-09-17T12:00:00.000Z',
      stale: false,
    })
    await act(async () => { core.poll() })
    expect(api.start).not.toHaveBeenCalled()
    expect(host.textContent).toContain('记住什么')
    expect(host.querySelector('[data-testid="start-harness"]')).toBeNull()
  })

  it('recovers an unreviewed proposal without preparing or calling the model again', async () => {
    api.pending.mockResolvedValue({
      proposal: {
        id: 'proposal-old', targetId: 'p1', action: 'create', body: '# Recovered', review,
      },
      generatedAt: '2026-09-17T11:00:00.000Z',
      stale: false,
    })
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })

    expect(api.prepare).not.toHaveBeenCalled()
    expect(api.start).not.toHaveBeenCalled()
    expect(states()).toEqual(['无阅读记录', '已恢复上次的提案'])
    expect(host.textContent).toContain('记住什么')

    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '确认写入 Wiki')!.click()
    })
    expect(api.apply).toHaveBeenCalledWith('proposal-old', '# Recovered')
  })

  it('decides a recovered proposal like the review queue: the view switch in the heading, 丢弃提案 first as the red ghost, 确认写入 last and not the primary', async () => {
    api.pending.mockResolvedValue({
      proposal: { id: 'proposal-old', targetId: 'p1', action: 'create', body: '# Recovered', review },
      generatedAt: '2026-09-17T11:00:00.000Z',
      stale: false,
    })
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })

    const heading = host.querySelector('.wiki-ingest-review > .section-heading')!
    expect(heading.querySelector(':scope > .section-heading-actions > .segmented-control')!.getAttribute('aria-label'))
      .toBe('Wiki 提案审核视图')
    const decide = [...host.querySelectorAll<HTMLButtonElement>('.wiki-ingest-review .proposal-decision > button')]
    expect(decide.map((button) => `${button.textContent} ${button.className}`))
      .toEqual(['丢弃提案 btn ghost danger sm', '确认写入 Wiki btn sm'])
  })

  it('opens a legacy recovered proposal directly in Markdown mode', async () => {
    api.pending.mockResolvedValue({
      proposal: { id: 'proposal-old', targetId: 'p1', action: 'create', body: '# Legacy' },
      generatedAt: '2026-09-17T11:00:00.000Z',
      stale: false,
    })
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })

    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Wiki 提案内容"]')?.value)
      .toBe('# Legacy')
    expect(host.textContent).not.toContain('结构化审核')
  })

  it('keeps a recovered stale proposal reviewable but prevents applying it', async () => {
    api.pending.mockResolvedValue({
      proposal: { id: 'proposal-old', targetId: 'p1', action: 'create', body: '# Stale' },
      generatedAt: '2026-09-17T11:00:00.000Z',
      stale: true,
    })
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })

    const apply = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '确认写入 Wiki')!
    expect(apply.disabled).toBe(true)
    expect([...apply.parentElement!.children].map((part) => [part.tagName, part.textContent]))
      .toEqual([['BUTTON', '丢弃提案'], ['BUTTON', '确认写入 Wiki'], ['BUTTON', '依据已变 · 丢弃']])
    expect(host.querySelector('.wiki-ingest-rejection')).toBeNull()
    await act(async () => { (apply.parentElement!.lastElementChild as HTMLButtonElement).click() })
    expect(host.querySelector('.wiki-ingest-rejection')).not.toBeNull()
  })

  it('shows a proposal as the review queue does: the change, the paper\'s Wiki page and the agent with its day on the first line, then what it writes', async () => {
    api.pending.mockResolvedValue({
      proposal: { id: 'proposal-old', targetId: 'p1', action: 'update', body: '# Recovered', review },
      generatedAt: '2026-09-17T11:00:00.000Z',
      stale: false,
    })
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })

    const card = host.querySelector('.wiki-ingest-review .proposal-card')!
    const where = card.querySelector('.proposal-change > .proposal-where')!
    expect([...where.children].map((part) => part.textContent)).toEqual(['更新内容', '→', 'Paper', 'agent9月17日'])
    expect(card.querySelector('.proposal-change .paper-wiki-structured-review')).not.toBeNull()
    expect(host.querySelector('.wiki-ingest-review > .section-heading')!.textContent).not.toContain('更新内容')
    await act(async () => { where.querySelector<HTMLButtonElement>('.proposal-target .entity-link')!.click() })
    expect(api.open).toHaveBeenCalledWith('wiki', 'papers/p1')
    await act(async () => { card.querySelector<HTMLButtonElement>('.source-anchor')!.click() })
    expect(api.jump).toHaveBeenCalledWith(1)
  })

  it('shows the loading placeholder while the scope is prepared, never a sentence about preparing', async () => {
    api.prepare.mockReturnValue(new Promise(() => {}))
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    expect([host.querySelector('.loading-placeholder--lines') !== null, host.querySelector('.wiki-ingest-status')]).toEqual([true, null])
  })

  it('states a missing model as a short tag, never a sentence', async () => {
    api.prepare.mockResolvedValue({ ...plan, model: { ...plan.model, configured: false } })
    api.connected = false
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    expect(states()).toEqual(['无阅读记录', 'AI 未连接'])
    expect(host.querySelector('.wiki-ingest-status')).toBeNull()
  })

  it('states the reading records it includes as a short tag, never a sentence', async () => {
    const notes = [1, 2].map((page) => ({ id: `n${page}`, page, text: '笔记', created: '2026-09-14', updated: '2026-09-14' }))
    await act(async () => {
      root.render(withMessages(<Panel paper={paper} reading={{ ...reading, notes, remark: '随笔' }} onJump={api.jump} />))
    })
    expect(states()).toEqual(['3 条阅读记录'])
    expect(host.querySelector('.wiki-ingest-tip')).toBeNull()
  })

  it('collects optional local feedback before rejecting a proposal, opening on the reasons without a question above them', async () => {
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="start-harness"]')!.click()
    })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '丢弃提案')!.click()
    })

    expect(api.reject).not.toHaveBeenCalled()
    expect(host.querySelector('.wiki-ingest-rejection')!.firstElementChild!.matches('.wiki-ingest-rejection-reasons')).toBe(true)
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '论文事实不准确')!.click()
    })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '遗漏重要内容')!.click()
    })
    const note = host.querySelector<HTMLTextAreaElement>('[aria-label="丢弃提案的补充说明"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(note, '第 4 页的限制条件被遗漏。')
      note.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '记录反馈并丢弃')!.click()
    })

    expect(api.reject).toHaveBeenCalledWith('proposal-1', {
      reasons: ['source-inaccurate', 'missing-important'],
      note: '第 4 页的限制条件被遗漏。',
    })
    expect([...host.querySelectorAll('.wiki-ingest-status.inline-message--info')].map((line) => line.textContent)).toContain('提案已丢弃')
  })

  it('discards with the note on ⌘Enter in the note, as its discard button does; a plain Enter starts a new line', async () => {
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-testid="start-harness"]')!.click() })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '丢弃提案')!.click()
    })
    const note = host.querySelector<HTMLTextAreaElement>('[aria-label="丢弃提案的补充说明"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(note, '少了第 4 页的限制条件。')
      note.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const key = (init: KeyboardEventInit) => act(async () => {
      note.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
    })
    await key({ key: 'Enter' })
    expect(api.reject).not.toHaveBeenCalled()
    await key({ key: 'Enter', metaKey: true })
    expect(api.reject).toHaveBeenCalledExactlyOnceWith('proposal-1', { reasons: ['other'], note: '少了第 4 页的限制条件。' })
  })

  it('writes the proposal to the Wiki only on a click of 确认写入 Wiki, never on ⌘Enter in its content', async () => {
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-testid="start-harness"]')!.click() })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Markdown 编辑')!.click()
    })
    const editor = host.querySelector<HTMLTextAreaElement>('[aria-label="Wiki 提案内容"]')!
    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }))
    })
    expect(api.apply).not.toHaveBeenCalled()
  })

  it('offers the rejection reasons as chips that each toggle on their own, not as segments', async () => {
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="start-harness"]')!.click()
    })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '丢弃提案')!.click()
    })

    const reasons = host.querySelector('[aria-label="丢弃原因"]')!
    expect(reasons.classList.contains('chip-toggles')).toBe(true)
    expect(reasons.classList.contains('segmented-control')).toBe(false)
    const chip = [...reasons.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '遗漏重要内容')!
    expect(chip.classList.contains('tagchip')).toBe(true)
    await act(async () => { chip.click() })
    expect(chip.getAttribute('aria-pressed')).toBe('true')
  })

  it('allows rejecting without providing feedback', async () => {
    await act(async () => { root.render(withMessages(<Panel paper={paper} reading={reading} onJump={api.jump} />)) })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="start-harness"]')!.click()
    })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '丢弃提案')!.click()
    })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '直接丢弃')!.click()
    })

    expect(api.reject).toHaveBeenCalledWith('proposal-1', undefined)
  })
})
