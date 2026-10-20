import { useState } from 'react'
import type { ConflictTarget, DiffPiece, Evidence, ProposalOp, WikiProposal } from '../../../shared/contract.js'
import { localDayOf } from '../../../shared/dates.js'
import { PAPER_PAGE } from '../../../shared/vocabulary.js'
import { useFormat } from '../../lib/format.js'
import type { Catalog } from '../../messages/catalog.js'
import { useMessages } from '../../messages/useMessages.js'
import { ActionPopover } from '../ActionPopover.js'
import { DiffLines, LinePieces, paperLine, type DiffLine } from '../DiffLines.js'
import { EmptyState } from '../EmptyState.js'
import { FormInput } from '../FormControls.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { SectionHeading } from '../PageShell.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { AgentLabel } from '../SourceLabel.js'
import { CountBadge, Tag, TagButton } from '../Tag.js'
import { PaperText } from '../paper/PaperText.js'
import './ReviewQueue.css'

/** The button that opens the review queue, with the number of proposals waiting. */
export function ReviewEntry({ count, onOpen }: { count: number; onOpen: () => void }) {
  const m = useMessages()
  return (
    <button type="button" className="btn review-entry" onClick={onOpen}>
      {m.wiki.queue.entry}
      {count > 0 ? <CountBadge count={count} /> : null}
    </button>
  )
}

/** Local calendar day, the vault's day, a proposal arrived or was decided, from epoch ms. */
const dayOf = (ms: number): string => localDayOf(new Date(ms).toISOString())

/** A line's text, or `message` placing the paper title `title` in it. */
type Titled = string | { message: (title: string) => string; title: string }

/** `text` with `wrap` around it; a paper title it names stays where it was placed. */
const within = (text: Titled, wrap: (inner: string) => string): Titled =>
  (typeof text === 'string' ? wrap(text) : { message: (title) => wrap(text.message(title)), title: text.title })

/** A Wiki page id as Core's findings write it. */
const PAGE_ID = /[\p{L}\p{N}._-]+\/[\p{L}\p{N}._-]+/gu

/**
 * `text`, a finding Core wrote, in pieces: each page id `titles` names reads as its title, a paper
 * page's as paper text; everything else stays as written.
 */
function named(text: string, titles: Record<string, string>): DiffPiece[] {
  const pieces: DiffPiece[] = []
  let from = 0
  for (const match of text.matchAll(PAGE_ID)) {
    const title = titles[match[0]]
    if (title === undefined) continue
    pieces.push(text.slice(from, match.index), match[0].startsWith(PAPER_PAGE) ? { paper: title } : title)
    from = match.index + match[0].length
  }
  return [...pieces, text.slice(from)]
}

/** `text` as a change line, its paper title as paper text. */
const lineOf = (text: Titled): DiffLine => (typeof text === 'string' ? text : paperLine(text.message, text.title))

/**
 * The change lines of `op` in `p`: everything applying it would write, with claims by their current text
 * and pages, papers, projects, nodes and conclusions by their titles (the id stands for one no longer in
 * the vault), paper titles as paper text. A revision shows the old text and the new one; each evidence
 * item gets a line of its own.
 */
