import { describe, expect, it, vi } from 'vitest'
import type { HarnessPaperWikiQuality, PaperReading, PaperRow, WikiPaper } from '../../shared/contract.js'
import { createHarnessCostGate } from './cost-gate.js'

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
      limits: { maxOutputTokens: 6000, maxModelCalls: 1 },
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

    expect(costGate.cancel(plan.id)).toEqual({ planId: plan.id, cancelled: true })
    expect(observedSignal?.aborted).toBe(true)
    await expect(result).rejects.toThrow('cancelled')
    expect(() => costGate.cancel(plan.id)).toThrow('没有在运行')
    await expect(costGate.start({
      planId: plan.id, scopeDigest: plan.scopeDigest, acknowledgeCost: true,
    })).rejects.toThrow('已经使用过')
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

  it('holds a generated draft until an explicit, scope-checked apply', async () => {
    const applyWiki = vi.fn()
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
    expect(() => costGate.applyPaperWiki({
      proposalId: receipt.proposal!.id, body: '# Again',
    })).toThrow('已经写入过')
  })

  it('restores a durable pending proposal without another Harness run', () => {
    const reference = gate().costGate.prepare('p1')
    const applyWiki = vi.fn()
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

  it('rejects in memory even when the optional audit record cannot be written', () => {
    const reference = gate().costGate.prepare('p1')
    const restored = createHarnessCostGate({
      paper: () => structuredClone(paper),
      reading: () => structuredClone(reading),
      wiki: () => structuredClone(wiki),
      model: { provider: 'Provider', name: 'model', configured: true, billable: true },
      run: vi.fn(),
      applyWiki: vi.fn(),
      recordProposal: () => { throw new Error('disk unavailable') },
      initialProposals: [{
        id: 'proposal-restored', targetId: 'p1', scopeDigest: reference.scopeDigest,
        generatedAt: '2026-09-17T11:00:00.000Z', action: 'create', body: '# Restored',
      }],
      now: () => new Date('2026-09-17T12:00:00.000Z'),
    })

    const result = restored.rejectPaperWiki({ proposalId: 'proposal-restored' })

    expect(result.warning).toContain('审计记录写入失败')
    expect(restored.pendingPaperWiki('p1')).toBeNull()
  })
})
