import { z } from 'zod'
import {
  HarnessPaperWikiQualitySchema, PapersGetParamsSchema, PapersReadingParamsSchema, PapersSourceParamsSchema,
} from '../../shared/contract.js'
import type { HarnessPaperWikiQuality, HarnessPaperWikiReview } from '../../shared/contract.js'
import type { VaultStore } from '../vault.js'
import { extractPdfPages } from '../paper-library/index.js'
import type { HarnessExecution, HarnessRunner } from './cost-gate.js'
import type { HarnessModelConfig } from './model-config.js'
import { launchHarnessProcess } from './process.js'
import { createHarnessRpc, HarnessRpcError } from './rpc.js'

const WikiPageParamsSchema = z.object({ id: z.string().min(1) }).strict()
const SourceStatementSchema = z.object({
  text: z.string().trim().min(1).max(4_000),
  pages: z.array(z.number().int().positive()).min(1).max(20),
}).strict()
const RetrievalFitSchema = z.object({
  query: z.string().trim().min(1).max(500),
  use_because: z.string().trim().min(1).max(1_500),
  pages: z.array(z.number().int().positive()).min(1).max(20),
}).strict()
const RetrievalGuideSchema = z.object({
  fits: z.array(RetrievalFitSchema).min(3).max(4),
  scope_notes: z.object({
    primary_fit: z.string().trim().min(1).max(1_000),
    adjacent_fit: z.string().trim().min(1).max(1_000),
    weak_fit: z.string().trim().min(1).max(1_000),
  }).strict(),
}).strict()
const MechanismComponentSchema = z.object({
  name: z.string().trim().min(1).max(300),
  input: z.string().trim().min(1).max(2_000),
  transformation: z.string().trim().min(1).max(3_000),
  output: z.string().trim().min(1).max(2_000),
  dependency: z.string().trim().min(1).max(2_000),
  pages: z.array(z.number().int().positive()).min(1).max(20),
}).strict()
const EvidenceEntrySchema = z.object({
  claim: z.string().trim().min(1).max(2_000),
  setting: z.string().trim().min(1).max(2_000),
  finding: z.string().trim().min(1).max(3_000),
  pages: z.array(z.number().int().positive()).min(1).max(20),
}).strict()
const ImplementationHookSchema = z.object({
  task: z.string().trim().min(1).max(1_500),
  first_check: z.string().trim().min(1).max(2_000),
  pages: z.array(z.number().int().positive()).min(1).max(20),
}).strict()
const UserObservationSchema = z.object({
  text: z.string().trim().min(1).max(4_000),
  reading_refs: z.array(z.string().trim().min(1)).min(1).max(20),
}).strict()
const DraftSchema = z.object({
  problem: SourceStatementSchema,
  what_to_remember: z.array(SourceStatementSchema).min(1).max(4),
  retrieval: RetrievalGuideSchema,
  mechanism: z.array(MechanismComponentSchema).min(1).max(8),
  mechanism_details_to_verify: z.array(SourceStatementSchema).min(1).max(10),
  evidence: z.array(EvidenceEntrySchema).min(1).max(10),
  implementation_hooks: z.array(ImplementationHookSchema).min(1).max(8),
  limitations: z.array(SourceStatementSchema).max(8),
  user_observations: z.array(UserObservationSchema).max(12),
  open_questions: z.array(z.string().trim().min(1).max(1_000)).max(8),
}).strict()
const DraftEnvelopeSchema = z.object({
  schemaVersion: z.literal('meridian.paper-wiki-draft.v2'),
  workflow: z.literal('paper-wiki'),
  targetId: z.string().min(1),
  scopeDigest: z.string().min(1),
  action: z.enum(['create', 'update']),
  draft: DraftSchema,
  quality: HarnessPaperWikiQualitySchema,
  reviewRequired: z.literal(true),
  applied: z.literal(false),
}).strict()

export type PaperWikiDraft = z.infer<typeof DraftSchema>