function linesOf(op: ProposalOp, p: WikiProposal, w: Catalog['wiki']): Titled[] {
  const c = w.queue.change
  const title = (id: string): string => p.titles[id] ?? id
  const text = (ref: string): string => p.claimTexts[ref] ?? ref.split('#')[1]!
  const paper = (id: string, message: (title: string) => string = (name) => name): Titled => ({ message, title: title(id) })
  const side = (item: Evidence | ConflictTarget): [string, Titled] => {
    switch (item.kind) {
      case 'source': return [w.claims.evidence, paper(item.paper, (name) => c.quote(name, item.page, item.quote))]
      case 'experiment': {
        const point = item.node ?? item.conclusion
        const name = [title(`projects/${item.project}`), ...(point === undefined ? [] : [title(`projects/${item.project}#${point}`)])]
        return [w.claims.experiment, c.detail(name.join(' · '), item.text ?? '')]
      }
      case 'wiki': return [
        w.claims.evidence,
        item.ref.includes('#') ? text(item.ref) : item.ref.startsWith(PAPER_PAGE) ? paper(item.ref) : title(item.ref),
      ]
      case 'claim': return [w.claims.conflict, text(item.ref)]
      case 'note': return [w.claims.note, paper(item.paper)]
      case 'personal': return [w.claims.personal, item.text]
    }
  }
  const evidence = (items: Evidence[]): Titled[] => items.map((item) => {
    const [kind, detail] = side(item)
    return within(detail, (shown) => c.evidenceLine(kind, shown))
  })
  switch (op.op) {
    case 'addClaim': return [c.add(op.claim.text), ...evidence(op.claim.evidence)]
    case 'reviseClaim': {
      const held = p.claimTexts[`${op.page}#${op.claim}`]
      return [...(held === undefined ? [] : [c.before(held)]), c.after(op.text), ...evidence(op.evidence ?? [])]
    }
    case 'addEvidence': return [c.evidence(text(`${op.page}#${op.claim}`)), ...evidence(op.evidence)]
    case 'markConflict': {
      const other = op.conflict.against.kind === 'claim' ? text(op.conflict.against.ref) : side(op.conflict.against)[1]
      return [within(other, (shown) => c.conflict(text(`${op.page}#${op.claim}`), shown, op.conflict.note))]
    }
    case 'resolveConflict': return [c.resolve(text(`${op.page}#${op.claim}`), c.outcomes[op.outcome], op.note)]
    case 'retractClaim': return [c.retract(text(`${op.page}#${op.claim}`), op.reason)]
    default: return [c.other]
  }
}

/**
 * The review queue: every queued agent proposal with the agent label, what prompted it, its change lines
 * and the pages it would change, flagged when a page it rests on changed since or when it cites a
 * project conclusion the user has not verified (each opens through `onOpenConclusion`); the user
 * applies it or declines it with an optional reason. Decided proposals follow under their own heading,
 * each with its outcome. `proposals` is null while they load.
 */
