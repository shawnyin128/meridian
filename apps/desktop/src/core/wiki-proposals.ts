import { createHash } from 'node:crypto'
import type {
  AgentProposal, ChangeSource, ConflictTarget, Evidence, PageVersion, ProposalOp, ProposalReceipt, ProposalRecord,
  ProposalStatus, WikiProposal,
} from '../shared/contract.js'
import { AgentProposalSchema, WIKI_PROTOCOL_VERSION } from '../shared/contract.js'
import { PAPER_PAGE } from '../shared/vocabulary.js'
import { stableJson } from './changelog.js'
import { extractPdfPages } from './paper-library/index.js'
import type { VaultStore } from './vault.js'
import { HUMAN, isClaimOp, namedPages, normalizeQuote } from './wiki/index.js'

/** What one page of a paper's PDF holds: its text, no text layer, no such page (and how many it has), or no PDF at all. */
export type PdfPage =
  | { state: 'text'; text: string }
  | { state: 'empty' }
  | { state: 'no-page'; pages: number }
  | { state: 'no-pdf' }

/** Reads page `page` (1-based) of the PDF behind paper page `paper` (`papers/<id>`). */
export type PdfPageText = (paper: string, page: number) => Promise<PdfPage>

/** First 16 hex characters of the SHA-256 of `value`'s stable JSON. */
export const digestOf = (value: unknown): string =>
  createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex').slice(0, 16)

/** The change-log chip of a non-human proposal, from its trigger (write protocol §2.1). */
const chipOf = (proposal: AgentProposal): ChangeSource =>
  proposal.trigger.kind === 'reading' ? '笔记' : proposal.trigger.kind === 'experiment' ? '实验' : 'Meridian'

/** The `by` an AI producer's claims carry. */
const byOf = (proposal: AgentProposal): string =>
  (proposal.producer.kind === 'ai' ? `ai:${proposal.producer.id}` : HUMAN)

/** Returns the PdfPageText that reads a vault paper's source through `store` with pdf.js. */
export function pdfPageText(store: Pick<VaultStore, 'paperSource'>): PdfPageText {
  return async (paper, page) => {
    let bytes: Uint8Array
    try {
      bytes = store.paperSource(paper.slice(PAPER_PAGE.length))
    } catch {
      // A paper page without a source PDF has no text to check a quote against.
      return { state: 'no-pdf' }
    }
    const pages = await extractPdfPages(bytes)
    if (page > pages.length) return { state: 'no-page', pages: pages.length }
    const text = pages[page - 1]!.text
    return text.trim() === '' ? { state: 'empty' } : { state: 'text', text }
  }
}

/**
 * Checks every source evidence item and source conflict target in `ops` against its PDF (write protocol
 * §4.3). Returns the refusal for a page the PDF lacks, a quote absent from a page that has text, or, from
 * a producer other than HUMAN, a quote shorter than 12 characters after normalization; otherwise null
 * with the items whose page had no text layer (or whose paper has no PDF) listed as unverifiable.
 */
export async function checkQuotes(
  ops: ProposalOp[], by: string, pdf: PdfPageText,
): Promise<{ invalid: string | null; unverifiable: string[] }> {
  const sources = ops.flatMap((op) => {
    const items = op.op === 'addClaim' ? op.claim.evidence
      : op.op === 'reviseClaim' || op.op === 'addEvidence' ? op.evidence ?? []
        : op.op === 'markConflict' ? [op.conflict.against] : []
    return items.flatMap((item) => (item.kind === 'source' ? [item] : []))
  })
  const unverifiable: string[] = []
  for (const source of sources) {
    const quote = normalizeQuote(source.quote)
    if (by !== HUMAN && [...quote].length < 12) {
      return { invalid: `引句太短,至少要 12 个字符才能核对:${source.paper}`, unverifiable }
    }
    const held = await pdf(source.paper, source.page)
    if (held.state === 'no-page') {
      return { invalid: `${source.paper} 的原文只有 ${held.pages} 页,没有第 ${source.page} 页`, unverifiable }
    }
    if (held.state !== 'text') {
      unverifiable.push(`${source.paper} p.${source.page}`)
      continue
    }
    if (!normalizeQuote(held.text).includes(quote)) {
      return { invalid: `引句在原文第 ${source.page} 页找不到:${source.paper}`, unverifiable }
    }
  }
  return { invalid: null, unverifiable }
}

/**
 * Returns the envelope `raw` holds. Throws, naming the cause, when its protocol is not this Core's or
 * it does not have the envelope's shape.
 */
