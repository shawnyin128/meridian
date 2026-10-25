import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CallFailure, HarnessPaperWikiRejectionFeedback, HarnessPaperWikiRejectionReason, HarnessPendingPaperWikiResult,
  HarnessPlan, HarnessRunReceipt, PaperReading, PaperRow,
} from '../../../shared/contract.js'
import { localDayOf } from '../../../shared/dates.js'
import { PAPER_PAGE } from '../../../shared/vocabulary.js'
import { harness } from '../../ipc.js'
import { editField, useDrafts, type Drafts, type EditDraft } from '../../hooks/useDrafts.js'
import { useGenerations } from '../../hooks/useGenerations.js'
import { useUndo } from '../../hooks/useUndo.js'
import { useVaultWrite } from '../../hooks/useVaultWrite.js'
import { useScrollFade } from '../../hooks/useScrollFade.js'
import { errorLabel, failureLabel, reasonLabel } from '../../lib/failure-label.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import type { Catalog } from '../../messages/catalog.js'
import { useJump, useSettingsOpen, useVaultRevision } from '../../shell/AppShell.js'
import { ChipToggles } from '../ChipToggles.js'
import { EntityLink } from '../EntityLink.js'
import { FormTextarea } from '../FormControls.js'
import { HarnessAction } from '../HarnessAction.js'
import { SectionHeading } from '../PageShell.js'
import { NoModelTag } from '../NoModelTag.js'
import { TabbedSection } from '../TabbedSection.js'
import { AgentLabel } from '../SourceLabel.js'
import { Tag, TagButton } from '../Tag.js'
import { PaperText } from '../paper/PaperText.js'
import { ProposalCard, ProposalChange, ProposalDecision } from '../wiki/ProposalChange.js'
import { ReaderPanelHeader } from './ReaderPanelHeader.js'
import { PaperWikiProposalReview } from './PaperWikiProposalReview.js'
import { Button } from '../Button.js'

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

/**
 * Reader-adjacent entry for explicitly turning a paper plus personal notes into Wiki work. A proposal
 * shows as a proposal card: where it goes, the agent and the day it was made, what it writes, and its
 * decision; a page it rests on opens the reader there through `onJump`. A run shows as running for as
 * long as Core reports it, whichever panel started it, and the proposal's edited Markdown is kept in
 * `edits`, so both outlast the panel.
 */
