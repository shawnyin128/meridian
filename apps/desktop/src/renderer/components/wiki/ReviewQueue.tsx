import { useState } from 'react'
import type { WikiProposal } from '../../../shared/contract.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import { ActionPopover } from '../ActionPopover.js'
import { CollapsibleGroup } from '../CollapsibleGroup.js'
import { DiffLines } from '../DiffLines.js'
import { EmptyState } from '../EmptyState.js'
import { FormInput } from '../FormControls.js'
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
 * The review queue: every queued agent proposal with who made it, what prompted it, its op lines and
 * the pages it would change, flagged when a page it rests on changed since; the user applies it or
 * declines it with an optional reason. Decided proposals are listed below, folded away, each with
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
  const [historyOpen, setHistoryOpen] = useState(false)
  const queued = proposals.filter((p) => p.status === 'queued')
  const decided = proposals.filter((p) => p.status !== 'queued')

  const source = (p: WikiProposal): string => {
    if (p.proposal === null) return fmt.date(dayOf(p.received))
    const { producer, trigger } = p.proposal
    const by = producer.kind === 'ai' ? producer.id : m.wiki.claims.me
    const why = trigger.kind === 'experiment' ? r.trigger(trigger.project, trigger.node ?? null) : null
    return [by, why, fmt.date(dayOf(p.received))].filter((part) => part !== null).join(' · ')
  }

  return (
    <>
      {queued.length === 0
        ? <EmptyState variant="section">{r.empty}</EmptyState>
        : (
          <StructuredList variant="embedded" maxVisibleRows="all" className="review-list">
            {queued.map((p) => (
              <StructuredRow key={p.id} className="review-row" data-proposal={p.id}>
                <div className="review-head">
                  <span className="review-title">{p.proposal?.title}</span>
                  {p.staleNow ? <span className="review-tag review-tag--stale">{r.stale}</span> : null}
                </div>
                <div className="review-meta">{source(p)}</div>
                {p.proposal?.rationale ? <p className="review-note">{p.proposal.rationale}</p> : null}
                {p.staleNow ? <p className="review-note review-note--warn">{r.staleNote}</p> : null}
                {p.notice === null ? null : <p className="review-note review-note--warn">{p.notice}</p>}
                <DiffLines lines={p.ops} />
                <div className="review-pages">
                  <span className="review-label">{r.pages}</span>
                  {p.pages.map((id) => (
                    <button type="button" key={id} className="tagchip review-page" data-wk={id} onClick={() => onOpenPage(id)}>{id}</button>
                  ))}
                </div>
                <div className="review-actions">
                  <button type="button" className="btn pri" disabled={pending} onClick={() => onApply(p)}>{r.apply}</button>
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
          <CollapsibleGroup title={r.history} count={decided.length} open={historyOpen} onToggle={() => setHistoryOpen(!historyOpen)}>
            <StructuredList variant="embedded" maxVisibleRows="all" className="review-list">
              {decided.map((p) => (
                <StructuredRow key={p.id} className="review-row review-row--decided" data-proposal={p.id}>
                  <div className="review-head">
                    <span className="review-title">{p.proposal?.title ?? r.unreadable}</span>
                    <span className={`review-tag${p.status === 'applied' ? ' review-tag--applied' : ''}`}>
                      {p.status === 'applied' ? r.applied
                        : p.reason?.kind === 'declined' ? r.rejected : `${r.rejected} · ${r.reasonKind[p.reason?.kind ?? 'invalid']}`}
                    </span>
                  </div>
                  <div className="review-meta">
                    {[source(p), p.decided === null ? null : fmt.date(dayOf(p.decided.at))].filter((part) => part !== null).join(' → ')}
                  </div>
                  {p.reason === null || p.reason.message === '' ? null : <p className="review-note">{p.reason.message}</p>}
                  {p.ops.length === 0 ? null : <DiffLines lines={p.ops} />}
                </StructuredRow>
              ))}
            </StructuredList>
          </CollapsibleGroup>
        )}
    </>
  )
}
