import { describe, expect, it, vi } from 'vitest'
import type { HarnessPaperWikiQuality, PaperReading, PaperRow, WikiPaper } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import { createHarnessCostGate, type HarnessModel } from './cost-gate.js'

const review = {
  schemaVersion: 'meridian.paper-wiki-review.v1' as const,
  sections: [{
    id: 'remember', title: '记住什么', emptyLabel: '没有内容', groups: [{
      id: 'problem', provenance: 'paper-source' as const, anchors: ['page:1'],
      rows: [{ text: 'Problem' }],
    }],
  }],
}

const quality: HarnessPaperWikiQuality = {
  schemaVersion: 'meridian.paper-wiki-calibration.v1' as const,
  caseId: 'p1',
  passed: true,
  dimensions: [
    'grounding', 'separation', 'retrieval', 'mechanism', 'evidence', 'implementation', 'uncertainty',
  ].map((id) => ({ id, passed: true })) as HarnessPaperWikiQuality['dimensions'],
  findings: [],
}

const paper: PaperRow = {
  id: 'p1', title: 'A Paper', authors: ['A'], venue: 'arXiv', abstract: 'An abstract.',
  topics: ['topic'], methods: ['method'], datasets: [], metrics: [], pageState: 'draft',
  readState: '未读', projects: [], pageCount: 12, noteCount: 2, conclusionCount: 0,
  updated: '2026-09-17', custom: {},
}
const reading: PaperReading = {
  paperId: 'p1', highlights: [{
    id: 'h1', page: 2, quote: 'source quote', rects: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.1 }],
    color: 'yellow', note: 'my note', created: '2026-09-17', updated: '2026-09-17',
  }], notes: [{
    id: 'n1', page: 3, text: 'reader note', created: '2026-09-17', updated: '2026-09-17',
  }], remark: 'whole-paper thought',
}
const wiki: WikiPaper = {
  id: 'papers/p1', title: 'A Paper', short: 'A Paper', authors: ['A'], venue: 'arXiv', pdf: 'p1.pdf',
  updated: '2026-09-17', body: '', titles: {}, memberships: [], version: { fm: '0000000000000000', body: '0000000000000000' },
}

function gate(options: { configured?: boolean; now?: () => Date } = {}) {
  const run = vi.fn(async () => ({
    state: 'demo-complete' as const,
    message: '演示完成，没有调用模型。',
  }))
  const currentReading = structuredClone(reading)
  const costGate = createHarnessCostGate({
    paper: () => structuredClone(paper),
    reading: () => structuredClone(currentReading),
    wiki: () => structuredClone(wiki),
    model: {
      provider: options.configured === false ? '未配置' : 'Meridian Demo',
      name: options.configured === false ? '未配置' : '本地演示模型',
      configured: options.configured !== false,
      billable: false,
    },
    run,
    applyWiki: vi.fn(),
    now: options.now ?? (() => new Date('2026-09-17T12:00:00.000Z')),
    nextId: (prefix) => `${prefix}-1`,
  })
  return {
    costGate,
    run,
    changeScope: () => { currentReading.notes[0]!.text = 'changed' },
    changeProgress: () => { currentReading.lastPage = 8 },
  }
}