export function PaperWikiIngest({ paper, reading, onJump, edits }: {
  paper: PaperRow
  reading: PaperReading
  onJump: (page: number) => void
  edits: Drafts<EditDraft>
}) {
  const m = useMessages()
  const fmt = useFormat()
  const { open } = useJump()
  const ingestFade = useScrollFade('y')
  const [plan, setPlan] = useState<HarnessPlan | null>(null)
  const [pending, setPending] = useState<HarnessPendingPaperWikiResult>(null)
  const [receipt, setReceipt] = useState<HarnessRunReceipt | null>(null)
  const generations = useGenerations()
  const running = generations.wikiRunning(paper.id)
  const failure = generations.wikiFailure(paper.id)
  const [cancelling, setCancelling] = useState(false)
  const [reviewMode, setReviewMode] = useState<ReviewMode>('markdown')
  const [applying, setApplying] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  // The discard feedback being written is kept per proposal until the proposal is applied or discarded.
  const rejections = useDrafts<{ reasons: HarnessPaperWikiRejectionReason[]; note: string }>(['paper', paper.id, 'wiki-rejection'])
  const [applied, setApplied] = useState(false)
  const [rejected, setRejected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Bumped to prepare the plan again, as when Settings closes on a plan prepared without a model. */
  const [preparations, setPreparations] = useState(0)
  const write = useVaultWrite()
  const undo = useUndo()
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
    setCancelling(false)
    setReviewMode('markdown')
    setApplied(false)
    setRejected(false)
    setError(null)
    void harness.pendingPaperWiki(paper.id).then(async (restored) => {
      if (!live) return
      if (restored !== null) {
        setPending(restored)
        setReviewMode(restored.proposal.review === undefined ? 'markdown' : 'structured')
        return
      }
      const next = await harness.preparePaperWiki(paper.id)
      if (live) setPlan(next)
    }).catch((cause: unknown) => {
      if (live) setError(errorLabel(m, cause))
    })
    return () => { live = false }
  }, [paper.id, readingScope, m, preparations])

  useEffect(prepare, [prepare])

  // Settings is where a model is set up: once it closes, a plan prepared without a model is prepared again.
  const { open: settingsOpen } = useSettingsOpen()
  const settingsWereOpen = useRef(settingsOpen)
  useEffect(() => {
    const closed = settingsWereOpen.current && !settingsOpen
    settingsWereOpen.current = settingsOpen
    if (closed && plan !== null && !plan.model.configured) setPreparations((n) => n + 1)
  }, [settingsOpen, plan])

  // A run this panel did not start, such as one going when it opened, settles without a receipt here:
  // once Core stops reporting it, the proposal it made is restored as a pending one.
  const started = useRef(false)
  const watching = useRef(false)
  useEffect(() => {
    if (running && !started.current) watching.current = true
    else if (!running && watching.current) {
      watching.current = false
      setPreparations((n) => n + 1)
    }
  }, [running])

  // Once written, the panel follows the vault: after any later vault write, such as an undo of this
  // one from its notice or from Recent changes, it prepares again and shows what the vault now holds.
  const { revision } = useVaultRevision()
  const written = useRef<number | null>(null)
  useEffect(() => {
    if (!applied) written.current = null
    else if (written.current === null) written.current = revision
    else if (written.current !== revision) setPreparations((n) => n + 1)
  }, [applied, revision])

  const start = () => {
    if (plan === null || running) return
    setError(null)
    started.current = true
    void generations.run(harness.start(plan).then((next) => {
      setReceipt(next)
      setPending(null)
      setReviewMode(next.proposal?.review === undefined ? 'markdown' : 'structured')
    }).catch((cause: unknown) => {
      setError(errorLabel(m, cause))
      setPlan(null)
    }).finally(() => {
      started.current = false
      setCancelling(false)
    }))
  }

  const cancel = () => {
    if (!running || cancelling) return
    setCancelling(true)
    setError(null)
    void generations.stopWiki(paper.id).catch((cause: unknown) => {
      setError(errorLabel(m, cause))
      setCancelling(false)
    })
  }

  const proposal = receipt?.proposal ?? pending?.proposal
  const edit = proposal === undefined ? undefined : editField(edits, `wiki:${proposal.id}`, proposal.body)
  const draft = edit?.text ?? ''
  const rejection = proposal === undefined ? undefined : rejections.get(proposal.id)
  const rejectionReasons = rejection?.reasons ?? []
  const rejectionNote = rejection?.note ?? ''
  const setRejection = (next: { reasons: HarnessPaperWikiRejectionReason[]; note: string } | null) => {
    if (proposal === undefined) return
    if (next === null) rejections.drop(proposal.id)
    else rejections.set(proposal.id, next)
  }

  const apply = async () => {
    if (proposal === undefined || applying || draft.trim() === '' || pending?.stale === true) return
    setApplying(true)
    setError(null)
    let warning: CallFailure | undefined
    const operation = harness.applyPaperWiki(proposal.id, draft).then((result) => {
      warning = result.warning
      return result
    })
    const saved = await write(operation, { note: m.wiki.ingest.writeNote, action: undo.change })
    // The edits stay in the drafts: an undo of this write brings the proposal back as it was reviewed.
    if (saved) {
      rejections.drop(proposal.id)
      setApplied(true)
      if (warning !== undefined) setError(failureLabel(m, m.wiki.ingest.auditFailed, warning))
    }
    setApplying(false)
  }

  const reject = async (feedback?: HarnessPaperWikiRejectionFeedback) => {
    if (proposal === undefined || applying || rejecting) return
    setRejecting(true)
    setError(null)
    try {
      const result = await harness.rejectPaperWiki(proposal.id, feedback)
      edit?.drop()
      rejections.drop(proposal.id)
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

  // Why the paper's last run failed stays in Core until a new start or this dismiss, so a panel opened
  // after the run shows it too.
  const failed = error ?? (failure === undefined ? null : reasonLabel(m, failure))
  const reprepare = () => {
    if (failure !== undefined) void generations.dismissWiki(paper.id)
    prepare()
  }

  const writtenHighlights = reading.highlights.filter((item) => item.note.trim() !== '').length
  const personal = reading.notes.length + writtenHighlights + (reading.remark.trim() === '' ? 0 : 1)
  const made = receipt?.startedAt ?? pending?.generatedAt
  /** The card of proposal `shown` with its content in view `mode`, and its decision under it. */
  const reviewCard = (shown: NonNullable<typeof proposal>, mode: ReviewMode) => (
    <ProposalCard>
      <ProposalChange
        kind={shown.action === 'create' ? m.wiki.ingest.newContent : m.wiki.ingest.updateContent}
        target={(
          <EntityLink
            kind="page" label={<PaperText text={paper.title} />}
            onOpen={() => open('wiki', `${PAPER_PAGE}${shown.targetId}`)}
          />
        )}
        by={<><AgentLabel />{made === undefined ? null : <span>{fmt.date(localDayOf(made))}</span>}</>}
      >
        {mode === 'structured' && shown.review !== undefined ? (
          <>
            {draft === shown.body ? null : <Tag tone="warn">{m.wiki.ingest.editNote}</Tag>}
            <PaperWikiProposalReview review={shown.review} onJump={onJump}
              {...(shown.quality === undefined ? {} : { quality: shown.quality })} />
          </>
        ) : (
          <FormTextarea appearance="field" aria-label={m.wiki.ingest.proposalContentLabel} {...edit?.fieldProps} />
        )}
      </ProposalChange>
      {rejection !== undefined ? (
        <div className="wiki-ingest-rejection" aria-label={m.wiki.ingest.rejectionFeedbackLabel}>
          <div className="wiki-ingest-rejection-head">
            <strong>{m.wiki.ingest.rejectionPrompt}</strong>
          </div>
          <ChipToggles
            className="wiki-ingest-rejection-reasons" label={m.wiki.ingest.rejectReasonsLabel}
            value={rejectionReasons} options={rejectReasonOptions(m)} disabled={rejecting}
            onChange={(reasons) => setRejection({ reasons, note: rejectionNote })}
          />
          <FormTextarea appearance="field" rows={2} maxLength={500}
            aria-label={m.wiki.ingest.rejectionNoteLabel} placeholder={m.wiki.ingest.rejectionNotePlaceholder}
            disabled={rejecting}
            value={rejectionNote} onChange={(event) => setRejection({ reasons: rejectionReasons, note: event.target.value })} />
          <div className="wiki-ingest-actions">
            <Button size="regular" disabled={rejecting} onClick={() => setRejection(null)}>{m.wiki.ingest.backToReview}</Button>
            <Button size="regular" tone="danger" busy={rejecting} busyLabel={m.wiki.ingest.discarding} onClick={submitRejection}>
              {rejectionReasons.length === 0 && rejectionNote.trim() === ''
                ? m.wiki.ingest.discardNoFeedback
                : m.wiki.ingest.discardWithFeedback}
            </Button>
          </div>
        </div>
      ) : (
        <ProposalDecision>
          <Button
            size="regular" variant="ghost" tone="danger" disabled={applying || rejecting}
            onClick={() => setRejection({ reasons: [], note: '' })}
          >{m.wiki.ingest.discardProposal}</Button>
          <Button
            size="regular" busy={applying} busyLabel={m.wiki.ingest.writing}
            disabled={rejecting || draft.trim() === '' || pending?.stale === true}
            onClick={() => { void apply() }}
          >{m.wiki.ingest.confirm}</Button>
          {pending?.stale === true
            ? (
              <TagButton tone="warn" disabled={applying || rejecting} onClick={() => setRejection({ reasons: [], note: '' })}>
                {`${m.wiki.queue.stale} · ${m.wiki.ingest.discard}`}
              </TagButton>
            )
            : null}
        </ProposalDecision>
      )}
    </ProposalCard>
  )

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
        {plan !== null && !plan.model.configured ? <NoModelTag label={m.wiki.ingest.notConnectedNote} /> : null}
        {receipt !== null ? <p className="wiki-ingest-status done">{receipt.message}</p> : null}
        {pending !== null ? <Tag tone="good">{m.wiki.ingest.restoredPending}</Tag> : null}
        {receipt?.warning === undefined ? null : (
          <p className="wiki-ingest-status bad">{failureLabel(m, m.wiki.ingest.auditFailed, receipt.warning)}</p>
        )}
        {failed !== null ? <p className="wiki-ingest-status bad">{failed}</p> : null}

        <div className="wiki-ingest-actions">
          {receipt === null && plan !== null && failure === undefined
            ? <HarnessAction plan={plan} running={running} onStart={start} onCancel={cancel} />
            : null}
          {cancelling ? <span className="wiki-ingest-status">{m.wiki.ingest.stopping}</span> : null}
          {receipt !== null || failed !== null || rejected
            ? <Button size="regular" onClick={reprepare}>{m.wiki.ingest.reprepare}</Button>
            : null}
        </div>
        {proposal !== undefined && !applied && !rejected ? (
          <div className="wiki-ingest-review">
            {proposal.review === undefined
              ? (
                <>
                  <SectionHeading variant="rail">{m.wiki.ingest.reviewHeading}</SectionHeading>
                  {reviewCard(proposal, 'markdown')}
                </>
              )
              : (
                <TabbedSection
                  variant="rail" heading={m.wiki.ingest.reviewHeading} label={m.wiki.ingest.reviewViewLabel}
                  value={reviewMode} onChange={setReviewMode}
                  tabs={reviewModes(m).map((mode) => ({ ...mode, content: reviewCard(proposal, mode.value) }))}
                />
              )}
          </div>
        ) : null}
        {applied ? <p className="wiki-ingest-status done">{m.wiki.ingest.written}</p> : null}
        {rejected ? <p className="wiki-ingest-status">{m.wiki.ingest.discarded}</p> : null}
      </div>
    </section>
  )
}