const inline = (value: string) => value.replace(/\s+/g, ' ').trim()
const pages = (value: readonly number[]) => `p. ${value.join(', ')}`
const sourceRows = (items: PaperWikiDraft['what_to_remember']) => items.map((item) =>
  `- ${inline(item.text)} (${pages(item.pages)})`)
const observationRows = (items: PaperWikiDraft['user_observations']) => items.map((item) =>
  `- ${inline(item.text)} (${item.reading_refs.join(', ')})`)
const pageAnchors = (value: readonly number[]) => value.map((page) => `page:${page}`)

function retrievalRows(retrieval: PaperWikiDraft['retrieval']): string[] {
  return [
    '**Wiki synthesis for retrieval:**',
    '**Canonical retrieval fits:**',
    ...retrieval.fits.map((fit, index) => [
      `${index + 1}. **Query:** ${JSON.stringify(inline(fit.query))}`,
      `   **Use because:** ${inline(fit.use_because)} (${pages(fit.pages)})`,
    ].join('\n')),
    '**Scope notes:**',
    `- **Primary fit:** ${inline(retrieval.scope_notes.primary_fit)}`,
    `- **Adjacent fit:** ${inline(retrieval.scope_notes.adjacent_fit)}`,
    `- **Weak fit:** ${inline(retrieval.scope_notes.weak_fit)}`,
  ]
}

function mechanismRows(items: PaperWikiDraft['mechanism']): string[] {
  return items.flatMap((item) => [
    `### ${inline(item.name)}`,
    `- **Input:** ${inline(item.input)}`,
    `- **Transformation:** ${inline(item.transformation)}`,
    `- **Output:** ${inline(item.output)}`,
    `- **Dependency:** ${inline(item.dependency)}`,
    `- **Source:** ${pages(item.pages)}`,
  ])
}

function evidenceRows(items: PaperWikiDraft['evidence']): string[] {
  return items.flatMap((item, index) => [
    `### Evidence ${index + 1}`,
    `- **Claim:** ${inline(item.claim)}`,
    `- **Setting:** ${inline(item.setting)}`,
    `- **Finding:** ${inline(item.finding)}`,
    `- **Source:** ${pages(item.pages)}`,
  ])
}

function implementationRows(items: PaperWikiDraft['implementation_hooks']): string[] {
  return [
    '**Wiki synthesis for implementation:**',
    ...items.map((item) => [
      `- **Task:** ${inline(item.task)}`,
      `  **First check:** ${inline(item.first_check)} (${pages(item.pages)})`,
    ].join('\n')),
  ]
}

/** Render a validated semantic draft into the only Markdown body Core may offer for review. */
export function renderPaperWikiDraft(draft: PaperWikiDraft): string {
  const sections: Array<[string, string[]]> = [
    ['What To Remember', [
      `**Source-grounded problem:** ${inline(draft.problem.text)} (${pages(draft.problem.pages)})`,
      '**Wiki synthesis:**',
      ...sourceRows(draft.what_to_remember),
    ]],
    ['When To Retrieve This Paper', retrievalRows(draft.retrieval)],
    ['Mechanism', mechanismRows(draft.mechanism)],
    ['Mechanism Details To Verify', sourceRows(draft.mechanism_details_to_verify)],
    ['Evidence Map', evidenceRows(draft.evidence)],
    ['Implementation Hooks', implementationRows(draft.implementation_hooks)],
    ['Limitations / Uncertainty', draft.limitations.length > 0
      ? sourceRows(draft.limitations)
      : ['- No source-grounded limitation was captured in this proposal.']],
    ['User Insights', observationRows(draft.user_observations)],
    ['Open Questions', draft.open_questions.map((item) => `- ${item}`)],
  ]
  return sections
    .filter(([, rows]) => rows.length > 0)
    .map(([heading, rows]) => `## ${heading}\n${rows.join('\n')}`)
    .join('\n\n')
}