describe('Harness cost gate', () => {
  it('prepares a visible bounded plan without calling Harness', () => {
    const { costGate, run } = gate()
    const plan = costGate.prepare('p1')

    expect(plan.label).toBe('生成 Wiki')
    expect(plan.scope).toMatchObject({ highlights: 1, annotatedHighlights: 1, notes: 1, hasRemark: true })
    expect(plan).not.toHaveProperty('estimate')
    expect(run).not.toHaveBeenCalled()
  })

  it('crosses the boundary once only after the exact acknowledged plan is supplied', async () => {
    const { costGate, run } = gate()
    const plan = costGate.prepare('p1')
    const receipt = await costGate.start({
      planId: plan.id, scopeDigest: plan.scopeDigest, acknowledgeCost: true,
    })

    expect(receipt.state).toBe('demo-complete')
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      limits: { maxOutputTokens: 26_000, minOutputTokens: 6_000, maxModelCalls: 1, timeoutSeconds: 600 },
      requestTimeoutMs: 720_000,
      signal: expect.any(AbortSignal),
    }))
    await expect(costGate.start({
      planId: plan.id, scopeDigest: plan.scopeDigest, acknowledgeCost: true,
    })).rejects.toThrow('已经使用过')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('cancels only an active plan and never makes the consumed plan reusable', async () => {
    let observedSignal: AbortSignal | undefined
    const run = vi.fn(({ signal }: { signal: AbortSignal }) => {
      observedSignal = signal
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
      })
    })
    const costGate = createHarnessCostGate({
      paper: () => structuredClone(paper),
      reading: () => structuredClone(reading),
      wiki: () => structuredClone(wiki),
      model: { provider: 'Provider', name: 'model', configured: true, billable: true },
      run,
      applyWiki: vi.fn(),
      now: () => new Date('2026-09-17T12:00:00.000Z'),
      nextId: (prefix) => `${prefix}-cancel`,
    })
    const plan = costGate.prepare('p1')
    const result = costGate.start({
      planId: plan.id, scopeDigest: plan.scopeDigest, acknowledgeCost: true,
    })
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce())

    expect(costGate.cancel('p1')).toEqual({ paperId: 'p1', cancelled: true })
    expect(observedSignal?.aborted).toBe(true)
    await expect(result).rejects.toThrow('cancelled')
    expect(() => costGate.cancel('p1')).toThrow('没有在运行')
    await expect(costGate.start({
      planId: plan.id, scopeDigest: plan.scopeDigest, acknowledgeCost: true,
    })).rejects.toThrow('已经使用过')
  })

  it('reports a paper as generating from the moment its run starts until it settles or is stopped', async () => {
    let finish: () => void = () => {}
    const run = vi.fn(({ signal }: { signal: AbortSignal }) => new Promise<{ state: 'demo-complete'; message: string }>((resolve, reject) => {
      finish = () => resolve({ state: 'demo-complete', message: '完成' })
      signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
    }))
    const costGate = createHarnessCostGate({
      paper: () => structuredClone(paper),
      reading: () => structuredClone(reading),
      wiki: () => structuredClone(wiki),
      model: { provider: 'Provider', name: 'model', configured: true, billable: true },
      run,
      applyWiki: vi.fn(),
      now: () => new Date('2026-09-17T12:00:00.000Z'),
    })
    expect(costGate.generating()).toEqual([])
    const first = costGate.prepare('p1')
    const finished = costGate.start({ planId: first.id, scopeDigest: first.scopeDigest, acknowledgeCost: true })
    expect(costGate.generating()).toEqual(['p1'])
    finish()
    await finished
    expect(costGate.generating()).toEqual([])

    const second = costGate.prepare('p1')
    const stopped = costGate.start({ planId: second.id, scopeDigest: second.scopeDigest, acknowledgeCost: true })
    costGate.cancel('p1')
    expect(costGate.generating()).toEqual([])
    await expect(stopped).rejects.toThrow('cancelled')
  })

  it('refuses a second paid run for a paper while one runs, and leaves the refused plan unused', async () => {
    const finishes: (() => void)[] = []
    const run = vi.fn(() => new Promise<{ state: 'demo-complete'; message: string }>((resolve) => {
      finishes.push(() => resolve({ state: 'demo-complete', message: '完成' }))
    }))
    const costGate = createHarnessCostGate({
      paper: () => structuredClone(paper),
      reading: () => structuredClone(reading),
      wiki: () => structuredClone(wiki),
      model: { provider: 'Provider', name: 'model', configured: true, billable: true },
      run,
      applyWiki: vi.fn(),
      now: () => new Date('2026-09-17T12:00:00.000Z'),
    })
    const first = costGate.prepare('p1')
    const running = costGate.start({ planId: first.id, scopeDigest: first.scopeDigest, acknowledgeCost: true })
    const again = costGate.prepare('p1')
    const refused = costGate.start({ planId: again.id, scopeDigest: again.scopeDigest, acknowledgeCost: true })
    expect(run).toHaveBeenCalledOnce()
    await expect(refused).rejects.toMatchObject({ reason: 'busy' })

    finishes[0]!()
    await running
    const later = costGate.start({ planId: again.id, scopeDigest: again.scopeDigest, acknowledgeCost: true })
    expect(run).toHaveBeenCalledTimes(2)
    finishes[1]!()
    await later
  })

  it('keeps the reason a paper\'s last run failed until a new start or a dismiss, and none for a start refused before running', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new CallError('model', '模型调用失败'))
      .mockRejectedValueOnce(new CallError('model', '模型调用失败'))
      .mockResolvedValueOnce({ state: 'demo-complete', message: '完成' })
    const costGate = createHarnessCostGate({
      paper: () => structuredClone(paper),
      reading: () => structuredClone(reading),
      wiki: () => structuredClone(wiki),
      model: { provider: 'Provider', name: 'model', configured: true, billable: true },
      run,
      applyWiki: vi.fn(),
      now: () => new Date('2026-09-17T12:00:00.000Z'),
    })
    const startPlan = (plan: { id: string; scopeDigest: string }) =>
      costGate.start({ planId: plan.id, scopeDigest: plan.scopeDigest, acknowledgeCost: true })
    expect(costGate.failed()).toEqual({})
    const failing = costGate.prepare('p1')
    await expect(startPlan(failing)).rejects.toThrow('模型调用失败')
    expect(costGate.failed()).toEqual({ p1: 'model' })
    await expect(startPlan(failing)).rejects.toThrow('已经使用过')
    expect(costGate.failed()).toEqual({ p1: 'model' })
    costGate.dismissFailure('p1')
    expect(costGate.failed()).toEqual({})

    await expect(startPlan(costGate.prepare('p1'))).rejects.toThrow('模型调用失败')
    const next = startPlan(costGate.prepare('p1'))
    expect(costGate.failed()).toEqual({})
    await next
    expect(costGate.failed()).toEqual({})
  })

  it('rejects a direct start without explicit cost acknowledgement', async () => {
    const { costGate, run } = gate()
    const plan = costGate.prepare('p1')
    await expect(costGate.start({
      planId: plan.id, scopeDigest: plan.scopeDigest, acknowledgeCost: false,
    } as never)).rejects.toThrow('明确确认')
    expect(run).not.toHaveBeenCalled()
  })

  it('does not invalidate a confirmed content scope when only reading progress changes', async () => {
    const { costGate, run, changeProgress } = gate()
    const plan = costGate.prepare('p1')
    changeProgress()
    await costGate.start({
      planId: plan.id, scopeDigest: plan.scopeDigest, acknowledgeCost: true,
    })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('rejects an unconfigured model and a scope changed after confirmation', async () => {
    const unconfigured = gate({ configured: false })
    const unavailable = unconfigured.costGate.prepare('p1')
    await expect(unconfigured.costGate.start({
      planId: unavailable.id, scopeDigest: unavailable.scopeDigest, acknowledgeCost: true,
    })).rejects.toThrow('AI 尚未连接')
    expect(unconfigured.run).not.toHaveBeenCalled()

    const changed = gate()
    const stale = changed.costGate.prepare('p1')
    changed.changeScope()
    await expect(changed.costGate.start({
      planId: stale.id, scopeDigest: stale.scopeDigest, acknowledgeCost: true,
    })).rejects.toThrow('已发生变化')
    expect(changed.run).not.toHaveBeenCalled()
  })

  it('refuses a plan shown with one subscription once the run would count against another plan or cost money', async () => {
    const claude: HarnessModel = { provider: 'Claude 订阅', name: '默认模型', configured: true, billable: false, cli: 'claude' }
    let model = claude
    const run = vi.fn(async () => ({ state: 'demo-complete' as const, message: 'done' }))
    const costGate = createHarnessCostGate({
      paper: () => structuredClone(paper),
      reading: () => structuredClone(reading),
      wiki: () => structuredClone(wiki),
      model: () => model,
      run,
      applyWiki: vi.fn(),
      now: () => new Date('2026-09-17T12:00:00.000Z'),
    })
    const start = (plan: { id: string; scopeDigest: string }) =>
      costGate.start({ planId: plan.id, scopeDigest: plan.scopeDigest, acknowledgeCost: true })

    const shown = costGate.prepare('p1')
    expect(shown.model).toEqual(claude)
    model = { ...claude, provider: 'ChatGPT 订阅', cli: 'codex' }
    await expect(start(shown)).rejects.toMatchObject({ reason: 'changed' })
    const codex = costGate.prepare('p1')
    model = { provider: 'Anthropic', name: 'claude-api', configured: true, billable: true }
    await expect(start(codex)).rejects.toMatchObject({ reason: 'changed' })
    expect(run).not.toHaveBeenCalled()
  })

  it.each([
    ['the provider\'s own default', undefined, 26_000], ['the minimal effort', 'minimal', 10_000], ['the low effort', 'low', 14_000],
    ['the medium effort', 'medium', 26_000], ['the high effort', 'high', 38_000], ['the xhigh effort', 'xhigh', 62_000],
    ['the max effort', 'max', 62_000],
  ])('raises the output cap of an API run at %s by its reasoning allowance, the medium one at the default, shows it in the plan and gives the call ten minutes', async (_, effort, cap) => {
    const run = vi.fn(async () => ({ state: 'demo-complete' as const, message: 'done' }))
    const costGate = createHarnessCostGate({
      paper: () => structuredClone(paper),
      reading: () => structuredClone(reading),
      wiki: () => structuredClone(wiki),
      model: { provider: 'OpenAI', name: 'gpt-6.1', configured: true, billable: true, ...(effort === undefined ? {} : { effort }) },
      run,
      applyWiki: vi.fn(),
      now: () => new Date('2026-09-17T12:00:00.000Z'),
    })

    const plan = costGate.prepare('p1')
    await costGate.start({ planId: plan.id, scopeDigest: plan.scopeDigest, acknowledgeCost: true })

    expect(plan.outputLimit).toBe(cap)
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      limits: { maxOutputTokens: cap, minOutputTokens: 6_000, maxModelCalls: 1, timeoutSeconds: 600 }, requestTimeoutMs: 720_000,
    }))
  })

  it.each([
    ['an API run at the none effort', { provider: 'OpenAI', name: 'gpt-6.1', configured: true, billable: true, effort: 'none' }],
    ['a CLI run at an effort', { provider: 'Claude 订阅', name: 'opus', configured: true, billable: false, cli: 'claude' as const, effort: 'max' }],
  ])('keeps the output cap and the two-minute call of %s, with no cap in the plan', async (_, model) => {
    const run = vi.fn(async () => ({ state: 'demo-complete' as const, message: 'done' }))
    const costGate = createHarnessCostGate({
      paper: () => structuredClone(paper),
      reading: () => structuredClone(reading),
      wiki: () => structuredClone(wiki),
      model,
      run,
      applyWiki: vi.fn(),
      now: () => new Date('2026-09-17T12:00:00.000Z'),
    })

    const plan = costGate.prepare('p1')
    await costGate.start({ planId: plan.id, scopeDigest: plan.scopeDigest, acknowledgeCost: true })

    expect(plan).not.toHaveProperty('outputLimit')
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      limits: { maxOutputTokens: 6000, minOutputTokens: 6000, maxModelCalls: 1, timeoutSeconds: 120 }, requestTimeoutMs: 120_000,
    }))
  })

  it('refuses a plan shown at one effort once the run would ask for another', async () => {
    let model: HarnessModel = { provider: 'OpenAI', name: 'gpt-6.1', configured: true, billable: true, effort: 'low' }
    const run = vi.fn(async () => ({ state: 'demo-complete' as const, message: 'done' }))
    const costGate = createHarnessCostGate({
      paper: () => structuredClone(paper),
      reading: () => structuredClone(reading),
      wiki: () => structuredClone(wiki),
      model: () => model,
      run,
      applyWiki: vi.fn(),
      now: () => new Date('2026-09-17T12:00:00.000Z'),
    })

    const shown = costGate.prepare('p1')
    model = { ...model, effort: 'max' }

    await expect(costGate.start({ planId: shown.id, scopeDigest: shown.scopeDigest, acknowledgeCost: true }))
      .rejects.toMatchObject({ reason: 'changed' })
    expect(run).not.toHaveBeenCalled()
  })

  it('holds a generated draft until an explicit, scope-checked apply, then names the change entry the write recorded', async () => {
    const applyWiki = vi.fn(() => ({ change: 'change-9' }))
    const run = vi.fn(async () => ({
      state: 'proposal-ready' as const,
      message: '提案已生成',
      proposalBody: '# Review first',
      proposalReview: review,
      proposalQuality: quality,
    }))
    const currentReading = structuredClone(reading)
    const costGate = createHarnessCostGate({
      paper: () => structuredClone(paper),
      reading: () => structuredClone(currentReading),
      wiki: () => structuredClone(wiki),
      model: { provider: 'Provider', name: 'model', configured: true, billable: true },
      run,
      applyWiki,
      now: () => new Date('2026-09-17T12:00:00.000Z'),
      nextId: (prefix) => `${prefix}-1`,
    })
    const plan = costGate.prepare('p1')
    const receipt = await costGate.start({
      planId: plan.id, scopeDigest: plan.scopeDigest, acknowledgeCost: true,
    })
    expect(applyWiki).not.toHaveBeenCalled()
    expect(receipt.proposal?.body).toBe('# Review first')
    expect(receipt.proposal?.review).toEqual(review)
    expect(receipt.proposal?.quality).toEqual(quality)

    const applied = costGate.applyPaperWiki({ proposalId: receipt.proposal!.id, body: '# Edited' })
    expect(applyWiki).toHaveBeenCalledWith('papers/p1', '# Edited')
    expect(applied.wikiId).toBe('papers/p1')
    expect(applied.change).toBe('change-9')
    expect(() => costGate.applyPaperWiki({
      proposalId: receipt.proposal!.id, body: '# Again',
    })).toThrow('已经写入过')
  })

  it('restores a durable pending proposal without another Harness run', () => {
    const reference = gate().costGate.prepare('p1')
    const applyWiki = vi.fn(() => ({ change: 'change-9' }))
    const run = vi.fn()
    const restored = createHarnessCostGate({
      paper: () => structuredClone(paper),
      reading: () => structuredClone(reading),
      wiki: () => structuredClone(wiki),
      model: { provider: 'Provider', name: 'model', configured: true, billable: true },
      run,
      applyWiki,
      initialProposals: [{
        id: 'proposal-restored', targetId: 'p1', scopeDigest: reference.scopeDigest,
        generatedAt: '2026-09-17T11:00:00.000Z', action: 'create', body: '# Restored', review, quality,
      }],
      now: () => new Date('2026-09-17T12:00:00.000Z'),
    })

    expect(restored.pendingPaperWiki('p1')).toEqual({
      proposal: {
        id: 'proposal-restored', targetId: 'p1', action: 'create', body: '# Restored',
        review, quality,
      },
      generatedAt: '2026-09-17T11:00:00.000Z',
      stale: false,
    })
    restored.applyPaperWiki({ proposalId: 'proposal-restored', body: '# Reviewed' })
    expect(applyWiki).toHaveBeenCalledWith('papers/p1', '# Reviewed')
    expect(restored.pendingPaperWiki('p1')).toBeNull()
    expect(run).not.toHaveBeenCalled()
  })

  it('makes a proposal reviewable again once the change its write recorded is undone, and logs it as generated again', () => {
    const reference = gate().costGate.prepare('p1')
    const recordProposal = vi.fn()
    const pending = {
      id: 'proposal-restored', targetId: 'p1', scopeDigest: reference.scopeDigest,
      generatedAt: '2026-09-17T11:00:00.000Z', action: 'create' as const, body: '# Restored', review, quality,
    }
    const restored = createHarnessCostGate({
      paper: () => structuredClone(paper),
      reading: () => structuredClone(reading),
      wiki: () => structuredClone(wiki),
      model: { provider: 'Provider', name: 'model', configured: true, billable: true },
      run: vi.fn(),
      applyWiki: vi.fn(() => ({ change: 'change-9' })),
      recordProposal,
      initialProposals: [pending],
      now: () => new Date('2026-09-17T12:00:00.000Z'),
    })
    restored.applyPaperWiki({ proposalId: 'proposal-restored', body: '# Reviewed' })
    expect(recordProposal).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'applied', change: 'change-9' }))
    restored.reopenPaperWiki('change-8')
    expect(restored.pendingPaperWiki('p1')).toBeNull()

    restored.reopenPaperWiki('change-9')
    expect(restored.pendingPaperWiki('p1')).toEqual({
      proposal: { id: 'proposal-restored', targetId: 'p1', action: 'create', body: '# Restored', review, quality },
      generatedAt: '2026-09-17T11:00:00.000Z',
      stale: false,
    })
    expect(recordProposal).toHaveBeenLastCalledWith({
      event: 'generated', proposalId: 'proposal-restored', targetId: 'p1', scopeDigest: reference.scopeDigest,
      at: '2026-09-17T11:00:00.000Z', body: '# Restored', action: 'create', review, quality,
    })
    restored.reopenPaperWiki('change-9')
    expect(recordProposal).toHaveBeenCalledTimes(2)
  })

  it('after a restart reopens a proposal whose write the log holds with its change entry', () => {
    const reference = gate().costGate.prepare('p1')
    const restored = createHarnessCostGate({
      paper: () => structuredClone(paper),
      reading: () => structuredClone(reading),
      wiki: () => structuredClone(wiki),
      model: { provider: 'Provider', name: 'model', configured: true, billable: true },
      run: vi.fn(),
      applyWiki: vi.fn(),
      initialApplied: [{
        id: 'proposal-written', targetId: 'p1', scopeDigest: reference.scopeDigest,
        generatedAt: '2026-09-17T11:00:00.000Z', action: 'create', body: '# Written', change: 'change-9',
      }],
      now: () => new Date('2026-09-17T12:00:00.000Z'),
    })
    expect(restored.pendingPaperWiki('p1')).toBeNull()
    restored.reopenPaperWiki('change-9')
    expect(restored.pendingPaperWiki('p1')?.proposal.id).toBe('proposal-written')
  })

  it('records optional rejection feedback without running Harness or writing Wiki', () => {
    const reference = gate().costGate.prepare('p1')
    const run = vi.fn()
    const applyWiki = vi.fn()
    const recordProposal = vi.fn()
    const restored = createHarnessCostGate({
      paper: () => structuredClone(paper),
      reading: () => structuredClone(reading),
      wiki: () => structuredClone(wiki),
      model: { provider: 'Provider', name: 'model', configured: true, billable: true },
      run,
      applyWiki,
      recordProposal,
      initialProposals: [{
        id: 'proposal-restored', targetId: 'p1', scopeDigest: reference.scopeDigest,
        generatedAt: '2026-09-17T11:00:00.000Z', action: 'create', body: '# Restored',
      }],
      now: () => new Date('2026-09-17T12:00:00.000Z'),
    })

    restored.rejectPaperWiki({
      proposalId: 'proposal-restored',
      feedback: {
        reasons: ['synthesis-unhelpful', 'poor-structure'],
        note: 'The mechanism and evidence should be separated.',
      },
    })

    expect(recordProposal).toHaveBeenCalledWith(expect.objectContaining({
      event: 'rejected',
      feedback: {
        reasons: ['synthesis-unhelpful', 'poor-structure'],
        note: 'The mechanism and evidence should be separated.',
      },
    }))
    expect(restored.pendingPaperWiki('p1')).toBeNull()
    expect(run).not.toHaveBeenCalled()
    expect(applyWiki).not.toHaveBeenCalled()
  })

  it('rejects in memory even when the optional audit record cannot be written, naming why', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reference = gate().costGate.prepare('p1')
    const restored = createHarnessCostGate({
      paper: () => structuredClone(paper),
      reading: () => structuredClone(reading),
      wiki: () => structuredClone(wiki),
      model: { provider: 'Provider', name: 'model', configured: true, billable: true },
      run: vi.fn(),
      applyWiki: vi.fn(),
      recordProposal: () => {
        throw Object.assign(new Error("EACCES: permission denied, open '/vault/.meridian/harness-proposals.jsonl'"), {
          code: 'EACCES', syscall: 'open',
        })
      },
      initialProposals: [{
        id: 'proposal-restored', targetId: 'p1', scopeDigest: reference.scopeDigest,
        generatedAt: '2026-09-17T11:00:00.000Z', action: 'create', body: '# Restored',
      }],
      now: () => new Date('2026-09-17T12:00:00.000Z'),
    })

    const result = restored.rejectPaperWiki({ proposalId: 'proposal-restored' })

    expect(result.warning).toBe('write')
    expect(restored.pendingPaperWiki('p1')).toBeNull()
    vi.restoreAllMocks()
  })
})
