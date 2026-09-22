import { useCallback, useEffect, useState } from 'react'
import type {
  HarnessPaperWikiRejectionFeedback, HarnessPaperWikiRejectionReason, HarnessPendingPaperWikiResult,
  HarnessPlan, HarnessRunReceipt, PaperReading, PaperRow,
} from '../../../shared/contract.js'
import { harness } from '../../ipc.js'
import { useVaultWrite } from '../../hooks/useVaultWrite.js'
import { useMessages } from '../../messages/useMessages.js'
import type { Catalog } from '../../messages/catalog.js'
import { FormTextarea } from '../FormControls.js'
import { HarnessAction } from '../HarnessAction.js'
import { SegmentedControl } from '../SegmentedControl.js'
import { PaperWikiProposalReview } from './PaperWikiProposalReview.js'

type ReviewMode = 'structured' | 'markdown'

const reviewModes = (m: Catalog) => [
  { value: 'structured', label: m.wiki.ingest.modes.structured },
  { value: 'markdown', label: m.wiki.ingest.modes.markdown },
] as const

const rejectReasonOptions = (m: Catalog): ReadonlyArray<{
  value: HarnessPaperWikiRejectionReason
  label: string
}> => [
  { value: 'source-inaccurate', label: m.wiki.ingest.rejectReasons['source-inaccurate'] },
  { value: 'synthesis-unhelpful', label: m.wiki.ingest.rejectReasons['synthesis-unhelpful'] },
  { value: 'missing-important', label: m.wiki.ingest.rejectReasons['missing-important'] },
  { value: 'weak-grounding', label: m.wiki.ingest.rejectReasons['weak-grounding'] },
  { value: 'poor-structure', label: m.wiki.ingest.rejectReasons['poor-structure'] },
  { value: 'other', label: m.wiki.ingest.rejectReasons.other },
]

