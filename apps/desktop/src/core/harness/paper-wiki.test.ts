import { describe, expect, it } from 'vitest'
import type { HarnessPaperWikiQuality } from '../../shared/contract.js'
import type { PaperWikiDraft } from './paper-wiki.js'
import {
  paperWikiHarnessError, projectPaperWikiReview, renderPaperWikiDraft,
  validatePaperWikiDraftScope, validatePaperWikiDraftSemantics, validatePaperWikiQuality,
} from './paper-wiki.js'
import { HarnessRpcError } from './rpc.js'

const draft = (): PaperWikiDraft => ({
  problem: { text: 'Exact bottleneck', pages: [1] },
  what_to_remember: [{ text: 'Main contribution', pages: [1, 3] }],
  retrieval: {
    fits: [
      { query: 'How does the method work?', use_because: 'It explains the mechanism.', pages: [2] },
      { query: 'What should I implement first?', use_because: 'It identifies the first probe.', pages: [2] },
      { query: 'What evidence supports the method?', use_because: 'It reports the result.', pages: [4] },
    ],
    scope_notes: {
      primary_fit: 'Mechanism and evidence questions.',
      adjacent_fit: 'Implementation planning.',
      weak_fit: 'Unrelated application domains.',
    },
  },
  mechanism: [{
    name: 'Mechanism', input: 'Input state', transformation: 'Apply the transform',
    output: 'Output state', dependency: 'Reported setting', pages: [2],
  }],
  mechanism_details_to_verify: [{ text: 'Verify the operation order', pages: [2] }],
  evidence: [{
    claim: 'The method improves the target metric', setting: 'Controlled evaluation',
    finding: 'Measured result', pages: [4],
  }],
  implementation_hooks: [{
    task: 'Implement the transform', first_check: 'Run the smallest sanity check', pages: [2],
  }],
  limitations: [],
  user_observations: [{ text: 'Try this next', reading_refs: ['note:n1'] }],
  open_questions: ['Does it transfer?'],
})

