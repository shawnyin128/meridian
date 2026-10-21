import { useRef, useState } from 'react'
import type {
  ConclusionState, GraphNode, ProjectConclusion, ProposalOp, WikiAggregationCard,
} from '../../../shared/contract.js'
import { wiki } from '../../ipc.js'
import { claimId } from '../../lib/slug.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import { DraftForm, DraftLine } from '../DraftForm.js'
import { EmptyState } from '../EmptyState.js'
import { FadeText } from '../FadeText.js'
import { ChoicePicker } from '../FieldPickers.js'
import { FormInput } from '../FormControls.js'
import { SectionHeading } from '../PageShell.js'
import { PanelClose } from '../PanelClose.js'
import { AgentLabel } from '../SourceLabel.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { Tag } from '../Tag.js'
import { Tooltip } from '../Tooltip.js'
import { EntityLink } from '../EntityLink.js'
import { ProjectSignalDate, ProjectSignalKind } from './ProjectSignals.js'
import './ProjectConclusions.css'

const STATE_TONE: Record<ConclusionState, 'warn' | 'good' | 'bad'> = {
  pending: 'warn', verified: 'good', conflicting: 'bad',
}

type NodeLook = { label: string; mode: NonNullable<GraphNode['mode']> }

/**
 * One conclusion row on the research-record columns: the state chip, the date, the source node (left
 * empty for a legacy conclusion), the conclusion and where it stands in the Wiki in one line, and the
 * agent label of a node's conclusion, which an agent wrote.
 */
export function ProjectConclusionRow({ conclusion, node, selected, onOpen }: {
  conclusion: ProjectConclusion
  node: NodeLook | undefined
  selected: boolean
  onOpen: () => void
}) {
  const m = useMessages()
  const c = m.project.conclusions
  const written = conclusion.wiki[0]
  const wikiState = written === undefined ? c.notWritten : c.writtenTo(written.title, written.version)
  return (
    <StructuredRow
      className="attnrow project-signal-columns record-row with-node conclusion-row" selected={selected}
      data-conclusion={conclusion.id} onActivate={onOpen}
    >
      <ProjectSignalKind tone={STATE_TONE[conclusion.state]}>{c.state[conclusion.state]}</ProjectSignalKind>
      <ProjectSignalDate date={conclusion.date} />
      <span className="record-node">
        {node === undefined ? null : <EntityLink kind="node" label={node.label} mode={node.mode} fill />}
      </span>
      <span className="attn-text record-text">
        <Tooltip label={`${conclusion.text} · ${wikiState}`} whenClipped>
          <FadeText className="record-line">
            {conclusion.text}<span className="record-detail"> · {wikiState}</span>
          </FadeText>
        </Tooltip>
      </span>
      <span className="record-who">{conclusion.node === undefined ? null : <AgentLabel />}</span>
    </StructuredRow>
  )
}

/**
 * The detail panel of one conclusion: its text, state and actions, then the evidence chain — the
 * node's tasks, the node, the experiment records — and the Wiki claims written from it. A legacy
 * conclusion shows its source instead of the chain. Verify is offered while a node conclusion is
 * pending and unverify once the user verified it; writing to the Wiki needs a verified conclusion. It
 * opens a draft of the claim right under the conclusion, which names the page it lands on and shows the
 * claim and its experiment evidence, and submits that one claim to page `page` through `onWrite`.
 */
