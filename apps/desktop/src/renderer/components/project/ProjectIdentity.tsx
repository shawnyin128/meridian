import type { ReactNode } from 'react'
import type { ProjectStatus } from '../../../shared/contract.js'
import { projectAreas } from '../../../shared/project-signals.js'
import type { Catalog } from '../../messages/catalog.js'
import { useMessages } from '../../messages/useMessages.js'
import { FadeText } from '../FadeText.js'
import { StatusDot } from '../StatusDot.js'
import { Tag } from '../Tag.js'
import { Tooltip } from '../Tooltip.js'
import './ProjectIdentity.css'

/** The dot tone of each project status; the status tag itself is neutral, since no status needs attention. */
const STATUS_TONE = { 进行中: 'good', 搁置: 'warn', 已完成: 'neutral' } as const satisfies Record<ProjectStatus, string>

/** The tag tone of each priority. */
export const PRIORITY_TONE = { p0: 'bad', p1: 'warn', p2: 'neutral' } as const

export type ProjectIdentitySource = {
  name: string
  status: ProjectStatus
  priority: 'p0' | 'p1' | 'p2'
  topic?: string
  topics?: readonly string[] | undefined
}

/** What a project's areas show as one text: every area in order, or no area when it has none. */
function areasName(m: Catalog, project: { topic: string; topics?: readonly string[] | undefined }): string {
  const areas = projectAreas(project)
  return areas.length === 0 ? m.project.identity.noArea : areas.join(m.project.identity.areaSeparator)
}

export function ProjectStatusTag({ status }: { status: ProjectStatus }) {
  return <Tag>{status}</Tag>
}

/** The tag of a project's or a task's priority; `className` places it. */
export function ProjectPriorityTag({ priority, className }: {
  priority: ProjectIdentitySource['priority']
  className?: string
}) {
  return <Tag tone={PRIORITY_TONE[priority]} className={className}>{priority.toUpperCase()}</Tag>
}

/** The one project-name label for lists that tag a row with its project; like every tag, it keeps its width. */
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
  const m = useMessages()
  const area = project.topic ? areasName(m, { ...project, topic: project.topic }) : undefined
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
          {showTopic && area
            ? <FadeText className="project-identity-topic" label={area}>{area}</FadeText>
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
      {showTopic && area
        ? <FadeText className="project-identity-topic" label={area}>{area}</FadeText>
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
      {fields.topic ?? <div className="pv">{project.topic === undefined ? '—' : areasName(m, { ...project, topic: project.topic })}</div>}
    </>
  )
}
