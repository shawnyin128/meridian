import { useState } from 'react'
import type { ConflictTarget, Evidence, ProposalOp, WikiProposal } from '../../../shared/contract.js'
import { useFormat } from '../../lib/format.js'
import type { Catalog } from '../../messages/catalog.js'
import { useMessages } from '../../messages/useMessages.js'
import { ActionPopover } from '../ActionPopover.js'
import { DiffLines } from '../DiffLines.js'
import { EmptyState } from '../EmptyState.js'
import { FormInput } from '../FormControls.js'
import { SectionHeading } from '../PageShell.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import './ReviewQueue.css'

/** The button that opens the review queue, with the number of proposals waiting. */
export function ReviewEntry({ count, onOpen }: { count: number; onOpen: () => void }) {
  const m = useMessages()
  return (
    <button type="button" className="btn review-entry" onClick={onOpen}>
      {m.wiki.queue.entry}
      {count > 0 ? <span className="review-entry-count">{count}</span> : null}
    </button>
  )
}

/** Day a proposal arrived or was decided, from epoch ms. */
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/**
 * The change lines of `op` in `p`: everything applying it would write, with claims by their current text
 * and pages, papers, projects, nodes and conclusions by their titles (the id stands for one no longer in
 * the vault). A revision shows the old text and the new one; each evidence item gets a line of its own.
 */
function linesOf(op: ProposalOp, p: WikiProposal, w: Catalog['wiki']): string[] {
  const c = w.queue.change
  const title = (id: string): string => p.titles[id] ?? id
  const text = (ref: string): string => p.claimTexts[ref] ?? ref.split('#')[1]!
  const side = (item: Evidence | ConflictTarget): [string, string] => {
    switch (item.kind) {
      case 'source': return [w.claims.evidence, c.quote(title(item.paper), item.page, item.quote)]
      case 'experiment': {
        const point = item.node ?? item.conclusion
        const name = [title(`projects/${item.project}`), ...(point === undefined ? [] : [title(`projects/${item.project}#${point}`)])]
        return [w.claims.experiment, c.detail(name.join(' · '), item.text ?? '')]
      }
      case 'wiki': return [w.claims.evidence, item.ref.includes('#') ? text(item.ref) : title(item.ref)]
      case 'claim': return [w.claims.conflict, text(item.ref)]
      case 'note': return [w.claims.note, title(item.paper)]
      case 'personal': return [w.claims.personal, item.text]
    }
  }
  const evidence = (items: Evidence[]): string[] => items.map((item) => c.evidenceLine(...side(item)))
  switch (op.op) {
    case 'addClaim': return [c.add(op.claim.text), ...evidence(op.claim.evidence)]
    case 'reviseClaim': {
      const held = p.claimTexts[`${op.page}#${op.claim}`]
      return [...(held === undefined ? [] : [c.before(held)]), c.after(op.text), ...evidence(op.evidence ?? [])]
    }
    case 'addEvidence': return [c.evidence(text(`${op.page}#${op.claim}`)), ...evidence(op.evidence)]
    case 'markConflict': {
      const other = op.conflict.against.kind === 'claim' ? text(op.conflict.against.ref) : side(op.conflict.against)[1]
      return [c.conflict(text(`${op.page}#${op.claim}`), other, op.conflict.note)]
    }
    case 'resolveConflict': return [c.resolve(text(`${op.page}#${op.claim}`), c.outcomes[op.outcome], op.note)]
    case 'retractClaim': return [c.retract(text(`${op.page}#${op.claim}`), op.reason)]
    default: return [c.other]
  }
}

/**
 * The review queue: every queued agent proposal with who made it, what prompted it, its change lines
 * and the pages it would change, flagged when a page it rests on changed since; the user applies it
 * or declines it with an optional reason. Decided proposals follow under their own heading, each with
 * its outcome.
 */
