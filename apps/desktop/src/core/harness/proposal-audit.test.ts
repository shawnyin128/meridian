import { appendFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HarnessPaperWikiQuality } from '../../shared/contract.js'
import { createHarnessProposalAudit, HARNESS_PROPOSAL_LOG } from './proposal-audit.js'

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
  schemaVersion: 'meridian.paper-wiki-calibration.v1', caseId: 'p1', passed: true,
  dimensions: [
    'grounding', 'separation', 'retrieval', 'mechanism', 'evidence', 'implementation', 'uncertainty',
  ].map((id) => ({ id, passed: true })) as HarnessPaperWikiQuality['dimensions'],
  findings: [],
}

/** One line exactly as App 0.0.18.0's audit writer wrote it. */
const V0_0_18_LINE = '{"schemaVersion":"meridian.harness-proposal-audit.v1","event":"generated","proposalId":"proposal-1","targetId":"p1","scopeDigest":"digest","at":"2026-10-20T12:00:00.000Z","body":"# Draft","action":"create","review":{"schemaVersion":"meridian.paper-wiki-review.v1","sections":[{"id":"mechanism","title":"机制","emptyLabel":"本提案没有机制条目。","groups":[{"id":"mechanism-1","title":"Drafter","provenance":"paper-source","anchors":["page:1"],"rows":[{"label":"输入","text":"Features"}]}]}]}}'

/** The lines of the log at `root` as one string, each followed by a newline. */
const append = (root: string, ...lines: string[]) =>
  appendFileSync(join(root, HARNESS_PROPOSAL_LOG), lines.map((line) => `${line}\n`).join(''), 'utf8')