describe('Paper Wiki Harness draft boundary', () => {
  it('renders only the canonical Core-owned section layout', () => {
    expect(renderPaperWikiDraft(draft())).toBe([
      '## What To Remember',
      '**Source-grounded problem:** Exact bottleneck (p. 1)',
      '**Wiki synthesis:**',
      '- Main contribution (p. 1, 3)',
      '',
      '## When To Retrieve This Paper',
      '**Wiki synthesis for retrieval:**',
      '**Canonical retrieval fits:**',
      '1. **Query:** "How does the method work?"',
      '   **Use because:** It explains the mechanism. (p. 2)',
      '2. **Query:** "What should I implement first?"',
      '   **Use because:** It identifies the first probe. (p. 2)',
      '3. **Query:** "What evidence supports the method?"',
      '   **Use because:** It reports the result. (p. 4)',
      '**Scope notes:**',
      '- **Primary fit:** Mechanism and evidence questions.',
      '- **Adjacent fit:** Implementation planning.',
      '- **Weak fit:** Unrelated application domains.',
      '',
      '## Mechanism',
      '### Mechanism',
      '- **Input:** Input state',
      '- **Transformation:** Apply the transform',
      '- **Output:** Output state',
      '- **Dependency:** Reported setting',
      '- **Source:** p. 2',
      '',
      '## Mechanism Details To Verify',
      '- Verify the operation order (p. 2)',
      '',
      '## Evidence Map',
      '### Evidence 1',
      '- **Claim:** The method improves the target metric',
      '- **Setting:** Controlled evaluation',
      '- **Finding:** Measured result',
      '- **Source:** p. 4',
      '',
      '## Implementation Hooks',
      '**Wiki synthesis for implementation:**',
      '- **Task:** Implement the transform',
      '  **First check:** Run the smallest sanity check (p. 2)',
      '',
      '## Limitations / Uncertainty',
      '- No source-grounded limitation was captured in this proposal.',
      '',
      '## User Insights',
      '- Try this next (note:n1)',
      '',
      '## Open Questions',
      '- Does it transfer?',
    ].join('\n'))
  })

  it('rejects unknown source pages and reading records before review', () => {
    expect(() => validatePaperWikiDraftScope(draft(), {
      paperPages: 3,
      readingRefs: new Set(['note:n1']),
    })).toThrow('范围外的论文页')

    const unknownNote = draft()
    unknownNote.evidence[0]!.pages = [3]
    unknownNote.user_observations[0]!.reading_refs = ['note:other']
    expect(() => validatePaperWikiDraftScope(unknownNote, {
      paperPages: 4,
      readingRefs: new Set(['note:n1']),
    })).toThrow('范围外的阅读记录')
  })

  it('projects provenance and source anchors without reparsing Markdown', () => {
    const review = projectPaperWikiReview(draft())
    expect(review.schemaVersion).toBe('meridian.paper-wiki-review.v1')
    expect(review.sections.find((section) => section.id === 'remember')?.groups).toEqual([
      expect.objectContaining({
        id: 'problem', provenance: 'paper-source', anchors: ['page:1'],
        rows: [{ text: 'Exact bottleneck' }],
      }),
      expect.objectContaining({
        id: 'takeaway-1', provenance: 'wiki-synthesis', anchors: ['page:1', 'page:3'],
      }),
    ])
    expect(review.sections.find((section) => section.id === 'user-insights')?.groups[0])
      .toMatchObject({ provenance: 'user-insight', anchors: ['note:n1'] })
    expect(review.sections.find((section) => section.id === 'limitations')).toMatchObject({
      groups: [],
      emptyLabel: '本提案没有提取到有原文依据的局限。',
    })
  })

  it('rejects duplicate anchors instead of silently normalizing them', () => {
    const duplicate = draft()
    duplicate.implementation_hooks[0]!.pages = [2, 2]
    expect(() => validatePaperWikiDraftScope(duplicate, {
      paperPages: 4,
      readingRefs: new Set(['note:n1']),
    })).toThrow('范围外的论文页')
  })

  it('mirrors semantic uniqueness and question-shape checks at the Core boundary', () => {
    const duplicate = draft()
    duplicate.retrieval.fits[1]!.query = duplicate.retrieval.fits[0]!.query
    expect(() => validatePaperWikiDraftSemantics(duplicate)).toThrow('重复的检索问题')

    const statement = draft()
    statement.open_questions = ['Test generalization']
    expect(() => validatePaperWikiDraftSemantics(statement)).toThrow('问题形式')
  })

  it('accepts only a complete, internally consistent quality report for the target paper', () => {
    const quality: HarnessPaperWikiQuality = {
      schemaVersion: 'meridian.paper-wiki-calibration.v1', caseId: 'p1', passed: true,
      dimensions: [
        'grounding', 'separation', 'retrieval', 'mechanism', 'evidence', 'implementation', 'uncertainty',
      ].map((id) => ({ id, passed: true })) as HarnessPaperWikiQuality['dimensions'],
      findings: [],
    }
    expect(() => validatePaperWikiQuality(quality, 'p1')).not.toThrow()
    expect(() => validatePaperWikiQuality({ ...quality, caseId: 'p2' }, 'p1'))
      .toThrow('不属于当前论文')
    expect(() => validatePaperWikiQuality({
      ...quality, passed: false,
      dimensions: quality.dimensions.map((dimension) => ({ ...dimension })),
    }, 'p1')).toThrow('结论不一致')
  })

  it('turns cancellation and process loss into explicit no-retry messages', () => {
    expect(paperWikiHarnessError(new HarnessRpcError({
      kind: 'cancelled', message: 'cancelled',
    })).message).toContain('仍可能计费')
    expect(paperWikiHarnessError(new HarnessRpcError({
      kind: 'harness_gone', message: 'gone',
    })).message).toContain('不会自动重试')
  })
})