/** Project a validated draft into review sections without reparsing rendered Markdown. */
export function projectPaperWikiReview(draft: PaperWikiDraft): HarnessPaperWikiReview {
  return {
    schemaVersion: 'meridian.paper-wiki-review.v1',
    sections: [
      {
        id: 'remember', title: '记住什么', emptyLabel: '本提案没有可审核的核心摘要。',
        groups: [
          {
            id: 'problem', title: '论文问题', provenance: 'paper-source',
            anchors: pageAnchors(draft.problem.pages), rows: [{ text: inline(draft.problem.text) }],
          },
          ...draft.what_to_remember.map((item, index) => ({
            id: `takeaway-${index + 1}`, title: `核心要点 ${index + 1}`,
            provenance: 'wiki-synthesis' as const, anchors: pageAnchors(item.pages),
            rows: [{ text: inline(item.text) }],
          })),
        ],
      },
      {
        id: 'retrieve', title: '何时检索', emptyLabel: '本提案没有检索建议。',
        groups: [
          ...draft.retrieval.fits.map((fit, index) => ({
            id: `retrieval-fit-${index + 1}`, title: `检索场景 ${index + 1}`,
            provenance: 'wiki-synthesis' as const, anchors: pageAnchors(fit.pages),
            rows: [
              { label: '问题', text: inline(fit.query) },
              { label: '适用原因', text: inline(fit.use_because) },
            ],
          })),
          {
            id: 'retrieval-scope', title: '适用边界', provenance: 'wiki-synthesis', anchors: [],
            rows: [
              { label: '主要适用', text: inline(draft.retrieval.scope_notes.primary_fit) },
              { label: '相邻适用', text: inline(draft.retrieval.scope_notes.adjacent_fit) },
              { label: '弱相关', text: inline(draft.retrieval.scope_notes.weak_fit) },
            ],
          },
        ],
      },
      {
        id: 'mechanism', title: '机制', emptyLabel: '本提案没有机制条目。',
        groups: draft.mechanism.map((item, index) => ({
          id: `mechanism-${index + 1}`, title: inline(item.name), provenance: 'paper-source',
          anchors: pageAnchors(item.pages), rows: [
            { label: '输入', text: inline(item.input) },
            { label: '变换', text: inline(item.transformation) },
            { label: '输出', text: inline(item.output) },
            { label: '依赖', text: inline(item.dependency) },
          ],
        })),
      },
      {
        id: 'mechanism-details', title: '待核对的机制细节', emptyLabel: '没有待核对的机制细节。',
        groups: draft.mechanism_details_to_verify.map((item, index) => ({
          id: `mechanism-detail-${index + 1}`, provenance: 'paper-source',
          anchors: pageAnchors(item.pages), rows: [{ text: inline(item.text) }],
        })),
      },
      {
        id: 'evidence', title: '证据', emptyLabel: '本提案没有证据条目。',
        groups: draft.evidence.map((item, index) => ({
          id: `evidence-${index + 1}`, title: `证据 ${index + 1}`, provenance: 'paper-source',
          anchors: pageAnchors(item.pages), rows: [
            { label: '主张', text: inline(item.claim) },
            { label: '设置', text: inline(item.setting) },
            { label: '结果', text: inline(item.finding) },
          ],
        })),
      },
      {
        id: 'implementation', title: '实现入口', emptyLabel: '本提案没有实现入口。',
        groups: draft.implementation_hooks.map((item, index) => ({
          id: `implementation-${index + 1}`, title: `实现入口 ${index + 1}`,
          provenance: 'wiki-synthesis', anchors: pageAnchors(item.pages), rows: [
            { label: '任务', text: inline(item.task) },
            { label: '首先检查', text: inline(item.first_check) },
          ],
        })),
      },
      {
        id: 'limitations', title: '局限与不确定性', emptyLabel: '本提案没有提取到有原文依据的局限。',
        groups: draft.limitations.map((item, index) => ({
          id: `limitation-${index + 1}`, provenance: 'paper-source',
          anchors: pageAnchors(item.pages), rows: [{ text: inline(item.text) }],
        })),
      },
      {
        id: 'user-insights', title: '你的阅读洞见', emptyLabel: '本提案没有纳入个人阅读记录。',
        groups: draft.user_observations.map((item, index) => ({
          id: `user-insight-${index + 1}`, provenance: 'user-insight',
          anchors: item.reading_refs, rows: [{ text: inline(item.text) }],
        })),
      },
      {
        id: 'open-questions', title: '开放问题', emptyLabel: '本提案没有开放问题。',
        groups: draft.open_questions.map((item, index) => ({
          id: `open-question-${index + 1}`, provenance: 'open-question', anchors: [],
          rows: [{ text: inline(item) }],
        })),
      },
    ],
  }
}

