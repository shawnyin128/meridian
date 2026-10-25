import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CallFailure, HarnessPaperWikiRejectionFeedback, HarnessPaperWikiRejectionReason, HarnessPendingPaperWikiResult,
  HarnessPlan, HarnessRunReceipt, PaperReading, PaperRow,
} from '../../../shared/contract.js'
import { PAPER_PAGE } from '../../../shared/vocabulary.js'
import { harness } from '../../ipc.js'
import { editField, useDrafts, type Drafts, type EditDraft } from '../../hooks/useDrafts.js'
import { useGenerations } from '../../hooks/useGenerations.js'
import { useModelStatus } from '../../hooks/useModelStatus.js'
import { commitKeys } from '../../lib/keyboard.js'
import { useUndo } from '../../hooks/useUndo.js'
import { useVaultWrite } from '../../hooks/useVaultWrite.js'
import { errorLabel, failureLabel, reasonLabel } from '../../lib/failure-label.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import type { Catalog } from '../../messages/catalog.js'
import { useJump, useVaultRevision } from '../../shell/AppShell.js'
import { ChipToggles } from '../ChipToggles.js'
import { EntityLink } from '../EntityLink.js'
import { FormTextarea } from '../FormControls.js'
import { HarnessAction } from '../HarnessAction.js'
import { InlineMessage } from '../InlineMessage.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { PageHeader, PageTitle, SectionHeading } from '../PageShell.js'
import { ScrollArea } from '../ScrollArea.js'
import { SidePanel } from '../SidePanel.js'
import { ModelStatusTag } from '../ModelStatusTag.js'
import { Property, PropertyList } from '../PropertyList.js'
import { TabbedSection } from '../TabbedSection.js'
import { AgentLabel } from '../SourceLabel.js'
import { Tag, TagButton } from '../Tag.js'
import { PaperText } from '../paper/PaperText.js'
import { ProposalCard, ProposalChange, ProposalDecision } from '../wiki/ProposalChange.js'
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
  /** Bumped to prepare the plan again, as when the model status no longer matches the plan's model. */
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

  // A plan holds the model it was prepared with: once the model status changes to disagree with it,
  // the plan is prepared again.
  const { connected } = useModelStatus()
  const connectedWas = useRef(connected)
  useEffect(() => {
    const changed = connectedWas.current !== connected
    connectedWas.current = connected
    if (changed && connected !== null && plan !== null && plan.model.configured !== connected) setPreparations((n) => n + 1)
  }, [connected, plan])

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
        by={<><AgentLabel />{made === undefined ? null : <span>{fmt.day(made)}</span>}</>}
      >
        {mode === 'structured' && shown.review !== undefined ? (
          <>
            {draft === shown.body ? null : <Tag state="warning">{m.wiki.ingest.editNote}</Tag>}
            <PaperWikiProposalReview review={shown.review} onJump={onJump}
              {...(shown.quality === undefined ? {} : { quality: shown.quality })} />
          </>
        ) : (
          <FormTextarea appearance="field" code aria-label={m.wiki.ingest.proposalContentLabel} {...edit?.fieldProps()} />
        )}
      </ProposalChange>
      {rejection !== undefined ? (
        <div className="wiki-ingest-rejection" aria-label={m.wiki.ingest.rejectionFeedbackLabel}>
          <ChipToggles
            className="wiki-ingest-rejection-reasons" label={m.wiki.ingest.rejectReasonsLabel}
            value={rejectionReasons} options={rejectReasonOptions(m)} disabled={rejecting}
            onChange={(reasons) => setRejection({ reasons, note: rejectionNote })}
          />
          <FormTextarea appearance="field" rows={2} maxLength={500}
            aria-label={m.wiki.ingest.rejectionNoteLabel} placeholder={m.wiki.ingest.rejectionNotePlaceholder}
            disabled={rejecting}
            value={rejectionNote} onChange={(event) => setRejection({ reasons: rejectionReasons, note: event.target.value })}
            onKeyDown={commitKeys({ multiline: true, onSave: submitRejection })} />
          <div className="wiki-ingest-actions">
            <Button size="compact" disabled={rejecting} onClick={() => setRejection(null)}>{m.wiki.ingest.backToReview}</Button>
            <Button size="compact" tone="danger" busy={rejecting} busyLabel={m.wiki.ingest.discarding} onClick={submitRejection}>
              {rejectionReasons.length === 0 && rejectionNote.trim() === ''
                ? m.wiki.ingest.discardNoFeedback
                : m.wiki.ingest.discardWithFeedback}
            </Button>
          </div>
        </div>
      ) : (
        <ProposalDecision>
          <Button
            size="compact" variant="ghost" tone="danger" disabled={applying || rejecting}
            onClick={() => setRejection({ reasons: [], note: '' })}
          >{m.wiki.ingest.discardProposal}</Button>
          <Button
            size="compact" busy={applying} busyLabel={m.wiki.ingest.writing}
            disabled={rejecting || draft.trim() === '' || pending?.stale === true}
            onClick={() => { void apply() }}
          >{m.wiki.ingest.confirm}</Button>
          {pending?.stale === true
            ? (
              <TagButton state="warning" disabled={applying || rejecting} onClick={() => setRejection({ reasons: [], note: '' })}>
                {`${m.wiki.queue.stale} · ${m.wiki.ingest.discard}`}
              </TagButton>
            )
            : null}
        </ProposalDecision>
      )}
    </ProposalCard>
  )

  return (
    <SidePanel surface="edge" label={m.wiki.addToWiki} className="wiki-ingest">
      <PageHeader size="pane"><PageTitle>{m.wiki.addToWiki}</PageTitle></PageHeader>
      <ScrollArea axis="y" fill>
        <div className="wiki-ingest-body">
          <PropertyList className="wiki-ingest-scope">
            <Property label={m.wiki.scope.source}>{m.wiki.scope.currentPaper}</Property>
            <Property label={m.wiki.scope.highlights}>{m.wiki.scope.count(writtenHighlights)}</Property>
            <Property label={m.wiki.scope.notes}>{m.wiki.scope.count(reading.notes.length)}</Property>
            <Property label={m.wiki.scope.remark}>
              {reading.remark.trim() === '' ? m.wiki.scope.notRecorded : m.wiki.scope.recorded}
            </Property>
          </PropertyList>

          <Tag>{personal === 0 ? m.wiki.ingest.noPersonalRecords : m.wiki.ingest.personalRecordsIncluded(personal)}</Tag>

          {plan === null && pending === null && error === null ? <LoadingPlaceholder shape="lines" count={1} /> : null}
          {plan === null ? null : <ModelStatusTag />}
          {receipt !== null ? <InlineMessage tone="done" variant="line" className="wiki-ingest-status">{receipt.message}</InlineMessage> : null}
          {pending !== null ? <Tag>{m.wiki.ingest.restoredPending}</Tag> : null}
          {receipt?.warning === undefined ? null : (
            <InlineMessage tone="error" variant="line" className="wiki-ingest-status">
              {failureLabel(m, m.wiki.ingest.auditFailed, receipt.warning)}
            </InlineMessage>
          )}
          {failed !== null ? <InlineMessage tone="error" variant="line" className="wiki-ingest-status">{failed}</InlineMessage> : null}

          <div className="wiki-ingest-actions">
            {receipt === null && plan !== null && failure === undefined
              ? <HarnessAction plan={plan} running={running} stopping={cancelling} onStart={start} onCancel={cancel} />
              : null}
            {receipt !== null || failed !== null || rejected
              ? <Button size="regular" onClick={reprepare}>{m.wiki.ingest.reprepare}</Button>
              : null}
          </div>
          {proposal !== undefined && !applied && !rejected ? (
            <div className="wiki-ingest-review">
              {proposal.review === undefined
                ? (
                  <>
                    <SectionHeading level="group">{m.wiki.ingest.reviewHeading}</SectionHeading>
                    {reviewCard(proposal, 'markdown')}
                  </>
                )
                : (
                  <TabbedSection
                    level="group" heading={m.wiki.ingest.reviewHeading} label={m.wiki.ingest.reviewViewLabel}
                    value={reviewMode} onChange={setReviewMode}
                    tabs={reviewModes(m).map((mode) => ({ ...mode, content: reviewCard(proposal, mode.value) }))}
                  />
                )}
            </div>
          ) : null}
          {applied ? <InlineMessage tone="done" variant="line" className="wiki-ingest-status">{m.wiki.ingest.written}</InlineMessage> : null}
          {rejected ? <InlineMessage tone="info" variant="line" className="wiki-ingest-status">{m.wiki.ingest.discarded}</InlineMessage> : null}
        </div>
      </ScrollArea>
    </SidePanel>
  )
}
