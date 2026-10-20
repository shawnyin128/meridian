import { useCallback, useEffect, useState } from 'react'
import type {
  CallFailure, HarnessPaperWikiRejectionFeedback, HarnessPaperWikiRejectionReason, HarnessPendingPaperWikiResult,
  HarnessPlan, HarnessRunReceipt, PaperReading, PaperRow,
} from '../../../shared/contract.js'
import { harness } from '../../ipc.js'
import { useVaultWrite } from '../../hooks/useVaultWrite.js'
import { useScrollFade } from '../../hooks/useScrollFade.js'
import { errorLabel, failureLabel } from '../../lib/failure-label.js'
import { useMessages } from '../../messages/useMessages.js'
import type { Catalog } from '../../messages/catalog.js'
import { ChipToggles } from '../ChipToggles.js'
import { FormTextarea } from '../FormControls.js'
import { HarnessAction } from '../HarnessAction.js'
import { SegmentedControl } from '../SegmentedControl.js'
import { Tag } from '../Tag.js'
import { ReaderPanelHeader } from './ReaderPanelHeader.js'
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
  const ingestFade = useScrollFade('y')
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
    }).catch((cause: unknown) => {
      if (live) setError(errorLabel(m, cause))
    })
    return () => { live = false }
  }, [paper.id, readingScope, m])

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
    }).catch((cause: unknown) => {
      setError(errorLabel(m, cause))
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
    void harness.cancel(plan.id).catch((cause: unknown) => {
      setError(errorLabel(m, cause))
      setCancelling(false)
    })
  }

  const apply = async () => {
    const proposal = receipt?.proposal ?? pending?.proposal
    if (proposal === undefined || applying || draft.trim() === '' || pending?.stale === true) return
    setApplying(true)
    setError(null)
    let warning: CallFailure | undefined
    const operation = harness.applyPaperWiki(proposal.id, draft).then((result) => {
      warning = result.warning
      return result
    })
    const saved = await write(operation, {
      note: m.wiki.ingest.writeNote,
    })
    if (saved) {
      setApplied(true)
      if (warning !== undefined) setError(failureLabel(m, m.wiki.ingest.auditFailed, warning))
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
      if (result.warning !== undefined) setError(failureLabel(m, m.wiki.ingest.auditFailed, result.warning))
    } catch (cause) {
      setError(errorLabel(m, cause))
    } finally {
      setRejecting(false)
    }
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
    <section className="wiki-ingest" ref={ingestFade} aria-label={m.wiki.addToWiki}>
      <ReaderPanelHeader title={m.wiki.addToWiki} />
      <div className="wiki-ingest-body">
        <div className="wiki-ingest-scope">
          <div><span>{m.wiki.scope.source}</span><strong>{m.wiki.scope.currentPaper}</strong></div>
          <div><span>{m.wiki.scope.highlights}</span><strong>{m.wiki.scope.count(writtenHighlights)}</strong></div>
          <div><span>{m.wiki.scope.notes}</span><strong>{m.wiki.scope.count(reading.notes.length)}</strong></div>
          <div>
            <span>{m.wiki.scope.remark}</span>
            <strong>{reading.remark.trim() === '' ? m.wiki.scope.notRecorded : m.wiki.scope.recorded}</strong>
          </div>
        </div>

        <Tag>{personal === 0 ? m.wiki.ingest.noPersonalRecords : m.wiki.ingest.personalRecordsIncluded(personal)}</Tag>

        {plan === null && pending === null && error === null
          ? <p className="wiki-ingest-status">{m.wiki.ingest.preparing}</p>
          : null}
        {plan !== null && !plan.model.configured ? <Tag>{m.wiki.ingest.notConnectedNote}</Tag> : null}
        {receipt !== null ? <p className="wiki-ingest-status done">{receipt.message}</p> : null}
        {pending !== null ? <Tag tone="good">{m.wiki.ingest.restoredPending}</Tag> : null}
        {receipt?.warning === undefined ? null : (
          <p className="wiki-ingest-status bad">{failureLabel(m, m.wiki.ingest.auditFailed, receipt.warning)}</p>
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
                {draft === proposal.body ? null : <Tag tone="warn">{m.wiki.ingest.editNote}</Tag>}
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
                </div>
                <ChipToggles
                  className="wiki-ingest-rejection-reasons" label={m.wiki.ingest.rejectReasonsLabel}
                  value={rejectionReasons} options={rejectReasonOptions(m)} disabled={rejecting}
                  onChange={setRejectionReasons}
                />
                <FormTextarea appearance="field" rows={2} maxLength={500}
                  aria-label={m.wiki.ingest.rejectionNoteLabel} placeholder={m.wiki.ingest.rejectionNotePlaceholder}
                  disabled={rejecting}
                  value={rejectionNote} onChange={(event) => setRejectionNote(event.target.value)} />
                <div className="wiki-ingest-actions">
                  <button type="button" className="btn" disabled={rejecting}
                    onClick={() => setRejectionOpen(false)}>{m.wiki.ingest.backToReview}</button>
                  <button type="button" className="btn danger" disabled={rejecting}
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
                {pending?.stale === true ? <Tag tone="warn">{m.wiki.ingest.stalePending}</Tag> : null}
                <button className="btn" disabled={applying || rejecting}
                  onClick={() => setRejectionOpen(true)}>
                  {m.wiki.ingest.discardProposal}
                </button>
                <button className="btn"
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
      </div>
    </section>
  )
}
