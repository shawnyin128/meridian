import type { ReactNode } from 'react'
import type { EventKind, GraphNode } from '../../../shared/contract.js'
import type { ProjectDecisionItem } from '../../../shared/project-signals.js'
import { useMessages } from '../../messages/useMessages.js'
import { DateChip } from '../DateTimeDisplay.js'
import { Item } from '../Item.js'
import { List } from '../List.js'
import { FadeText } from '../FadeText.js'
import { AgentLabel } from '../SourceLabel.js'
import { Tag, type TagTone } from '../Tag.js'
import { EntityLink } from '../EntityLink.js'
import { Tooltip } from '../Tooltip.js'
import './ProjectSignals.css'

/** Stable type column shared by project and overview decision rows and research records. */
export function ProjectSignalKind({ tone, children }: {
  tone: TagTone
  children: string
}) {
  return (
    <span className="project-signal-kind">
      <Tag tone={tone}>{children}</Tag>
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
    <List className="attn" variant="embedded">
      {items.map((item) => {
        const open = target(item)
        return (
          <Item
            className="attnrow project-signal-columns" key={item.id} data-wk={item.page}
            {...(open === undefined ? {} : { onActivate: open })}
          >
            <ProjectSignalKind tone={item.tone}>{item.kind}</ProjectSignalKind>
            <ProjectSignalDate date={item.date} />
            <FadeText className="attn-text">{item.reason}</FadeText>
          </Item>
        )
      })}
    </List>
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
    <span className={`event-text${className ? ` ${className}` : ''}`}>
      <Tooltip label={text} whenClipped><FadeText>{text}</FadeText></Tooltip>
      {origin === 'agent' ? <AgentLabel /> : null}
    </span>
  )
}

/** The tag tone of each research-record kind. */
export const RECORD_TONE: Record<EventKind, TagTone> = {
  start: 'info', reopen: 'neutral', result: 'good', decision: 'accent', complete: 'good', note: 'neutral', project: 'neutral',
}

/**
 * A list of research records whose rows share one set of columns, the first two those of the
 * project's decision rows. `withNode` gives it the node column, for rows given `onSelectNode`.
 */
export function ProjectEventList({ withNode = false, className, children }: {
  withNode?: boolean
  className: string
  children: ReactNode
}) {
  return (
    <List
      className={`project-signal-columns record-list${withNode ? ' with-node' : ''} ${className}`} variant="embedded"
    >{children}
    </List>
  )
}

/**
 * One research-record row of a `ProjectEventList`: the kind chip, the date chip, the title with its
 * detail after it in smaller muted type, opening in place when it does not fit, the node tag and who
 * wrote it. Without `onSelectNode` (the node panel, whose own node would be redundant) the node
 * column is left out; a record without a node leaves its cell empty.
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
    <Item className="attnrow record-row">
      <ProjectSignalKind tone={RECORD_TONE[kind]}>{m.project.records.kind[kind]}</ProjectSignalKind>
      <ProjectSignalDate date={date} />
      <span className="attn-text record-text">
        <FadeText className="record-line" expand>
          {title}
          {detail === undefined ? null : <span className="record-detail"> · {detail}</span>}
        </FadeText>
      </span>
      {onSelectNode === undefined ? null : (
        <span className="record-node">
          {node === undefined ? null : (
            <EntityLink kind="node" label={node.label} mode={node.mode} fill onOpen={() => onSelectNode(node.id)} />
          )}
        </span>
      )}
      <span className="record-who">{origin === 'agent' ? <AgentLabel /> : null}</span>
    </Item>
  )
}
