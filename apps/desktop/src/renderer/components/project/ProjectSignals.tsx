import type { EventKind } from '../../../shared/contract.js'
import type { ProjectDecisionItem } from '../../../shared/project-signals.js'
import { useMessages } from '../../messages/useMessages.js'
import { DateChip } from '../DateTimeDisplay.js'
import { StructuredRow } from '../StructuredList.js'
import './ProjectSignals.css'

/** Stable type column shared by project and overview decision rows. */
export function ProjectSignalKind({ tone, children }: {
  tone: ProjectDecisionItem['tone']
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

/**
 * One structured research-record row: a type chip, an optional node link, a bold one-line title
 * with an optional muted detail line, and who wrote it. `node` is omitted in the node panel, whose
 * own node column would be redundant with the panel it lives in.
 */
export function ProjectEventRow({
  kind, title, detail, node, onSelectNode, origin,
}: {
  kind: EventKind
  title: string
  detail?: string | undefined
  node?: { id: string; label: string } | undefined
  onSelectNode?: ((nodeId: string) => void) | undefined
  origin: 'agent' | 'user'
}) {
  const m = useMessages()
  return (
    <StructuredRow className={`record-row rk-${kind}${node === undefined && onSelectNode === undefined ? ' no-node' : ''}`}>
      <span className={`record-kind rk-chip rk-${kind}`}>{m.project.records.kind[kind]}</span>
      {onSelectNode === undefined ? null : (
        <span className="record-node">
          {node === undefined ? null : (
            <button
              type="button" className="record-node-link" onClick={() => onSelectNode(node.id)}
              title={m.project.records.goToGraph(node.label)}
            >{node.label}</button>
          )}
        </span>
      )}
      <span className="record-title-cell">
        <span className="record-title">{title}</span>
        {detail === undefined ? null : <span className="record-detail">{detail}</span>}
      </span>
      <span className="record-who">{m.project.records.who[origin]}</span>
    </StructuredRow>
  )
}