describe('Harness proposal audit', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('reads the log line by line: a line it cannot read is reported and skipped, and a review row with a field it does not know is still read', () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-proposal-audit-lines-'))
    mkdirSync(join(root, '.meridian'), { recursive: true })
    const later = JSON.parse(V0_0_18_LINE) as { proposalId: string; review: { sections: { groups: { rows: object[] }[] }[] } }
    later.proposalId = 'proposal-2'
    later.review.sections[0]!.groups[0]!.rows[0] = { id: 'input', label: '输入', text: 'Features' }
    append(root, V0_0_18_LINE, JSON.stringify(later), '{"schemaVersion":"meridian.harness-proposal-audit.v1","event":"generated"}')
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})

    const pending = createHarnessProposalAudit(root).pending()
    expect(pending.map((proposal) => proposal.id)).toEqual(['proposal-1', 'proposal-2'])
    expect(pending[1]!.review).toEqual(pending[0]!.review)
    expect(reported).toHaveBeenCalledOnce()
    expect(String(reported.mock.calls[0]![0])).toContain('line 3')
  })

  it('appends generated and terminal events as independent JSON lines', () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-proposal-audit-'))
    const audit = createHarnessProposalAudit(root)
    audit.record({
      event: 'generated', proposalId: 'proposal-1', targetId: 'p1', scopeDigest: 'digest',
      at: '2026-09-17T12:00:00.000Z', body: '# Draft', action: 'create', review, quality,
    })
    expect(audit.pending()).toEqual([{
      id: 'proposal-1', targetId: 'p1', scopeDigest: 'digest',
      generatedAt: '2026-09-17T12:00:00.000Z', body: '# Draft', action: 'create', review, quality,
    }])
    audit.record({
      event: 'rejected', proposalId: 'proposal-1', targetId: 'p1', scopeDigest: 'digest',
      at: '2026-09-17T12:01:00.000Z',
      feedback: {
        reasons: ['source-inaccurate', 'missing-important'],
        note: 'The proposal misses the ablation caveat.',
      },
    })
    const rows = readFileSync(join(root, HARNESS_PROPOSAL_LOG), 'utf8').trim().split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(rows).toEqual([
      expect.objectContaining({ event: 'generated', body: '# Draft', review, quality }),
      expect.objectContaining({
        event: 'rejected', proposalId: 'proposal-1',
        feedback: {
          reasons: ['source-inaccurate', 'missing-important'],
          note: 'The proposal misses the ablation caveat.',
        },
      }),
    ])
    expect(audit.pending()).toEqual([])
  })

  it('lists each proposal whose last event is a write that recorded its change entry, as generated, until it is logged as generated again', () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-proposal-audit-'))
    const audit = createHarnessProposalAudit(root)
    const generated = {
      event: 'generated' as const, proposalId: 'proposal-1', targetId: 'p1', scopeDigest: 'digest',
      at: '2026-09-17T12:00:00.000Z', body: '# Draft', action: 'create' as const, review, quality,
    }
    audit.record(generated)
    audit.record({ ...generated, event: 'applied', at: '2026-09-17T12:01:00.000Z', body: '# Edited', change: 'change-9' })
    audit.record({ ...generated, proposalId: 'proposal-2', at: '2026-09-17T12:02:00.000Z' })
    audit.record({ ...generated, proposalId: 'proposal-2', event: 'applied', at: '2026-09-17T12:03:00.000Z' })
    expect(audit.applied()).toEqual([{
      id: 'proposal-1', targetId: 'p1', scopeDigest: 'digest', generatedAt: '2026-09-17T12:00:00.000Z',
      body: '# Draft', action: 'create', review, quality, change: 'change-9',
    }])
    expect(audit.pending()).toEqual([])

    audit.record(generated)
    expect(audit.applied()).toEqual([])
    expect(audit.pending().map((proposal) => [proposal.id, proposal.body])).toEqual([['proposal-1', '# Draft']])
  })

  it('reports and skips an invalid persisted review projection', () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-proposal-audit-invalid-'))
    const audit = createHarnessProposalAudit(root)
    audit.record({
      event: 'generated', proposalId: 'proposal-1', targetId: 'p1', scopeDigest: 'digest',
      at: '2026-09-17T12:00:00.000Z', body: '# Draft', action: 'create',
      review: { schemaVersion: 'meridian.paper-wiki-review.v1', sections: [] } as never,
    })
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(audit.pending()).toEqual([])
    expect(String(reported.mock.calls[0]![0])).toContain('invalid review projection')
  })

  it('reports and skips a persisted quality report that does not belong to the proposal target', () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-proposal-quality-invalid-'))
    const audit = createHarnessProposalAudit(root)
    audit.record({
      event: 'generated', proposalId: 'proposal-1', targetId: 'p1', scopeDigest: 'digest',
      at: '2026-09-17T12:00:00.000Z', body: '# Draft', action: 'create',
      quality: { ...quality, caseId: 'other-paper' },
    })
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(audit.pending()).toEqual([])
    expect(String(reported.mock.calls[0]![0])).toContain('invalid quality report')
  })

  it('reports and skips rejection feedback attached to a non-rejection event', () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-proposal-feedback-invalid-'))
    const audit = createHarnessProposalAudit(root)
    audit.record({
      event: 'generated', proposalId: 'proposal-1', targetId: 'p1', scopeDigest: 'digest',
      at: '2026-09-17T12:00:00.000Z', body: '# Draft', action: 'create',
      feedback: { reasons: ['other'] },
    })
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(audit.pending()).toEqual([])
    expect(String(reported.mock.calls[0]![0])).toContain('invalid rejection feedback')
  })

  it('recovers complete events before a crash-torn final append', () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-proposal-audit-torn-'))
    const audit = createHarnessProposalAudit(root)
    audit.record({
      event: 'generated', proposalId: 'proposal-1', targetId: 'p1', scopeDigest: 'digest',
      at: '2026-09-17T12:00:00.000Z', body: '# Draft', action: 'create', review, quality,
    })
    appendFileSync(join(root, HARNESS_PROPOSAL_LOG), '{"schemaVersion":"meridian.harness', 'utf8')

    expect(audit.pending()).toEqual([expect.objectContaining({ id: 'proposal-1', body: '# Draft' })])
  })

  it('appliedBodies keeps the latest applied body per target and ignores generated/rejected events', () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-proposal-audit-applied-'))
    const audit = createHarnessProposalAudit(root)
    expect(audit.appliedBodies()).toEqual(new Map())
    audit.record({
      event: 'generated', proposalId: 'proposal-1', targetId: 'p1', scopeDigest: 'digest',
      at: '2026-09-17T12:00:00.000Z', body: '# Draft one', action: 'create',
    })
    audit.record({
      event: 'applied', proposalId: 'proposal-1', targetId: 'p1', scopeDigest: 'digest',
      at: '2026-09-17T12:01:00.000Z', body: '# Applied once',
    })
    audit.record({
      event: 'generated', proposalId: 'proposal-2', targetId: 'p1', scopeDigest: 'digest-2',
      at: '2026-09-17T12:02:00.000Z', body: '# Draft two', action: 'update',
    })
    audit.record({
      event: 'applied', proposalId: 'proposal-2', targetId: 'p1', scopeDigest: 'digest-2',
      at: '2026-09-17T12:03:00.000Z', body: '# Applied twice',
    })
    audit.record({
      event: 'rejected', proposalId: 'proposal-3', targetId: 'p2', scopeDigest: 'digest-3',
      at: '2026-09-17T12:04:00.000Z',
    })
    expect(audit.appliedBodies()).toEqual(new Map([['p1', '# Applied twice']]))
  })

  it('reports a complete but invalid final event instead of dropping it as a torn write', () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-proposal-audit-invalid-tail-'))
    const audit = createHarnessProposalAudit(root)
    audit.record({
      event: 'generated', proposalId: 'proposal-1', targetId: 'p1', scopeDigest: 'digest',
      at: '2026-09-17T12:00:00.000Z', body: '# Draft', action: 'create', review, quality,
    })
    appendFileSync(join(root, HARNESS_PROPOSAL_LOG), '{"event":"generated"}', 'utf8')
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(audit.pending().map((proposal) => proposal.id)).toEqual(['proposal-1'])
    expect(String(reported.mock.calls[0]![0])).toContain('invalid shape')
  })
})