export function parseEnvelope(raw: unknown): AgentProposal {
  const protocol = typeof raw === 'object' && raw !== null ? (raw as { protocol?: unknown }).protocol : undefined
  if (protocol !== WIKI_PROTOCOL_VERSION) {
    throw new Error(`提案协议版本 ${String(protocol)} 不认识,Core 只认 ${WIKI_PROTOCOL_VERSION};请更新 App`)
  }
  const parsed = AgentProposalSchema.safeParse(raw)
  if (!parsed.success) throw new Error(`提案的格式不对:${parsed.error.message}`)
  return parsed.data
}

/** A proposal's evaluation: how it stands, the refusal when it is rejected, and the unverifiable-quote notice. */
type Outcome = { status: 'queued' | 'rejected'; reason: ProposalRecord['reason']; notice: string | null }

/** The stale refusal for page `id` (write protocol §3.3). */
const staleMessage = (id: string, base: PageVersion | null, now: PageVersion | null): string => {
  const show = (v: PageVersion | null): string => (v === null ? '不存在' : `fm ${v.fm} / body ${v.body}`)
  return `提案过期:${id} 在提案生成之后改过(提案依据 ${show(base)},现在 ${show(now)}),没有落盘。按现在的页重新生成。`
}

/**
 * Returns the review queue over `store` (write protocol §5.3, §7.1): non-human proposals are evaluated
 * and recorded, never applied without the user, and the proposal inbox is drained into the queue.
 * `pdf` reads PDF pages for quote verification and `now` supplies epoch ms.
 */
