// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HarnessPaperWikiQuality, HarnessPlan, PaperReading, PaperRow,
} from '../../../shared/contract.js'
import { CallError } from '../../call-error.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'

const withMessages = (node: ReactNode) => {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
  return <MessagesProvider>{node}</MessagesProvider>
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
}))

vi.mock('../../ipc.js', () => ({
  harness: {
    pendingPaperWiki: api.pending,
    preparePaperWiki: api.prepare,
    start: api.start,
    cancel: api.cancel,
    applyPaperWiki: api.apply,
    rejectPaperWiki: api.reject,
  },
}))
vi.mock('../../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (operation: Promise<unknown>) => { await operation; return true },
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
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.replaceChildren(host)
    root = createRoot(host)
    api.prepare.mockReset().mockResolvedValue(plan)
    api.pending.mockReset().mockResolvedValue(null)
    api.start.mockReset().mockResolvedValue({
      id: 'run-1', planId: 'plan-1', workflow: 'paper-wiki', targetId: 'p1',
      startedAt: '2026-09-17T12:00:00.000Z', state: 'proposal-ready', message: '请审核',
      proposal: {
        id: 'proposal-1', targetId: 'p1', action: 'create', body: '# Draft', review, quality,
      },
    })
    api.cancel.mockReset().mockResolvedValue({ planId: 'plan-1', cancelled: true })
    api.apply.mockReset().mockResolvedValue({
      proposalId: 'proposal-1', wikiId: 'papers/p1', appliedAt: '2026-09-17T12:01:00.000Z',
    })
    api.reject.mockReset().mockResolvedValue({
      proposalId: 'proposal-1', rejectedAt: '2026-09-17T12:01:00.000Z',
    })
  })
  afterEach(() => act(() => root.unmount()))

  it('shows the generated proposal without applying until the user reviews and confirms', async () => {
    await act(async () => { root.render(withMessages(<PaperWikiIngest paper={paper} reading={reading} />)) })
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
    expect(host.querySelector('.wiki-ingest-review > .tag')?.textContent).toBe('Markdown 已修改')
    expect(api.start).toHaveBeenCalledTimes(1)
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '确认写入 Wiki')!.click()
    })
    expect(api.apply).toHaveBeenCalledWith('proposal-1', '# Reviewed')
    expect(host.textContent).toContain('已写入 Wiki')
  })

  it('names an audit record that could not be written by its reason, next to the ready proposal', async () => {
    api.start.mockResolvedValueOnce({
      id: 'run-1', planId: 'plan-1', workflow: 'paper-wiki', targetId: 'p1',
      startedAt: '2026-09-17T12:00:00.000Z', state: 'proposal-ready', message: '请审核', warning: 'write',
      proposal: { id: 'proposal-1', targetId: 'p1', action: 'create', body: '# Draft', review, quality },
    })
    await act(async () => { root.render(withMessages(<PaperWikiIngest paper={paper} reading={reading} />)) })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="start-harness"]')!.click()
    })

    expect(host.textContent).toContain('审计记录没能保存 · 没能写入论文库')
    expect(host.textContent).toContain('记住什么')
  })

  it('states that no model is connected in the neutral status tone, not as an error', async () => {
    api.prepare.mockResolvedValue({ ...plan, model: { ...plan.model, configured: false } })
    await act(async () => { root.render(withMessages(<PaperWikiIngest paper={paper} reading={reading} />)) })
    const tag = [...host.querySelectorAll('.tag')].find((t) => t.textContent === 'AI 未连接')!
    expect(tag.className).toBe('tag tag--label tag--neutral')
  })

  it('lets the user stop an in-flight run and requires a fresh confirmation afterward', async () => {
    let rejectRun: ((cause: CallError) => void) | undefined
    api.start.mockImplementation(() => new Promise((_resolve, reject) => { rejectRun = reject }))
    await act(async () => { root.render(withMessages(<PaperWikiIngest paper={paper} reading={reading} />)) })
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="start-harness"]')!.click())
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="cancel-harness"]')!.click()
    })
    expect(api.cancel).toHaveBeenCalledWith('plan-1')

    await act(async () => {
      rejectRun!(new CallError('harness.start', 'cancelled'))
    })
    expect(host.textContent).toContain('已停止生成')
    expect(host.querySelector('[data-testid="start-harness"]')).toBeNull()
    expect(host.textContent).toContain('重新准备')
  })

  it('recovers an unreviewed proposal without preparing or calling the model again', async () => {
    api.pending.mockResolvedValue({
      proposal: {
        id: 'proposal-old', targetId: 'p1', action: 'create', body: '# Recovered', review,
      },
      generatedAt: '2026-09-17T11:00:00.000Z',
      stale: false,
    })
    await act(async () => { root.render(withMessages(<PaperWikiIngest paper={paper} reading={reading} />)) })

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

  it('opens a legacy recovered proposal directly in Markdown mode', async () => {
    api.pending.mockResolvedValue({
      proposal: { id: 'proposal-old', targetId: 'p1', action: 'create', body: '# Legacy' },
      generatedAt: '2026-09-17T11:00:00.000Z',
      stale: false,
    })
    await act(async () => { root.render(withMessages(<PaperWikiIngest paper={paper} reading={reading} />)) })

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
    await act(async () => { root.render(withMessages(<PaperWikiIngest paper={paper} reading={reading} />)) })

    const apply = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '确认写入 Wiki')!
    expect(apply.disabled).toBe(true)
    expect(apply.parentElement!.querySelector('.tag')?.textContent).toBe('依据已变化 · 请重新生成')
  })

  it('states a missing model as a short tag, never a sentence', async () => {
    api.prepare.mockResolvedValue({ ...plan, model: { ...plan.model, configured: false } })
    await act(async () => { root.render(withMessages(<PaperWikiIngest paper={paper} reading={reading} />)) })
    expect(states()).toEqual(['无阅读记录', 'AI 未连接'])
    expect(host.querySelector('.wiki-ingest-status')).toBeNull()
  })

  it('collects optional local feedback before rejecting a proposal', async () => {
    await act(async () => { root.render(withMessages(<PaperWikiIngest paper={paper} reading={reading} />)) })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="start-harness"]')!.click()
    })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '丢弃提案')!.click()
    })

    expect(api.reject).not.toHaveBeenCalled()
    expect(host.querySelector('.wiki-ingest-rejection-head')!.textContent).toBe('可选：这份提案哪里不好？')
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
    expect([...host.querySelectorAll('.wiki-ingest-status')].map((line) => line.textContent)).toContain('提案已丢弃')
  })

  it('offers the rejection reasons as chips that each toggle on their own, not as segments', async () => {
    await act(async () => { root.render(withMessages(<PaperWikiIngest paper={paper} reading={reading} />)) })
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
    await act(async () => { root.render(withMessages(<PaperWikiIngest paper={paper} reading={reading} />)) })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="start-harness"]')!.click()
    })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '丢弃提案')!.click()
    })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '不反馈，直接丢弃')!.click()
    })

    expect(api.reject).toHaveBeenCalledWith('proposal-1', undefined)
  })
})