export function ProjectConclusionPanel({
  projectId, projectName, conclusion, node, onClose, onVerify, onUnverify, onWrite, onOpenNode, onOpenTask, onOpenPage,
}: {
  projectId: string
  projectName: string
  conclusion: ProjectConclusion
  node: NodeLook | undefined
  onClose: () => void
  /** Verifies the node's conclusion as shown: its node and the fingerprint of what the panel displays. */
  onVerify: (node: string, fingerprint: string) => void
  onUnverify: (node: string) => void
  onWrite: (page: string, title: string, ops: ProposalOp[]) => Promise<boolean>
  onOpenNode: (nodeId: string) => void
  onOpenTask: (taskId: string) => void
  onOpenPage: (page: string) => void
}) {
  const m = useMessages()
  const c = m.project.conclusions
  const fmt = useFormat()
  const [held, setDraft] = useState<{ conclusion: string; page: string; text: string } | null>(null)
  const [pages, setPages] = useState<WikiAggregationCard[]>([])
  const draftAt = useRef<HTMLDivElement>(null)
  // A draft belongs to the conclusion it was opened from and shows only with it.
  const draft = held?.conclusion === conclusion.id ? held : null

  const startWriting = () => {
    if (draft !== null) {
      draftAt.current?.querySelector<HTMLElement>('.form-control')?.focus()
      return
    }
    setDraft({ conclusion: conclusion.id, page: '', text: conclusion.text })
    void wiki.cards().then((cards) => setPages([...cards].sort((a, b) => a.title.localeCompare(b.title))))
  }

  const submit = async (): Promise<void> => {
    const { page, text } = draft!
    const taken = (await wiki.aggregation(page)).claims.map((claim) => claim.id)
    const target = pages.find((card) => card.id === page)!
    const written = await onWrite(page, c.writeProposal(target.title), [{
      op: 'addClaim', page, claim: {
        id: claimId(text.trim(), taken), text: text.trim(),
        evidence: [conclusion.node === undefined
          ? { kind: 'experiment', project: projectId, conclusion: conclusion.id }
          : { kind: 'experiment', project: projectId, node: conclusion.node }],
      },
    }])
    if (written) setDraft(null)
  }

  return (
    <>
      <SectionHeading
        variant="rail" className="node-document-head"
        actions={(
          <>
            {conclusion.node !== undefined && conclusion.fingerprint !== undefined && conclusion.state === 'pending'
              ? <button className="btn sm" onClick={() => onVerify(conclusion.node!, conclusion.fingerprint!)}>{c.verify}</button>
              : null}
            {conclusion.node !== undefined && conclusion.verifiedOn !== undefined
              ? <button className="btn sm" onClick={() => onUnverify(conclusion.node!)}>{c.unverify}</button>
              : null}
            {conclusion.state === 'verified' ? null : <Tag>{c.unverifiedState}</Tag>}
            <button className="btn sm" disabled={conclusion.state !== 'verified'} onClick={startWriting}>{c.write}</button>
            <PanelClose onClose={onClose} />
          </>
        )}
      ><FadeText className="node-document-title" label={c.heading}>{c.heading}</FadeText>
      </SectionHeading>
      <p className="conclusion-detail-text">{conclusion.text}</p>
      <div className="conclusion-detail-meta">
        <ProjectSignalKind tone={STATE_TONE[conclusion.state]}>{c.state[conclusion.state]}</ProjectSignalKind>
        {conclusion.date === undefined ? null : <span className="conclusion-detail-date">{fmt.date(conclusion.date)}</span>}
      </div>
      {draft === null
        ? null
        : (
          <div className="conclusion-draft" ref={draftAt}>
            <DraftForm
              destination={(invalid) => (
                <>
                  <ChoicePicker
                    appearance="field" aria-label={c.page} placeholder={c.pagePick} value={draft.page}
                    aria-invalid={invalid(draft.page === '')} options={pages.map((card) => card.id)}
                    label={(id) => pages.find((card) => card.id === id)?.title ?? id}
                    onPick={(page) => setDraft({ ...draft, page })}
                  />
                  <span>· {m.wiki.claims.heading}</span>
                </>
              )}
              canSave={draft.page !== '' && draft.text.trim() !== ''} onSave={submit} onCancel={() => setDraft(null)}
            >
              {(invalid) => (
                <>
                  <FormInput
                    value={draft.text} aria-label={c.text} aria-invalid={invalid(draft.text.trim() === '')}
                    onChange={(event) => setDraft({ ...draft, text: event.target.value })}
                  />
                  <DraftLine>
                    <span className="conclusion-draft-evidence">
                      <Tag>{m.wiki.claims.experiment}</Tag>
                      <EntityLink kind="project" label={projectName} />
                      <span>{conclusion.node === undefined ? conclusion.text : node?.label ?? conclusion.node}</span>
                    </span>
                  </DraftLine>
                </>
              )}
            </DraftForm>
          </div>
        )}

      {conclusion.node === undefined
        ? (
          <>
            <SectionHeading variant="rail">{c.source}</SectionHeading>
            <p className="conclusion-detail-source">{conclusion.source}</p>
          </>
        )
        : (
          <>
            <SectionHeading variant="rail">{c.tasks(conclusion.tasks.length)}</SectionHeading>
            {conclusion.tasks.length === 0
              ? <EmptyState variant="section">{c.noTasks}</EmptyState>
              : (
                <StructuredList variant="embedded" className="conclusion-chain">
                  {conclusion.tasks.map((task) => (
                    <StructuredRow key={task.id} className="conclusion-chain-row" onActivate={() => onOpenTask(task.id)}>
                      <FadeText>{task.title}</FadeText>
                    </StructuredRow>
                  ))}
                </StructuredList>
              )}
            <SectionHeading variant="rail">{c.node}</SectionHeading>
            {node === undefined
              ? null
              : (
                <div className="conclusion-detail-node">
                  <EntityLink kind="node" label={node.label} mode={node.mode} onOpen={() => onOpenNode(conclusion.node!)} />
                </div>
              )}
            <SectionHeading variant="rail">{c.experiments(conclusion.experiments.length)}</SectionHeading>
            {conclusion.experiments.length === 0
              ? <EmptyState variant="section">{c.noExperiments}</EmptyState>
              : (
                <StructuredList variant="embedded" className="conclusion-chain">
                  {conclusion.experiments.map((experiment) => (
                    <StructuredRow key={experiment.id} className="conclusion-chain-row">
                      <FadeText>{experiment.title}</FadeText>
                      {experiment.title === experiment.id ? null : <span className="conclusion-chain-id">{experiment.id}</span>}
                    </StructuredRow>
                  ))}
                </StructuredList>
              )}
          </>
        )}

      <SectionHeading variant="rail">{c.wiki}</SectionHeading>
      {conclusion.wiki.length === 0
        ? <EmptyState variant="section">{c.notWritten}</EmptyState>
        : (
          <StructuredList variant="embedded" className="conclusion-chain">
            {conclusion.wiki.map((claim) => (
              <StructuredRow
                key={`${claim.page}#${claim.claim}`} className="conclusion-chain-row" data-wk={claim.page}
                onActivate={() => onOpenPage(claim.page)}
              >
                <FadeText>{claim.title}</FadeText>
                <span className="conclusion-chain-id">v{claim.version}</span>
              </StructuredRow>
            ))}
          </StructuredList>
        )}

    </>
  )
}
