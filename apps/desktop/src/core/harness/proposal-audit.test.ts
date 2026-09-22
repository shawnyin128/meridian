import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
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

describe('Harness proposal audit', () => {
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

  it('rejects an invalid persisted review projection', () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-proposal-audit-invalid-'))
    const audit = createHarnessProposalAudit(root)
    audit.record({
      event: 'generated', proposalId: 'proposal-1', targetId: 'p1', scopeDigest: 'digest',
      at: '2026-09-17T12:00:00.000Z', body: '# Draft', action: 'create',
      review: { schemaVersion: 'meridian.paper-wiki-review.v1', sections: [] } as never,
    })
    expect(() => audit.pending()).toThrow('invalid review projection')
  })

  it('rejects a persisted quality report that does not belong to the proposal target', () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-proposal-quality-invalid-'))
    const audit = createHarnessProposalAudit(root)
    audit.record({
      event: 'generated', proposalId: 'proposal-1', targetId: 'p1', scopeDigest: 'digest',
      at: '2026-09-17T12:00:00.000Z', body: '# Draft', action: 'create',
      quality: { ...quality, caseId: 'other-paper' },
    })
    expect(() => audit.pending()).toThrow('invalid quality report')
  })

  it('rejects rejection feedback attached to a non-rejection event', () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-proposal-feedback-invalid-'))
    const audit = createHarnessProposalAudit(root)
    audit.record({
      event: 'generated', proposalId: 'proposal-1', targetId: 'p1', scopeDigest: 'digest',
      at: '2026-09-17T12:00:00.000Z', body: '# Draft', action: 'create',
      feedback: { reasons: ['other'] },
    })
    expect(() => audit.pending()).toThrow('invalid rejection feedback')
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

  it('does not hide a complete but invalid final event', () => {
    const root = mkdtempSync(join(tmpdir(), 'meridian-proposal-audit-invalid-tail-'))
    const audit = createHarnessProposalAudit(root)
    audit.record({
      event: 'generated', proposalId: 'proposal-1', targetId: 'p1', scopeDigest: 'digest',
      at: '2026-09-17T12:00:00.000Z', body: '# Draft', action: 'create', review, quality,
    })
    appendFileSync(join(root, HARNESS_PROPOSAL_LOG), '{"event":"generated"}', 'utf8')

    expect(() => audit.pending()).toThrow('invalid shape')
  })
})