export function ReviewQueue({ proposals, pending, onApply, onDecline, onOpenPage, onOpenConclusion }: {
  proposals: WikiProposal[] | null
  pending: boolean
  onApply: (proposal: WikiProposal) => void
  onDecline: (proposal: WikiProposal, reason: string) => void
  onOpenPage: (id: string) => void
  onOpenConclusion: (project: string, conclusion: string) => void
}) {
  const m = useMessages()
  const r = m.wiki.queue
  const fmt = useFormat()
  const [declining, setDeclining] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const queued = (proposals ?? []).filter((p) => p.status === 'queued')
  const decided = (proposals ?? []).filter((p) => p.status !== 'queued')
  const applicable = (p: WikiProposal): boolean => p.proposal !== null && !p.staleNow && (p.unverified ?? []).length === 0
  // The queue's one primary commit is the apply of the first proposal that can be applied.
  const lead = queued.find(applicable)?.id

  const source = (p: WikiProposal): string => {
    if (p.proposal === null) return fmt.date(dayOf(p.received))
    const { trigger } = p.proposal
    const why = trigger.kind !== 'experiment' ? null : r.trigger(
      p.titles[`projects/${trigger.project}`] ?? trigger.project,
      trigger.node === undefined ? null : p.titles[`projects/${trigger.project}#${trigger.node}`] ?? trigger.node,
    )
    return [why, fmt.date(dayOf(p.received))].filter((part) => part !== null).join(' · ')
  }
  const lines = (p: WikiProposal): DiffLine[] => (p.proposal?.ops ?? []).flatMap((op) => linesOf(op, p, m.wiki)).map(lineOf)

  return (
    <>
      {proposals === null
        ? <LoadingPlaceholder shape="rows" />
        : queued.length === 0
        ? <EmptyState variant="section">{r.empty}</EmptyState>
        : (
          <StructuredList variant="embedded" maxVisibleRows="all" className="review-list">
            {queued.map((p) => (
              <StructuredRow key={p.id} className="review-row" data-proposal={p.id}>
                <div className="review-head">
                  <span className="review-title">{p.proposal ? <PaperText text={p.proposal.title} /> : r.unreadable}</span>
                  {p.staleNow ? <Tag tone="warn">{r.stale}</Tag> : null}
                  {(p.unverified ?? []).length > 0 ? <Tag tone="warn">{r.unverified}</Tag> : null}
                  {p.proposal?.producer.kind === 'ai' ? <AgentLabel /> : null}
                </div>
                <div className="review-meta">{source(p)}</div>
                {p.proposal?.rationale ? <p className="review-note">{p.proposal.rationale}</p> : null}
                {p.notice === null ? null : <p className="review-note review-note--warn"><LinePieces pieces={named(p.notice, p.titles)} /></p>}
                {(p.unverified ?? []).length === 0 ? null : (
                  <div className="wkrel review-unverified">
                    <span className="rl">{r.unverifiedLabel}</span>
                    {p.unverified!.map((ref) => {
                      const [project, conclusion] = ref.slice('projects/'.length).split('#') as [string, string]
                      return (
                        <TagButton shape="chip" className="tagchip" key={ref} onClick={() => onOpenConclusion(project, conclusion)}>
                          {p.titles[ref] ?? conclusion}
                        </TagButton>
                      )
                    })}
                  </div>
                )}
                <DiffLines lines={lines(p)} />
                <div className="wkrel">
                  <span className="rl">{r.pages}</span>
                  {p.pages.map((id) => (
                    <TagButton shape="chip" className="tagchip" data-wk={id} key={id} onClick={() => onOpenPage(id)}>
                      {id.startsWith(PAPER_PAGE) ? <PaperText text={p.titles[id] ?? id} /> : p.titles[id] ?? id}
                    </TagButton>
                  ))}
                </div>
                <div className="review-actions">
                  <button type="button" className={p.id === lead ? 'btn pri' : 'btn'} disabled={pending || !applicable(p)} onClick={() => onApply(p)}>{r.apply}</button>
                  <ActionPopover
                    open={declining === p.id}
                    onOpenChange={(next) => {
                      setDeclining(next ? p.id : null)
                      setReason('')
                    }}
                    contentClassName="ctxmenu review-decline" align="start"
                    trigger={<button type="button" className="btn ghost danger" disabled={pending}>{r.decline}</button>}
                  >
                    <FormInput
                      appearance="field" autoFocus value={reason} placeholder={r.reasonPlaceholder}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <button
                      type="button" className="btn danger" disabled={pending}
                      onClick={() => {
                        setDeclining(null)
                        onDecline(p, reason.trim())
                      }}
                    >{r.declineConfirm}</button>
                  </ActionPopover>
                </div>
              </StructuredRow>
            ))}
          </StructuredList>
        )}

      {decided.length === 0
        ? null
        : (
          <>
            <SectionHeading>{r.history(decided.length)}</SectionHeading>
            <StructuredList variant="embedded" className="review-list">
              {decided.map((p) => (
                <StructuredRow key={p.id} className="review-row" data-proposal={p.id}>
                  <div className="review-head">
                    <span className="review-title">{p.proposal ? <PaperText text={p.proposal.title} /> : r.unreadable}</span>
                    <Tag tone={p.status === 'applied' ? 'good' : 'neutral'}>
                      {p.status === 'applied' ? r.applied
                        : p.reason?.kind === 'declined' ? r.rejected : `${r.rejected} · ${r.reasonKind[p.reason?.kind ?? 'invalid']}`}
                    </Tag>
                    {p.proposal?.producer.kind === 'ai' ? <AgentLabel /> : null}
                  </div>
                  <div className="review-meta">
                    {[source(p), p.decided === null ? null : fmt.date(dayOf(p.decided.at))].filter((part) => part !== null).join(' → ')}
                  </div>
                  {p.reason === null || p.reason.message === '' ? null : (
                    <p className="review-note">
                      {p.reason.kind === 'declined' ? p.reason.message
                        : p.reason.kind === 'stale' ? r.staleReason
                          : <LinePieces pieces={named(p.reason.message, p.titles)} />}
                    </p>
                  )}
                  {p.proposal === null ? null : <DiffLines lines={lines(p)} declined={p.status !== 'applied'} />}
                </StructuredRow>
              ))}
            </StructuredList>
          </>
        )}
    </>
  )
}