/** Revalidate every model-provided anchor against the user-confirmed Core snapshot. */
export function validatePaperWikiDraftScope(draft: PaperWikiDraft, scope: {
  paperPages: number
  readingRefs: ReadonlySet<string>
}): void {
  const statements = [
    draft.problem,
    ...draft.what_to_remember,
    ...draft.retrieval.fits,
    ...draft.mechanism,
    ...draft.mechanism_details_to_verify,
    ...draft.evidence,
    ...draft.implementation_hooks,
    ...draft.limitations,
  ]
  for (const statement of statements) {
    if (new Set(statement.pages).size !== statement.pages.length
      || statement.pages.some((page) => page > scope.paperPages)) {
      throw new Error('Harness 返回的 Wiki 提案引用了范围外的论文页')
    }
  }
  for (const observation of draft.user_observations) {
    if (new Set(observation.reading_refs).size !== observation.reading_refs.length
      || observation.reading_refs.some((item) => !scope.readingRefs.has(item))) {
      throw new Error('Harness 返回的 Wiki 提案引用了范围外的阅读记录')
    }
  }
}

/** Mirror Harness uniqueness and question-shape invariants at the Core trust boundary. */
export function validatePaperWikiDraftSemantics(draft: PaperWikiDraft): void {
  const requireUnique = (values: readonly string[], label: string) => {
    const normalized = values.map((value) => inline(value).toLowerCase())
    if (new Set(normalized).size !== normalized.length) {
      throw new Error(`Harness 返回的 Wiki 提案包含重复的${label}`)
    }
  }
  requireUnique(draft.what_to_remember.map((item) => item.text), '核心要点')
  requireUnique(draft.retrieval.fits.map((item) => item.query), '检索问题')
  requireUnique(draft.mechanism.map((item) => item.name), '机制组件')
  requireUnique(draft.evidence.map((item) => item.claim), '证据主张')
  requireUnique(draft.implementation_hooks.map((item) => item.task), '实现任务')
  requireUnique(draft.open_questions, '开放问题')
  if (draft.open_questions.some((item) => !/[?？]$/u.test(item.trim()))) {
    throw new Error('Harness 返回的开放问题未使用问题形式')
  }
}

const QUALITY_DIMENSIONS: ReadonlySet<HarnessPaperWikiQuality['dimensions'][number]['id']> = new Set([
  'grounding', 'separation', 'retrieval', 'mechanism', 'evidence', 'implementation', 'uncertainty',
])

/** Revalidate the Harness-authored deterministic report before Core persists or displays it. */
export function validatePaperWikiQuality(
  quality: HarnessPaperWikiQuality,
  targetId: string,
): void {
  if (quality.caseId !== targetId) {
    throw new Error('Harness 返回的质量检查不属于当前论文')
  }
  const ids = quality.dimensions.map((dimension) => dimension.id)
  if (new Set(ids).size !== QUALITY_DIMENSIONS.size
    || ids.some((id) => !QUALITY_DIMENSIONS.has(id))) {
    throw new Error('Harness 返回的质量检查维度不完整')
  }
  for (const dimension of quality.dimensions) {
    const hasFinding = quality.findings.some((finding) => finding.dimension === dimension.id)
    if (dimension.passed === hasFinding) {
      throw new Error('Harness 返回的质量检查汇总不一致')
    }
  }
  const expectedPassed = quality.findings.length === 0 && quality.dimensions.every((item) => item.passed)
  if (quality.passed !== expectedPassed) {
    throw new Error('Harness 返回的质量检查结论不一致')
  }
}

