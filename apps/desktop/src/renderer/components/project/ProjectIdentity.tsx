import type { ReactNode } from 'react'
import type { ProjectStatus } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { FadeText } from '../FadeText.js'
import { StatusDot } from '../StatusDot.js'
import { Tag } from '../Tag.js'
import { Tooltip } from '../Tooltip.js'
import './ProjectIdentity.css'

const STATUS_TONE = { 进行中: 'good', 搁置: 'warn', 已完成: 'neutral' } as const satisfies Record<ProjectStatus, string>

/** The tag tone of each priority. */
export const PRIORITY_TONE = { p0: 'bad', p1: 'warn', p2: 'neutral' } as const

export type ProjectIdentitySource = {
  name: string
  status: ProjectStatus
  priority: 'p0' | 'p1' | 'p2'
  topic?: string
}

export function ProjectStatusTag({ status }: { status: ProjectStatus }) {
  return <Tag tone={STATUS_TONE[status]}>{status}</Tag>
}

/** The tag of a project's or a task's priority; `className` places it. */
export function ProjectPriorityTag({ priority, className }: {
  priority: ProjectIdentitySource['priority']
  className?: string
}) {
  return <Tag tone={PRIORITY_TONE[priority]} className={className}>{priority.toUpperCase()}</Tag>
}

/** The one project-name label for lists that tag a row with its project; it yields width before its neighbours. */
export function ProjectLabel({ name, className }: { name: string; className?: string }) {
  return (
    <Tooltip label={name} whenClipped>
      <Tag shape="chip" className={`project-label${className ? ` ${className}` : ''}`}>{name}</Tag>
    </Tooltip>
  )
}

/**
 * One project identity contract. Hosts choose density and explicitly enable secondary fields;
 * name/status/priority/topic keep the same order and vocabulary everywhere.
 */
export function ProjectIdentity({
  project, variant = 'header', showStatus = true, showPriority = true, showTopic = false,
}: {
  project: ProjectIdentitySource
  variant?: 'header' | 'row' | 'progress'
  showStatus?: boolean
  showPriority?: boolean
  showTopic?: boolean
}) {
  if (variant === 'progress') {
    return (
      <span className="project-identity progress">
        <span className="project-identity-line">
          <StatusDot
            tone={STATUS_TONE[project.status]} size="md"
            {...(showStatus ? {} : { label: project.status, labelHidden: true })}
          />
          <ProjectLabel name={project.name} />
          {showPriority ? <ProjectPriorityTag priority={project.priority} /> : null}
          {showTopic && project.topic
            ? <span className="project-identity-topic">{project.topic}</span>
            : null}
        </span>
        {showStatus ? <FadeText className="project-identity-sub" label={project.status}>{project.status}</FadeText> : null}
      </span>
    )
  }
  return (
    <span className={`project-identity ${variant}`}>
      <FadeText className="project-identity-name" label={project.name}>{project.name}</FadeText>
      {showStatus ? <ProjectStatusTag status={project.status} /> : null}
      {showPriority ? <ProjectPriorityTag priority={project.priority} /> : null}
      {showTopic && project.topic
        ? <span className="project-identity-topic">{project.topic}</span>
        : null}
    </span>
  )
}

/** Stable field order for editable or read-only project property panels. */
export function ProjectIdentityFields({ project, fields = {} }: {
  project: ProjectIdentitySource
  fields?: Partial<Record<'name' | 'status' | 'priority' | 'topic', ReactNode>>
}) {
  const m = useMessages()
  return (
    <>
      <div className="pk">{m.project.identity.nameLabel}</div>
      {fields.name ?? <div className="pv">{project.name}</div>}
      <div className="pk">{m.project.identity.statusLabel}</div>
      {fields.status ?? <ProjectStatusTag status={project.status} />}
      <div className="pk">{m.project.identity.priorityLabel}</div>
      {fields.priority ?? <ProjectPriorityTag priority={project.priority} />}
      <div className="pk">{m.project.identity.topic}</div>
      {fields.topic ?? <div className="pv">{project.topic ?? '—'}</div>}
    </>
  )
}
