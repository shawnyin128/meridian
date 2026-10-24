import { createHash } from 'node:crypto'
import type {
  HarnessApplyPaperWikiParams, HarnessApplyPaperWikiResult, HarnessCancelResult, HarnessPlan, HarnessRunReceipt,
  HarnessPaperWikiQuality, HarnessPaperWikiReview, HarnessPendingPaperWikiResult, HarnessRejectPaperWikiResult,
  HarnessRejectPaperWikiParams, HarnessStartParams, PaperReading, PaperRow, RecordedChange, WikiPaper,
} from '../../shared/contract.js'
import { CallError, callFailure } from '../call-error.js'
import type { AppliedHarnessProposal, HarnessProposalAuditEvent, PendingHarnessProposal } from './proposal-audit.js'

const PLAN_TTL_MS = 10 * 60 * 1_000
const MAX_MODEL_CALLS = 1
const MAX_OUTPUT_TOKENS = 6_000

export type HarnessModel = HarnessPlan['model']

type PaperWikiSnapshot = {
  paper: PaperRow
  reading: PaperReading
  wiki: WikiPaper
}

export type HarnessExecution = {
  plan: HarnessPlan
  snapshot: PaperWikiSnapshot
  signal: AbortSignal
  limits: {
    maxOutputTokens: number
    maxModelCalls: number
  }
}

export type HarnessRunner = (execution: HarnessExecution) => Promise<{
  state: HarnessRunReceipt['state']
  message: string
  proposalBody?: string
  proposalReview?: HarnessPaperWikiReview
  proposalQuality?: HarnessPaperWikiQuality
}>

type Dependencies = {
  paper: (id: string) => PaperRow
  reading: (id: string) => PaperReading
  wiki: (id: string) => WikiPaper
  model: HarnessModel | (() => HarnessModel)
  run: HarnessRunner
  /** Writes `body` to Wiki page `id` and returns the change entry that write recorded. */
  applyWiki: (id: string, body: string) => RecordedChange
  recordProposal?: (event: Omit<HarnessProposalAuditEvent, 'schemaVersion'>) => void
  initialProposals?: readonly PendingHarnessProposal[]
  /** Proposals already written to the Wiki, each reopened when the change its write recorded is undone. */
  initialApplied?: readonly AppliedHarnessProposal[]
  now?: () => Date
  nextId?: (prefix: string) => string
}

type HeldPlan = { plan: HarnessPlan; used: boolean }
type HeldProposal = {
  id: string
  targetId: string
  scopeDigest: string
  generatedAt: string
  body: string
  action?: 'create' | 'update'
  review?: HarnessPaperWikiReview
  quality?: HarnessPaperWikiQuality
  used: boolean
  /** While written to the Wiki, the change entry that write recorded. */
  change?: string
}

/** Stable digest of exactly the source, personal reading state, and current Wiki page the user saw. */
function digestOf(snapshot: PaperWikiSnapshot): string {
  const readingContent = {
    paperId: snapshot.reading.paperId,
    highlights: snapshot.reading.highlights,
    notes: snapshot.reading.notes,
    remark: snapshot.reading.remark,
  }
  return createHash('sha256').update(JSON.stringify({
    paper: snapshot.paper,
    reading: readingContent,
    wiki: snapshot.wiki,
  })).digest('hex')
}

function scopeOf(snapshot: PaperWikiSnapshot): HarnessPlan['scope'] {
  return {
    paperTitle: snapshot.paper.title,
    paperPages: snapshot.paper.pageCount,
    highlights: snapshot.reading.highlights.length,
    annotatedHighlights: snapshot.reading.highlights.filter((item) => item.note.trim() !== '').length,
    notes: snapshot.reading.notes.length,
    hasRemark: snapshot.reading.remark.trim() !== '',
    existingWikiChars: snapshot.wiki.body.length,
  }
}

/**
 * Core-owned one-shot cost gate. Preparing is deterministic and free. Starting requires the exact
 * plan digest, checks that its scope has not changed, consumes it once, and only then calls Harness.
 * A paper has at most one run going at a time.
 */