/** Reader-adjacent entry for explicitly turning a paper plus personal notes into Wiki work. */
export function PaperWikiIngest({ paper, reading }: {
  paper: PaperRow
  reading: PaperReading
}) {
  const m = useMessages()
  const [plan, setPlan] = useState<HarnessPlan | null>(null)
  const [pending, setPending] = useState<HarnessPendingPaperWikiResult>(null)
  const [receipt, setReceipt] = useState<HarnessRunReceipt | null>(null)
  const [running, setRunning] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [draft, setDraft] = useState('')
  const [reviewMode, setReviewMode] = useState<ReviewMode>('markdown')
  const [applying, setApplying] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectionOpen, setRejectionOpen] = useState(false)
  const [rejectionReasons, setRejectionReasons] = useState<HarnessPaperWikiRejectionReason[]>([])
  const [rejectionNote, setRejectionNote] = useState('')
  const [applied, setApplied] = useState(false)
  const [rejected, setRejected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const write = useVaultWrite()
  const readingScope = JSON.stringify({
    highlights: reading.highlights,
    notes: reading.notes,
    remark: reading.remark,
  })

  const prepare = useCallback(() => {
    let live = true
    setPlan(null)
    setPending(null)
    setReceipt(null)
    setDraft('')
    setReviewMode('markdown')
    setRejectionOpen(false)
    setRejectionReasons([])
    setRejectionNote('')
    setApplied(false)
    setRejected(false)
    setError(null)
    void harness.pendingPaperWiki(paper.id).then(async (restored) => {
      if (!live) return
      if (restored !== null) {
        setPending(restored)
        setDraft(restored.proposal.body)
        setReviewMode(restored.proposal.review === undefined ? 'markdown' : 'structured')
        return
      }
      const next = await harness.preparePaperWiki(paper.id)
      if (live) setPlan(next)
    }).catch((cause: Error) => {
      if (live) setError(cause.message)
    })
    return () => { live = false }
  }, [paper.id, readingScope])

  useEffect(prepare, [prepare])

  const start = () => {
    if (plan === null || running) return
    setRunning(true)
    setError(null)
    void harness.start(plan).then((next) => {
      setReceipt(next)
      setPending(null)
      setDraft(next.proposal?.body ?? '')
      setReviewMode(next.proposal?.review === undefined ? 'markdown' : 'structured')
    }).catch((cause: Error) => {
      setError(cause.message)
      setPlan(null)
    }).finally(() => {
      setRunning(false)
      setCancelling(false)
    })
  }

  const cancel = () => {
    if (plan === null || !running || cancelling) return
    setCancelling(true)
    setError(null)
    void harness.cancel(plan.id).catch((cause: Error) => {
      setError(cause.message)
      setCancelling(false)
    })
  }

  const apply = async () => {
    const proposal = receipt?.proposal ?? pending?.proposal
    if (proposal === undefined || applying || draft.trim() === '' || pending?.stale === true) return
    setApplying(true)
    setError(null)
    let warning: string | undefined
    const operation = harness.applyPaperWiki(proposal.id, draft).then((result) => {
      warning = result.warning
      return result
    })
    const saved = await write(operation, {
      note: m.wiki.ingest.writeNote,
    })
    if (saved) {
      setApplied(true)
      if (warning !== undefined) setError(warning)
    }
    setApplying(false)
  }

  const reject = async (feedback?: HarnessPaperWikiRejectionFeedback) => {
    const proposal = receipt?.proposal ?? pending?.proposal
    if (proposal === undefined || applying || rejecting) return
    setRejecting(true)
    setError(null)
    try {
      const result = await harness.rejectPaperWiki(proposal.id, feedback)
      setRejected(true)
      if (result.warning !== undefined) setError(result.warning)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRejecting(false)
    }
  }

  const toggleRejectionReason = (reason: HarnessPaperWikiRejectionReason) => {
    setRejectionReasons((current) => current.includes(reason)
      ? current.filter((candidate) => candidate !== reason)
      : [...current, reason])
  }

  const submitRejection = () => {
    const note = rejectionNote.trim()
    const reasons = rejectionReasons.length > 0
      ? rejectionReasons
      : note === '' ? [] : ['other' as const]
    const feedback: HarnessPaperWikiRejectionFeedback | undefined = reasons.length === 0
      ? undefined
      : { reasons, ...(note === '' ? {} : { note }) }
    void reject(feedback)
  }

  const writtenHighlights = reading.highlights.filter((item) => item.note.trim() !== '').length
  const personal = reading.notes.length + writtenHighlights + (reading.remark.trim() === '' ? 0 : 1)
  const proposal = receipt?.proposal ?? pending?.proposal

  return (
    <section className="wiki-ingest" aria-label={m.wiki.addToWiki}>
      <header><strong>{m.wiki.addToWiki}</strong></header>
      <div className="wiki-ingest-body">
        <p className="wiki-ingest-intro">
          {m.wiki.ingest.intro}
        </p>

        <div className="wiki-ingest-scope">
          <div><span>{m.wiki.scope.source}</span><strong>{m.wiki.scope.currentPaper}</strong></div>
          <div><span>{m.wiki.scope.highlights}</span><strong>{m.wiki.scope.count(writtenHighlights)}</strong></div>
          <div><span>{m.wiki.scope.notes}</span><strong>{m.wiki.scope.count(reading.notes.length)}</strong></div>
          <div>
            <span>{m.wiki.scope.remark}</span>
            <strong>{reading.remark.trim() === '' ? m.wiki.scope.notRecorded : m.wiki.scope.recorded}</strong>
          </div>
        </div>

        {personal === 0 ? (
          <p className="wiki-ingest-tip">{m.wiki.ingest.noPersonalRecords}</p>
        ) : (
          <p className="wiki-ingest-tip">{m.wiki.ingest.personalRecordsIncluded(personal)}</p>
        )}

        {plan === null && pending === null && error === null
          ? <p className="wiki-ingest-status">{m.wiki.ingest.preparing}</p>
          : null}
        {plan !== null && !plan.model.configured ? (
          <p className="wiki-ingest-status bad">{m.wiki.ingest.notConnectedNote}</p>
        ) : null}
        {receipt !== null ? <p className="wiki-ingest-status done">{receipt.message}</p> : null}
        {pending !== null ? (
          <p className="wiki-ingest-status done">
            {m.wiki.ingest.restoredPending}
          </p>
        ) : null}
        {pending?.stale === true ? (
          <p className="wiki-ingest-status bad">
            {m.wiki.ingest.stalePending}
          </p>
        ) : null}
        {receipt?.warning === undefined ? null : (
          <p className="wiki-ingest-status bad">{receipt.warning}</p>
        )}
        {error !== null ? <p className="wiki-ingest-status bad">{error}</p> : null}

        <div className="wiki-ingest-actions">
          {receipt === null && plan !== null
            ? <HarnessAction plan={plan} running={running} onStart={start} onCancel={cancel} />
            : null}
          {cancelling ? <span className="wiki-ingest-status">{m.wiki.ingest.stopping}</span> : null}
          {receipt !== null || error !== null || rejected
            ? <button className="btn" onClick={() => { prepare() }}>{m.wiki.ingest.reprepare}</button>
            : null}
        </div>
        {proposal !== undefined && !applied && !rejected ? (
          <div className="wiki-ingest-review">
            <div className="wiki-ingest-review-head">
              <strong>{m.wiki.ingest.reviewHeading}</strong>
              <span>{proposal.action === 'create' ? m.wiki.ingest.newContent : m.wiki.ingest.updateContent}</span>
            </div>
            {proposal.review === undefined ? null : (
              <SegmentedControl
                className="wiki-ingest-review-mode"
                label={m.wiki.ingest.reviewViewLabel}
                value={reviewMode}
                options={reviewModes(m)}
                onChange={setReviewMode}
              />
            )}
            {proposal.review !== undefined && reviewMode === 'structured' ? (
              <>
                {draft === proposal.body ? null : (
                  <p className="wiki-ingest-edit-note">
                    {m.wiki.ingest.editNote}
                  </p>
                )}
                <PaperWikiProposalReview review={proposal.review}
                  {...(proposal.quality === undefined ? {} : { quality: proposal.quality })} />
              </>
            ) : (
              <FormTextarea appearance="field" aria-label={m.wiki.ingest.proposalContentLabel} value={draft}
                onChange={(event) => setDraft(event.target.value)} />
            )}
            {rejectionOpen ? (
              <div className="wiki-ingest-rejection" aria-label={m.wiki.ingest.rejectionFeedbackLabel}>
                <div className="wiki-ingest-rejection-head">
                  <strong>{m.wiki.ingest.rejectionPrompt}</strong>
                  <span>{m.wiki.ingest.rejectionPrivacyNote}</span>
                </div>
                <div
                  className="wiki-ingest-rejection-reasons segmented-control segmented-control--md"
                  role="group" aria-label={m.wiki.ingest.rejectReasonsLabel}
                >
                  {rejectReasonOptions(m).map((reason) => {
                    const selected = rejectionReasons.includes(reason.value)
                    return (
                      <button key={reason.value} type="button"
                        className={selected ? 'on' : ''} aria-pressed={selected}
                        disabled={rejecting}
                        onClick={() => toggleRejectionReason(reason.value)}>
                        {reason.label}
                      </button>
                    )
                  })}
                </div>
                <FormTextarea appearance="field" rows={2} maxLength={500}
                  aria-label={m.wiki.ingest.rejectionNoteLabel} placeholder={m.wiki.ingest.rejectionNotePlaceholder}
                  disabled={rejecting}
                  value={rejectionNote} onChange={(event) => setRejectionNote(event.target.value)} />
                <div className="wiki-ingest-actions">
                  <button type="button" className="btn" disabled={rejecting}
                    onClick={() => setRejectionOpen(false)}>{m.wiki.ingest.backToReview}</button>
                  <button type="button" className="btn tdel" disabled={rejecting}
                    onClick={submitRejection}>
                    {rejecting
                      ? m.wiki.ingest.discarding
                      : rejectionReasons.length === 0 && rejectionNote.trim() === ''
                        ? m.wiki.ingest.discardNoFeedback
                        : m.wiki.ingest.discardWithFeedback}
                  </button>
                </div>
              </div>
            ) : (
              <div className="wiki-ingest-actions">
                <button className="btn" disabled={applying || rejecting}
                  onClick={() => setRejectionOpen(true)}>
                  {m.wiki.ingest.discardProposal}
                </button>
                <button className="btn pri"
                  disabled={applying || rejecting || draft.trim() === '' || pending?.stale === true}
                  onClick={() => { void apply() }}>
                  {applying ? m.wiki.ingest.writing : m.wiki.ingest.confirm}
                </button>
              </div>
            )}
          </div>
        ) : null}
        {applied ? <p className="wiki-ingest-status done">{m.wiki.ingest.written}</p> : null}
        {rejected ? <p className="wiki-ingest-status">{m.wiki.ingest.discarded}</p> : null}
        <small>{m.wiki.ingest.disclaimer}</small>
      </div>
    </section>
  )
}