/** Convert process-level failures into stable user-facing errors without exposing provider data. */
export function paperWikiHarnessError(cause: unknown): Error {
  if (!(cause instanceof HarnessRpcError)) {
    return cause instanceof Error ? cause : new Error(String(cause))
  }
  if (cause.kind === 'cancelled') {
    return new Error('已停止生成。模型请求若已发出，服务商仍可能计费；再次生成需要重新确认。')
  }
  if (cause.kind === 'harness_gone') {
    return new Error('AI 服务已停止，本次任务不会自动重试。请重新确认后再试。')
  }
  if (cause.kind === 'bad_request') {
    return new Error('论文内容过大或 AI 任务格式不受支持，本次未自动重试。')
  }
  return cause
}

/** Real Paper Wiki runner. Core supplies reads and Harness supplies only an unapplied draft. */
export function createPaperWikiHarnessRunner(options: {
  store: VaultStore
  model: HarnessModelConfig
  onLog?: (line: string) => void
}) {
  const rpc = createHarnessRpc({
    launch: launchHarnessProcess,
    requiredCapabilities: ['paper-wiki'],
    ...(options.onLog === undefined ? {} : { onLog: options.onLog }),
    callbacks: {
      'papers.get': (params) => {
        const paper = options.store.getPaper(PapersGetParamsSchema.parse(params).id)
        return {
          id: paper.id,
          title: paper.title,
          authors: paper.authors ?? [],
          ...(paper.year === undefined ? {} : { year: paper.year }),
          venue: paper.venue,
          ...(paper.identifier === undefined ? {} : { identifier: paper.identifier }),
          ...(paper.abstract === undefined ? {} : { abstract: paper.abstract }),
        }
      },
      'papers.reading': (params) => {
        const reading = options.store.paperReading(PapersReadingParamsSchema.parse(params).id)
        return {
          highlights: reading.highlights.map(({ id, page, quote, note }) => ({ id, page, quote, note })),
          notes: reading.notes.map(({ id, page, text }) => ({ id, page, text })),
          remark: reading.remark,
        }
      },
      'papers.source': async (params) => {
        const source = options.store.paperSource(PapersSourceParamsSchema.parse(params).id)
        return { pages: await extractPdfPages(source) }
      },
      'wiki.page': (params) => {
        const wiki = options.store.wikiPaper(WikiPageParamsSchema.parse(params).id)
        return { id: wiki.id, body: wiki.body }
      },
    },
  })

  const run: HarnessRunner = async (execution: HarnessExecution) => {
    let result: z.infer<typeof DraftEnvelopeSchema>
    try {
      result = DraftEnvelopeSchema.parse(await rpc.request('paper-wiki.propose', {
        workflow: execution.plan.workflow,
        targetId: execution.plan.targetId,
        scopeDigest: execution.plan.scopeDigest,
        action: execution.plan.action,
        model: await options.model.runtime(),
        limits: execution.limits,
      }, { signal: execution.signal }))
    } catch (cause) {
      throw paperWikiHarnessError(cause)
    }
    if (result.targetId !== execution.plan.targetId
      || result.scopeDigest !== execution.plan.scopeDigest
      || result.action !== execution.plan.action) {
      throw new Error('Harness 返回的 Wiki 提案范围与确认任务不一致')
    }
    validatePaperWikiDraftScope(result.draft, {
      paperPages: execution.snapshot.paper.pageCount,
      readingRefs: new Set([
        ...execution.snapshot.reading.highlights.map((item) => `highlight:${item.id}`),
        ...execution.snapshot.reading.notes.map((item) => `note:${item.id}`),
        ...(execution.snapshot.reading.remark.trim() === '' ? [] : ['remark']),
      ]),
    })
    validatePaperWikiDraftSemantics(result.draft)
    validatePaperWikiQuality(result.quality, execution.plan.targetId)
    return {
      state: 'proposal-ready',
      message: 'Wiki 提案已生成。请审核内容，确认后再写入。',
      proposalBody: renderPaperWikiDraft(result.draft),
      proposalReview: projectPaperWikiReview(result.draft),
      proposalQuality: result.quality,
    }
  }

  return { run, close: rpc.close }
}