export function createHarnessCostGate(deps: Dependencies) {
  const now = deps.now ?? (() => new Date())
  let serial = 0
  const nextId = deps.nextId ?? ((prefix: string) => `${prefix}-${now().getTime()}-${serial += 1}`)
  const plans = new Map<string, HeldPlan>()
  const proposals = new Map<string, HeldProposal>([
    ...(deps.initialApplied ?? []).map((proposal): [string, HeldProposal] => [proposal.id, { ...proposal, used: true }]),
    ...(deps.initialProposals ?? []).map((proposal): [string, HeldProposal] => [proposal.id, { ...proposal, used: false }]),
  ])
  /** The controller of the run going for each paper, by paper id. */
  const running = new Map<string, AbortController>()

  const configuredModel = () => typeof deps.model === 'function' ? deps.model() : deps.model

  const snapshot = (paperId: string): PaperWikiSnapshot => ({
    paper: deps.paper(paperId),
    reading: deps.reading(paperId),
    wiki: deps.wiki(`papers/${paperId}`),
  })

  return {
    pendingPaperWiki(paperId: string): HarnessPendingPaperWikiResult {
      const proposal = [...proposals.values()]
        .filter((candidate) => !candidate.used && candidate.targetId === paperId)
        .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))[0]
      if (proposal === undefined) return null
      const current = snapshot(paperId)
      return {
        proposal: {
          id: proposal.id,
          targetId: proposal.targetId,
          action: proposal.action ?? (current.wiki.body.trim() === '' ? 'create' : 'update'),
          body: proposal.body,
          ...(proposal.review === undefined ? {} : { review: structuredClone(proposal.review) }),
          ...(proposal.quality === undefined ? {} : { quality: structuredClone(proposal.quality) }),
        },
        generatedAt: proposal.generatedAt,
        stale: digestOf(current) !== proposal.scopeDigest,
      }
    },

    prepare(paperId: string): HarnessPlan {
      const held = snapshot(paperId)
      const action = held.wiki.body.trim() === '' ? 'create' : 'update'
      const created = now()
      for (const [id, candidate] of plans) {
        if (candidate.used || Date.parse(candidate.plan.expiresAt) <= created.getTime()) plans.delete(id)
      }
      const plan: HarnessPlan = {
        id: nextId('plan'),
        workflow: 'paper-wiki',
        targetId: paperId,
        scopeDigest: digestOf(held),
        action,
        label: action === 'create' ? '生成 Wiki' : '更新 Wiki',
        scope: scopeOf(held),
        model: { ...configuredModel() },
        expiresAt: new Date(created.getTime() + PLAN_TTL_MS).toISOString(),
      }
      plans.set(plan.id, { plan, used: false })
      return structuredClone(plan)
    },

    async start(params: HarnessStartParams): Promise<HarnessRunReceipt> {
      if (params.acknowledgeCost !== true) throw new CallError('invalid', '必须明确确认 AI 运行可能产生费用')
      const held = plans.get(params.planId)
      if (held === undefined) throw new CallError('refused', '这份 AI 任务确认已失效，请重新准备')
      if (held.used) throw new CallError('refused', '这份 AI 任务确认已经使用过，请重新准备')
      if (held.plan.scopeDigest !== params.scopeDigest) throw new CallError('changed', 'AI 任务范围与确认内容不一致')
      if (Date.parse(held.plan.expiresAt) <= now().getTime()) {
        throw new CallError('refused', '这份 AI 任务确认已过期，请重新准备')
      }
      if (!held.plan.model.configured) throw new CallError('no-model', 'AI 尚未连接，请先在设置中配置模型')
      if (JSON.stringify(configuredModel()) !== JSON.stringify(held.plan.model)) {
        throw new CallError('changed', 'AI 模型配置已变化，请重新确认任务')
      }

      const current = snapshot(held.plan.targetId)
      if (digestOf(current) !== held.plan.scopeDigest) {
        throw new CallError('changed', '论文、笔记或 Wiki 已发生变化，请重新确认范围')
      }
      if (running.has(held.plan.targetId)) {
        throw new CallError('busy', '这篇论文的 Wiki 提案仍在生成，请先停止或等待完成')
      }

      // Consume before crossing the cost boundary. A provider error may already have spent tokens,
      // so retrying always requires a fresh user-confirmed plan.
      held.used = true
      const startedAt = now().toISOString()
      const controller = new AbortController()
      running.set(held.plan.targetId, controller)
      let result: Awaited<ReturnType<HarnessRunner>>
      try {
        result = await deps.run({
          plan: structuredClone(held.plan),
          snapshot: current,
          signal: controller.signal,
          limits: { maxOutputTokens: MAX_OUTPUT_TOKENS, maxModelCalls: MAX_MODEL_CALLS },
        })
      } finally {
        if (running.get(held.plan.targetId) === controller) running.delete(held.plan.targetId)
      }
      const receipt: HarnessRunReceipt = {
        id: nextId('run'),
        planId: held.plan.id,
        workflow: held.plan.workflow,
        targetId: held.plan.targetId,
        startedAt,
        state: result.state,
        message: result.message,
      }
      if (result.proposalBody !== undefined) {
        const proposalId = nextId('proposal')
        const generatedAt = now().toISOString()
        proposals.set(proposalId, {
          id: proposalId,
          targetId: held.plan.targetId,
          scopeDigest: held.plan.scopeDigest,
          generatedAt,
          body: result.proposalBody,
          action: held.plan.action,
          ...(result.proposalReview === undefined ? {} : { review: structuredClone(result.proposalReview) }),
          ...(result.proposalQuality === undefined ? {} : {
            quality: structuredClone(result.proposalQuality),
          }),
          used: false,
        })
        receipt.proposal = {
          id: proposalId,
          targetId: held.plan.targetId,
          action: held.plan.action,
          body: result.proposalBody,
          ...(result.proposalReview === undefined ? {} : { review: structuredClone(result.proposalReview) }),
          ...(result.proposalQuality === undefined ? {} : {
            quality: structuredClone(result.proposalQuality),
          }),
        }
        try {
          deps.recordProposal?.({
            event: 'generated', proposalId, targetId: held.plan.targetId,
            scopeDigest: held.plan.scopeDigest, at: generatedAt, body: result.proposalBody,
            action: held.plan.action,
            ...(result.proposalReview === undefined ? {} : { review: result.proposalReview }),
            ...(result.proposalQuality === undefined ? {} : { quality: result.proposalQuality }),
          })
        } catch (error) {
          console.error(`[harness] 提案已生成，但审计记录写入失败：${error instanceof Error ? error.message : String(error)}`)
          receipt.warning = callFailure(error)
        }
      }
      return receipt
    },

    /** Stops the run going for paper `paperId`; from then on the paper no longer counts as generating. */
    cancel(paperId: string): HarnessCancelResult {
      const controller = running.get(paperId)
      if (controller === undefined) throw new CallError('refused', '这项 AI 任务当前没有在运行')
      controller.abort()
      running.delete(paperId)
      return { paperId, cancelled: true }
    },

    /** The ids of the papers whose Wiki proposal is being generated. */
    generating(): string[] {
      return [...running.keys()]
    },

    applyPaperWiki(params: HarnessApplyPaperWikiParams): HarnessApplyPaperWikiResult {
      const proposal = proposals.get(params.proposalId)
      if (proposal === undefined) throw new CallError('not-found', '这份 Wiki 提案不存在或已经失效')
      if (proposal.used) throw new CallError('refused', '这份 Wiki 提案已经写入过')
      const current = snapshot(proposal.targetId)
      if (digestOf(current) !== proposal.scopeDigest) {
        throw new CallError('changed', '论文、笔记或 Wiki 已发生变化，请重新生成提案')
      }
      const { change } = deps.applyWiki(`papers/${proposal.targetId}`, params.body)
      proposal.used = true
      proposal.change = change
      const result: HarnessApplyPaperWikiResult = {
        proposalId: proposal.id,
        wikiId: `papers/${proposal.targetId}`,
        appliedAt: now().toISOString(),
        change,
      }
      try {
        deps.recordProposal?.({
          event: 'applied', proposalId: proposal.id, targetId: proposal.targetId,
          scopeDigest: proposal.scopeDigest, at: result.appliedAt, body: params.body, change,
        })
      } catch (error) {
        console.error(`[harness] Wiki 已写入，但审计记录写入失败：${error instanceof Error ? error.message : String(error)}`)
        result.warning = callFailure(error)
      }
      return result
    },

    /**
     * Makes the proposal whose Wiki write recorded change entry `change` reviewable again, as that
     * write has just been undone, and logs it as generated again so it stays pending across restarts.
     * Does nothing for any other change.
     */
    reopenPaperWiki(change: string): void {
      const proposal = [...proposals.values()].find((held) => held.used && held.change === change)
      if (proposal === undefined) return
      proposal.used = false
      delete proposal.change
      try {
        deps.recordProposal?.({
          event: 'generated', proposalId: proposal.id, targetId: proposal.targetId,
          scopeDigest: proposal.scopeDigest, at: proposal.generatedAt, body: proposal.body,
          ...(proposal.action === undefined ? {} : { action: proposal.action }),
          ...(proposal.review === undefined ? {} : { review: proposal.review }),
          ...(proposal.quality === undefined ? {} : { quality: proposal.quality }),
        })
      } catch (error) {
        console.error(`[harness] 提案已回到待审核，但审计记录写入失败：${error instanceof Error ? error.message : String(error)}`)
      }
    },

    rejectPaperWiki(params: HarnessRejectPaperWikiParams): HarnessRejectPaperWikiResult {
      const proposal = proposals.get(params.proposalId)
      if (proposal === undefined) throw new CallError('not-found', '这份 Wiki 提案不存在或已经失效')
      if (proposal.used) throw new CallError('refused', '这份 Wiki 提案已经处理过')
      const rejectedAt = now().toISOString()
      const result: HarnessRejectPaperWikiResult = { proposalId: params.proposalId, rejectedAt }
      try {
        deps.recordProposal?.({
          event: 'rejected', proposalId: proposal.id, targetId: proposal.targetId,
          scopeDigest: proposal.scopeDigest, at: rejectedAt,
          ...(params.feedback === undefined ? {} : { feedback: structuredClone(params.feedback) }),
        })
      } catch (error) {
        console.error(`[harness] 提案已丢弃，但审计记录写入失败：${error instanceof Error ? error.message : String(error)}`)
        result.warning = callFailure(error)
      }
      proposal.used = true
      return result
    },
  }
}

export type HarnessCostGate = ReturnType<typeof createHarnessCostGate>
