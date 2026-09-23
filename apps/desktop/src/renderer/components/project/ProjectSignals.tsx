import type { EventKind } from '../../../shared/contract.js'
import type { ProjectDecisionItem } from '../../../shared/project-signals.js'
import { useMessages } from '../../messages/useMessages.js'
import { DateChip } from '../DateTimeDisplay.js'
import { StructuredRow } from '../StructuredList.js'
import { NodeTag } from './NodeTag.js'
import './ProjectSignals.css'

/** Stable type column shared by project and overview decision rows and research records. */
export function ProjectSignalKind({ tone, children }: {
  tone: ProjectDecisionItem['tone'] | 'info' | 'good' | 'accent'
  children: string
}) {
  return (
    <span className="project-signal-kind">
      <span className={`ak ${tone}`}>{children}</span>
    </span>
  )
}

/** Stable date column shared by project and overview decision rows. */
export function ProjectSignalDate({ date }: { date: string | undefined }) {
  return (
    <span className="project-signal-date">
      {date === undefined ? null : <DateChip date={date} />}
    </span>
  )
}

/** Inline `agent` tag before a compact one-line record, used where a full row would not fit. */
export function EventText({ text, origin }: { text: string; origin?: 'agent' | 'user' | undefined }) {
  return origin === 'agent' ? <><span className="agtag">agent</span>{text}</> : <>{text}</>
}

/** The chip tone of each research-record kind. */
const RECORD_TONE: Record<EventKind, 'info' | 'warn' | 'good' | 'accent' | 'mut'> = {
  start: 'info', reopen: 'warn', result: 'good', decision: 'accent', complete: 'good', note: 'mut', project: 'mut',
}

/**
 * One research-record row on the same columns as the project's decision rows: the kind chip, the
 * date chip, the node tag column, one line holding the title and the muted detail, and who wrote it.
 * Without `onSelectNode` (the node panel, whose own node would be redundant) the node column is left
 * out; a record without a node leaves its cell empty so titles stay aligned.
 */
export function ProjectEventRow({
  kind, date, title, detail, node, onSelectNode, origin,
}: {
  kind: EventKind
  date: string
  title: string
  detail?: string | undefined
  node?: { id: string; label: string } | undefined
  onSelectNode?: ((nodeId: string) => void) | undefined
  origin: 'agent' | 'user'
}) {
  const m = useMessages()
  return (
    <StructuredRow className={`attnrow project-signal-columns record-row${onSelectNode === undefined ? '' : ' with-node'}`}>
      <ProjectSignalKind tone={RECORD_TONE[kind]}>{m.project.records.kind[kind]}</ProjectSignalKind>
      <ProjectSignalDate date={date} />
      {onSelectNode === undefined ? null : (
        <span className="record-node">
          {node === undefined ? null : (
            <NodeTag
              label={node.label} hint={m.project.records.goToGraph(node.label)} fill
              onOpen={() => onSelectNode(node.id)}
            />
          )}
        </span>
      )}
      <span className="attn-text record-text" title={detail === undefined ? title : `${title} · ${detail}`}>
        <span className="record-line">
          {title}
          {detail === undefined ? null : <span className="record-detail"> · {detail}</span>}
        </span>
      </span>
      <span className="record-who">{m.project.records.who[origin]}</span>
    </StructuredRow>
  )
}
