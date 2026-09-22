import type { ReactNode } from 'react'
import type { ProjectStatus } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import './ProjectIdentity.css'

export const STATUS_CLASS: Record<ProjectStatus, string> =
  { 进行中: 'ok', 搁置: 'pend', 已完成: 'mut' }

export type ProjectIdentitySource = {
  name: string
  status: ProjectStatus
  priority: 'p0' | 'p1' | 'p2'
  topic?: string
}

export function ProjectStatusTag({ status }: { status: ProjectStatus }) {
  return <span className={`stag ${STATUS_CLASS[status]}`}>{status}</span>
}

export function ProjectPriorityTag({ priority }: { priority: ProjectIdentitySource['priority'] }) {
  return <span className={`prtag ${priority}`}>{priority.toUpperCase()}</span>
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
          <span className={`project-identity-dot ${STATUS_CLASS[project.status]}`} aria-hidden="true" />
          <span className="project-identity-name" title={project.name}>{project.name}</span>
          {showPriority ? <ProjectPriorityTag priority={project.priority} /> : null}
          {showTopic && project.topic
            ? <span className="project-identity-topic">{project.topic}</span>
            : null}
        </span>
        {showStatus ? <span className="project-identity-sub">{project.status}</span> : null}
      </span>
    )
  }
  return (
    <span className={`project-identity ${variant}`}>
      <span className="project-identity-name" title={project.name}>{project.name}</span>
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