export function ReviewQueue({ proposals, pending, onApply, onDecline, onOpenPage }: {
  proposals: WikiProposal[]
  pending: boolean
  onApply: (proposal: WikiProposal) => void
  onDecline: (proposal: WikiProposal, reason: string) => void
  onOpenPage: (id: string) => void
}) {
  const m = useMessages()
  const r = m.wiki.queue
  const fmt = useFormat()
  const [declining, setDeclining] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const queued = proposals.filter((p) => p.status === 'queued')
  const decided = proposals.filter((p) => p.status !== 'queued')

  const source = (p: WikiProposal): string => {
    if (p.proposal === null) return fmt.date(dayOf(p.received))
    const { producer, trigger } = p.proposal
    const by = producer.kind === 'ai' ? producer.id : m.wiki.claims.me
    const why = trigger.kind !== 'experiment' ? null : r.trigger(
      p.titles[`projects/${trigger.project}`] ?? trigger.project,
      trigger.node === undefined ? null : p.titles[`projects/${trigger.project}#${trigger.node}`] ?? trigger.node,
    )
    return [by, why, fmt.date(dayOf(p.received))].filter((part) => part !== null).join(' · ')
  }
  const lines = (p: WikiProposal): string[] => (p.proposal?.ops ?? []).flatMap((op) => linesOf(op, p, m.wiki))

  return (
    <>
      {queued.length === 0
        ? <EmptyState variant="section">{r.empty}</EmptyState>
        : (
          <StructuredList variant="embedded" maxVisibleRows="all" className="review-list">
            {queued.map((p) => (
              <StructuredRow key={p.id} className="review-row" data-proposal={p.id}>
                <div className="review-head">
                  <span className="review-title">{p.proposal?.title ?? r.unreadable}</span>
                  {p.staleNow ? <span className="stag pend">{r.stale}</span> : null}
                </div>
                <div className="review-meta">{source(p)}</div>
                {p.proposal?.rationale ? <p className="review-note">{p.proposal.rationale}</p> : null}
                {p.staleNow ? <p className="review-note review-note--warn">{r.staleNote}</p> : null}
                {p.notice === null ? null : <p className="review-note review-note--warn">{p.notice}</p>}
                <DiffLines lines={lines(p)} />
                <div className="wkrel">
                  <span className="rl">{r.pages}</span>
                  {p.pages.map((id) => (
                    <span className="tagchip" data-wk={id} key={id} onClick={() => onOpenPage(id)}>{p.titles[id] ?? id}</span>
                  ))}
                </div>
                <div className="review-actions">
                  <button type="button" className="btn pri" disabled={pending || p.proposal === null} onClick={() => onApply(p)}>{r.apply}</button>
                  <ActionPopover
                    open={declining === p.id}
                    onOpenChange={(next) => {
                      setDeclining(next ? p.id : null)
                      setReason('')
                    }}
                    contentClassName="ctxmenu review-decline"
                    trigger={<button type="button" className="btn" disabled={pending}>{r.decline}</button>}
                  >
                    <FormInput
                      appearance="field" autoFocus value={reason} placeholder={r.reasonPlaceholder}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <button
                      type="button" className="btn pri" disabled={pending}
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
                    <span className="review-title">{p.proposal?.title ?? r.unreadable}</span>
                    <span className={`stag ${p.status === 'applied' ? 'ok' : 'mut'}`}>
                      {p.status === 'applied' ? r.applied
                        : p.reason?.kind === 'declined' ? r.rejected : `${r.rejected} · ${r.reasonKind[p.reason?.kind ?? 'invalid']}`}
                    </span>
                  </div>
                  <div className="review-meta">
                    {[source(p), p.decided === null ? null : fmt.date(dayOf(p.decided.at))].filter((part) => part !== null).join(' → ')}
                  </div>
                  {p.reason === null || p.reason.message === '' ? null : <p className="review-note">{p.reason.message}</p>}
                  {p.proposal === null ? null : <DiffLines lines={lines(p)} />}
                </StructuredRow>
              ))}
            </StructuredList>
          </>
        )}
    </>
  )
}
