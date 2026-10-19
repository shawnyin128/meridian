import type { EventKind, GraphNode } from '../../../shared/contract.js'
import type { ProjectDecisionItem } from '../../../shared/project-signals.js'
import { useMessages } from '../../messages/useMessages.js'
import { DateChip } from '../DateTimeDisplay.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { FadeText } from '../FadeText.js'
import { AgentLabel } from '../SourceLabel.js'
import { Tag, type TagTone } from '../Tag.js'
import { NodeTag } from './NodeTag.js'
import './ProjectSignals.css'

/** Stable type column shared by project and overview decision rows and research records; `mut` is neutral. */
export function ProjectSignalKind({ tone, children }: {
  tone: ProjectDecisionItem['tone'] | TagTone
  children: string
}) {
  return (
    <span className="project-signal-kind">
      <Tag tone={tone === 'mut' ? 'neutral' : tone}>{children}</Tag>
    </span>
  )
}

/**
 * A project's "needs attention" list: a task or milestone signal locates its item, a signal with a
 * page opens that page, and the others are plain rows.
 */
export function ProjectAttention({ items, onOpenPage, onLocateTask, onLocateMilestone }: {
  items: ProjectDecisionItem[]
  onOpenPage: (page: string) => void
  onLocateTask: (taskId: string) => void
  onLocateMilestone: (milestoneId: string) => void
}) {
  const target = (item: ProjectDecisionItem) => {
    if (item.task !== undefined) return () => onLocateTask(item.task!)
    if (item.milestone !== undefined) return () => onLocateMilestone(item.milestone!)
    return item.page === undefined ? undefined : () => onOpenPage(item.page!)
  }
  return (
    <StructuredList className="attn" variant="embedded">
      {items.map((item) => {
        const open = target(item)
        return (
          <StructuredRow
            className="attnrow project-signal-columns" key={item.id} data-wk={item.page}
            {...(open === undefined ? {} : { onActivate: open })}
          >
            <ProjectSignalKind tone={item.tone}>{item.kind}</ProjectSignalKind>
            <ProjectSignalDate date={item.date} />
            <span className="attn-text">{item.reason}</span>
          </StructuredRow>
        )
      })}
    </StructuredList>
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

/**
 * A compact one-line record, used where a full row would not fit: its text, fading when it does not
 * fit, then the agent label when an agent wrote it. `className` places and sizes the line.
 */
export function EventText({ text, origin, className }: {
  text: string
  origin?: 'agent' | 'user' | undefined
  className?: string
}) {
  return (
    <span className={`event-text${className ? ` ${className}` : ''}`} title={text}>
      <FadeText>{text}</FadeText>
      {origin === 'agent' ? <AgentLabel /> : null}
    </span>
  )
}

/** The tag tone of each research-record kind. */
export const RECORD_TONE: Record<EventKind, TagTone> = {
  start: 'info', reopen: 'warn', result: 'good', decision: 'accent', complete: 'good', note: 'neutral', project: 'neutral',
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
  node?: { id: string; label: string; mode: NonNullable<GraphNode['mode']> } | undefined
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
              label={node.label} mode={node.mode} hint={m.project.records.goToGraph(node.label)} fill
              onOpen={() => onSelectNode(node.id)}
            />
          )}
        </span>
      )}
      <span className="attn-text record-text" title={detail === undefined ? title : `${title} · ${detail}`}>
        <FadeText className="record-line">
          {title}
          {detail === undefined ? null : <span className="record-detail"> · {detail}</span>}
        </FadeText>
      </span>
      <span className="record-who">{origin === 'agent' ? <AgentLabel /> : null}</span>
    </StructuredRow>
  )
}