export function createWikiProposals({ store, pdf, now }: {
  store: VaultStore
  pdf: PdfPageText
  now: () => number
}) {
  /** The first page of `proposal` whose base version is not the page's version now, with the refusal; null when none. */
  const staleness = (proposal: AgentProposal): string | null => {
    for (const [id, base] of Object.entries(proposal.base)) {
      const current = store.pageVersion(id)
      if (current?.fm !== base?.fm || current?.body !== base?.body) return staleMessage(id, base, current)
    }
    return null
  }

  /**
   * The titles and claim texts the review list shows for `proposal` writing `pages` (see
   * WikiProposalSchema), read from the vault as it stands; a page, project, node or claim that is gone
   * gets no entry.
   */
  const labelsOf = (proposal: AgentProposal, pages: string[]): Pick<WikiProposal, 'titles' | 'claimTexts'> => {
    const titles: Record<string, string> = {}
    const claimTexts: Record<string, string> = {}
    const aggregations = new Map(store.wikiCards().map((card) => [card.id, card.title]))
    const page = (id: string): void => {
      if (id in titles) return
      const title = aggregations.get(id)
        ?? (id.startsWith(PAPER_PAGE) && store.pageVersion(id) !== null ? store.wikiPaper(id).title : undefined)
      if (title !== undefined) titles[id] = title
    }
    const claim = (ref: string): void => {
      const [id, claimId] = ref.split('#') as [string, string]
      page(id)
      if (!aggregations.has(id)) return
      const found = store.wikiAggregation(id).claims.find((c) => c.id === claimId)
      if (found !== undefined) claimTexts[ref] = found.text
    }
    const project = (id: string, part: { node?: string | undefined; conclusion?: string | undefined }): void => {
      if (!store.listProjects().some((p) => p.id === id)) return
      const held = store.getProject(id)
      titles[`projects/${id}`] = held.name
      const node = [...held.graph.nodes, ...held.workspace?.graph?.nodes ?? []].find((n) => n.id === part.node)
      if (node !== undefined) titles[`projects/${id}#${node.id}`] = node.label
      const conclusion = held.conclusionList.find((c) => c.id === part.conclusion)
      if (conclusion !== undefined) titles[`projects/${id}#${conclusion.id}`] = conclusion.text
    }
    const evidence = (e: Evidence | ConflictTarget): void => {
      if (e.kind === 'source' || e.kind === 'note') page(e.paper)
      else if (e.kind === 'experiment') project(e.project, e)
      else if (e.kind === 'claim' || (e.kind === 'wiki' && e.ref.includes('#'))) claim(e.ref)
      else if (e.kind === 'wiki') page(e.ref)
    }
    if (proposal.trigger.kind === 'experiment') project(proposal.trigger.project, proposal.trigger)
    for (const id of pages) page(id)
    for (const op of proposal.ops) {
      if (isClaimOp(op) && op.op !== 'addClaim') claim(`${op.page}#${op.claim}`)
      const items = op.op === 'addClaim' ? op.claim.evidence
        : op.op === 'reviseClaim' || op.op === 'addEvidence' ? op.evidence ?? []
          : op.op === 'markConflict' ? [op.conflict.against] : []
      for (const item of items) evidence(item)
    }
    return { titles, claimTexts }
  }

  /**
   * `projects/<id>#<node or conclusion>` of each project conclusion `proposal` cites as evidence that the
   * user has not verified: a node conclusion without a current verification, or a legacy conclusion
   * whose stored state is not verified. A project that is gone is left to validation.
   */
  const unverifiedOf = (proposal: AgentProposal): string[] => {
    const refs: string[] = []
    for (const op of proposal.ops) {
      const items = op.op === 'addClaim' ? op.claim.evidence
        : op.op === 'reviseClaim' || op.op === 'addEvidence' ? op.evidence ?? [] : []
      for (const e of items) {
        if (e.kind !== 'experiment' || !store.listProjects().some((p) => p.id === e.project)) continue
        const held = store.getProject(e.project)
        const verified = e.node !== undefined
          ? held.projectConclusions?.find((c) => c.node === e.node)?.verifiedOn !== undefined
          : held.conclusionList.find((c) => c.id === e.conclusion)?.state === 'verified'
        const ref = `projects/${e.project}#${e.node ?? e.conclusion}`
        if (!verified && !refs.includes(ref)) refs.push(ref)
      }
    }
    return refs
  }

  /** Write protocol §7.1 steps 3–6 against the vault as it stands. */
  const evaluate = async (proposal: AgentProposal): Promise<Outcome> => {
    const reject = (kind: 'stale' | 'invalid', message: string): Outcome =>
      ({ status: 'rejected', reason: { kind, message }, notice: null })
    if (proposal.producer.kind === 'human') return reject('invalid', '人工的改动走 wiki.apply')
    if (!proposal.ops.every(isClaimOp)) return reject('invalid', 'agent 只能提交结论相关的提案')
    const uncovered = namedPages(proposal.ops).find((id) => !(id in proposal.base))
    if (uncovered !== undefined) return reject('invalid', `提案没有给出它依据的页的版本:${uncovered}`)
    const stale = staleness(proposal)
    if (stale !== null) return reject('stale', stale)
    try {
      store.checkProposal(proposal.ops, byOf(proposal))
    } catch (error) {
      // An op the vault refuses is the proposal's outcome, recorded and returned rather than thrown.
      return reject('invalid', error instanceof Error ? error.message : String(error))
    }
    const quotes = await checkQuotes(proposal.ops, byOf(proposal), pdf)
    if (quotes.invalid !== null) return reject('invalid', quotes.invalid)
    const notice = quotes.unverifiable.length === 0 ? null : `这些引句没有文字层可核对:${quotes.unverifiable.join('、')}`
    return { status: 'queued', reason: null, notice }
  }

  const receiptOf = (record: ProposalRecord): ProposalReceipt =>
    ({ id: record.id, status: record.status, reason: record.reason })

  /** Puts `record` at the front of the queue. */
  const push = (record: ProposalRecord): ProposalRecord => {
    store.saveProposalRecords([record, ...store.proposalRecords()])
    return record
  }

  /** A record for an inbox file that could not become a proposal: rejected as invalid with `message`. */
  const unreadable = (text: string, message: string): ProposalRecord => push({
    id: store.nextProposalId(), digest: digestOf(text), proposal: null, received: now(), path: 'review',
    status: 'rejected', reason: { kind: 'invalid', message }, decided: { at: now(), by: 'policy' }, change: null,
    notice: null,
  })

  /**
   * Submits an envelope (write protocol §7.1): the same producer and key with the same content returns the
   * existing receipt; otherwise the proposal is evaluated and recorded — queued for review, or rejected as
   * stale or invalid — and the receipt returned. Throws when `raw` is not an envelope this Core reads, or
   * the key was used before for different content.
   */
  const propose = async (raw: unknown): Promise<ProposalReceipt> => {
    const proposal = parseEnvelope(raw)
    const digest = digestOf(proposal)
    const producer = proposal.producer.kind === 'ai' ? proposal.producer.id : HUMAN
    const held = store.proposalRecords().find((r) => r.proposal !== null && r.proposal.key === proposal.key
      && (r.proposal.producer.kind === 'ai' ? r.proposal.producer.id : HUMAN) === producer)
    if (held !== undefined) {
      if (held.digest === digest) return receiptOf(held)
      throw new Error(`同一个 key 已经提交过内容不同的提案:${proposal.key}`)
    }
    const outcome = await evaluate(proposal)
    return receiptOf(push({
      id: store.nextProposalId(), digest, proposal, received: now(), path: 'review', status: outcome.status,
      reason: outcome.reason, decided: outcome.status === 'queued' ? null : { at: now(), by: 'policy' },
      change: null, notice: outcome.notice,
    }))
  }

  let scanning = false

  return {
    propose,

    /**
     * Passes every file waiting in the proposal inbox through propose, in file name order, and removes
     * it once its record is written. A file that is not an envelope, or reuses a key for different
     * content, is recorded as rejected and invalid with the cause. A scan started while another runs
     * does nothing.
     */
    async scanInbox(): Promise<void> {
      if (scanning) return
      scanning = true
      try {
        for (const { name, text } of store.proposalInbox()) {
          try {
            await propose(JSON.parse(text))
          } catch (error) {
            // The file is consumed either way; what could not be read is kept in the queue as the record.
            unreadable(text, `${name}:${error instanceof Error ? error.message : String(error)}`)
          }
          store.dropProposalInboxFile(name)
        }
      } finally {
        scanning = false
      }
    },

    /**
     * Returns the queue records with `status` (every record when absent), newest first, each with the
     * pages it would write, whether its base is stale now, the unverified project conclusions a queued one
     * cites, and the titles and claim texts it names. A
     * record whose proposal cannot be read against the vault is listed as unreadable with the cause as
     * its notice, and the others list as usual.
     */
    list(status?: ProposalStatus): WikiProposal[] {
      return store.proposalRecords().filter((r) => status === undefined || r.status === status).map((r) => {
        try {
          const pages = r.proposal === null ? [] : store.pagesWritten(r.proposal.ops)
          return {
            ...r,
            pages,
            staleNow: r.proposal !== null && staleness(r.proposal) !== null,
            unverified: r.proposal === null || r.status !== 'queued' ? [] : unverifiedOf(r.proposal),
            ...(r.proposal === null ? { titles: {}, claimTexts: {} } : labelsOf(r.proposal, pages)),
          }
        } catch (error) {
          const cause = error instanceof Error ? error.message : String(error)
          console.error(`[wiki] 提案 ${r.id} 读不出来,其余照常列出:${cause}`)
          return { ...r, proposal: null, notice: cause, pages: [], staleNow: false, titles: {}, claimTexts: {} }
        }
      })
    },

    /**
     * The user's decision on queued record `id`: `decline` rejects it as declined with `reason`; `apply`
     * reruns the staleness, validation and quote checks and applies it as its producer (recorded in the
     * change log under its trigger's chip), or rejects it as stale or invalid. Throws if there is no such
     * record, it is not queued, or applying it would write a project conclusion the user has not verified
     * (the record stays queued).
     */
    async decide(id: string, decision: 'apply' | 'decline', reason?: string): Promise<ProposalReceipt> {
      const record = store.proposalRecords().find((r) => r.id === id)
      if (record === undefined) throw new Error(`没有这条提案:${id}`)
      if (record.status !== 'queued' || record.proposal === null) throw new Error('这条提案已经处理过了')
      const proposal = record.proposal
      const decided = { at: now(), by: '我' as const }
      let next: ProposalRecord
      if (decision === 'decline') {
        next = { ...record, status: 'rejected', reason: { kind: 'declined', message: reason ?? '' }, decided }
      } else {
        const outcome = await evaluate(proposal)
        const unverified = unverifiedOf(proposal)
        if (outcome.status === 'rejected') {
          next = { ...record, status: 'rejected', reason: outcome.reason, decided }
        } else if (unverified.length > 0) {
          throw new Error(`结论待验证:${unverified.join('、')}。验证之后再应用`)
        } else {
          store.applyProposal({ source: 'user', title: proposal.title, ops: proposal.ops }, {
            by: byOf(proposal), source: chipOf(proposal),
          })
          next = { ...record, status: 'applied', decided, change: store.listChanges()[0]?.id ?? null, notice: outcome.notice }
        }
      }
      store.saveProposalRecords(store.proposalRecords().map((r) => (r.id === id ? next : r)))
      return receiptOf(next)
    },

    /** Throws the refusal checkQuotes gives for the user's `ops`; a quote with no text layer is accepted. */
    async checkHumanQuotes(ops: ProposalOp[]): Promise<void> {
      const { invalid } = await checkQuotes(ops, HUMAN, pdf)
      if (invalid !== null) throw new Error(invalid)
    },
  }
}
