import { useEffect, useState } from 'react'
import type {
  ConclusionState, GraphNode, ProjectConclusion, ProposalOp, WikiAggregationCard,
} from '../../../shared/contract.js'
import { wiki } from '../../ipc.js'
import { claimId } from '../../lib/slug.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import { EmptyState } from '../EmptyState.js'
import { FadeText } from '../FadeText.js'
import { FormSelect, FormTextarea } from '../FormControls.js'
import { SectionHeading } from '../PageShell.js'
import { PanelClose } from '../PanelClose.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { WikiFormDialog, WikiFormField } from '../wiki/WikiFormDialog.js'
import { NodeTag } from './NodeTag.js'
import { ProjectSignalDate, ProjectSignalKind } from './ProjectSignals.js'
import './ProjectConclusions.css'

const STATE_TONE: Record<ConclusionState, 'warn' | 'good' | 'bad'> = {
  pending: 'warn', verified: 'good', conflicting: 'bad',
}

type NodeLook = { label: string; mode: NonNullable<GraphNode['mode']> }

/**
 * One conclusion row on the research-record columns: the state chip, the date, the source node (left
 * empty for a legacy conclusion), the conclusion in one line, and where it stands in the Wiki.
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
  return (
    <StructuredRow
      className={`attnrow project-signal-columns record-row with-node conclusion-row${selected ? ' selected' : ''}`}
      data-conclusion={conclusion.id} onActivate={onOpen}
    >
      <ProjectSignalKind tone={STATE_TONE[conclusion.state]}>{c.state[conclusion.state]}</ProjectSignalKind>
      <ProjectSignalDate date={conclusion.date} />
      <span className="record-node">
        {node === undefined ? null : <NodeTag label={node.label} mode={node.mode} fill />}
      </span>
      <span className="attn-text record-text" title={conclusion.text}>
        <FadeText className="record-line">{conclusion.text}</FadeText>
      </span>
      <span className="record-who conclusion-wiki" title={written === undefined ? undefined : written.title}>
        {written === undefined ? c.notWritten : c.writtenTo(written.title, written.version)}
      </span>
    </StructuredRow>
  )
}

/**
 * The detail panel of one conclusion: its text, state and actions, then the evidence chain — the
 * node's tasks, the node, the experiment records — and the Wiki claims written from it. A legacy
 * conclusion shows its source instead of the chain. Verify is offered while a node conclusion is
 * pending; writing to the Wiki needs a verified conclusion and submits one claim through `onWrite`.
 */
export function ProjectConclusionPanel({
  projectId, conclusion, node, onClose, onVerify, onWrite, onOpenNode, onOpenTask, onOpenPage,
}: {
  projectId: string
  conclusion: ProjectConclusion
  node: NodeLook | undefined
  onClose: () => void
  onVerify: () => void
  onWrite: (title: string, ops: ProposalOp[]) => Promise<boolean>
  onOpenNode: (nodeId: string) => void
  onOpenTask: (taskId: string) => void
  onOpenPage: (page: string) => void
}) {
  const m = useMessages()
  const c = m.project.conclusions
  const fmt = useFormat()
  const [writing, setWriting] = useState(false)
  const [pages, setPages] = useState<WikiAggregationCard[]>([])
  const [page, setPage] = useState('')
  const [text, setText] = useState('')

  useEffect(() => {
    if (!writing) return
    setPage('')
    setText(conclusion.text)
    void wiki.cards().then((cards) => setPages([...cards].sort((a, b) => a.title.localeCompare(b.title))))
  }, [writing, conclusion.text])

  const submit = async (): Promise<boolean> => {
    const taken = (await wiki.aggregation(page)).claims.map((claim) => claim.id)
    const target = pages.find((card) => card.id === page)!
    return onWrite(c.writeProposal(target.title), [{
      op: 'addClaim', page, claim: {
        id: claimId(text.trim(), taken), text: text.trim(),
        evidence: [conclusion.node === undefined
          ? { kind: 'experiment', project: projectId, conclusion: conclusion.id }
          : { kind: 'experiment', project: projectId, node: conclusion.node }],
      },
    }])
  }

  return (
    <>
      <SectionHeading
        variant="rail" className="node-document-head"
        actions={<PanelClose onClose={onClose} />}
      ><span className="node-document-title">{c.heading}</span>
      </SectionHeading>
      <p className="conclusion-detail-text">{conclusion.text}</p>
      <div className="conclusion-detail-meta">
        <span className={`ak ${STATE_TONE[conclusion.state]}`}>{c.state[conclusion.state]}</span>
        {conclusion.date === undefined ? null : <span className="conclusion-detail-date">{fmt.date(conclusion.date)}</span>}
        <span className="conclusion-detail-actions">
          {conclusion.node !== undefined && conclusion.state === 'pending'
            ? <button className="btn pri" onClick={onVerify}>{c.verify}</button>
            : null}
          <button
            className="btn" disabled={conclusion.state !== 'verified'}
            title={conclusion.state === 'verified' ? undefined : c.verifyFirst}
            onClick={() => setWriting(true)}
          >{c.write}</button>
        </span>
      </div>

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
                  <NodeTag
                    label={node.label} mode={node.mode} hint={m.project.records.goToGraph(node.label)}
                    onOpen={() => onOpenNode(conclusion.node!)}
                  />
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

      <WikiFormDialog
        open={writing} title={c.write} canSubmit={page !== '' && text.trim() !== ''}
        onOpenChange={setWriting} onSubmit={submit}
      >
        <WikiFormField label={c.page}>
          <FormSelect appearance="field" value={page} onChange={(event) => setPage(event.target.value)}>
            <option value="" disabled>{c.pagePick}</option>
            {pages.map((card) => <option key={card.id} value={card.id}>{card.title}</option>)}
          </FormSelect>
        </WikiFormField>
        <WikiFormField label={c.text}>
          <FormTextarea appearance="field" value={text} onChange={(event) => setText(event.target.value)} />
        </WikiFormField>
      </WikiFormDialog>
    </>
  )
}
