import type { ProjectControl, ProjectNextAction } from '../../../shared/contract.js'
import { useFormat, type Format } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import type { Catalog } from '../../messages/catalog.js'
import './ProjectControl.css'

export type ProjectControlVariant = 'detail' | 'summary' | 'inline'

function actionMeta(
  action: Exclude<ProjectNextAction, { source: 'missing' }>, fmt: Format, m: Catalog,
): string {
  if (action.source === 'research') return m.project.control.researchNode(action.node.label)
  return [
    action.task.state === 'act' ? m.project.control.activeTask : m.project.control.plannedTask,
    action.task.priority.toUpperCase(),
    fmt.dateRange(action.task.start, action.task.end),
    action.task.window === undefined
      ? undefined
      : `${action.task.window.start}–${action.task.window.end}`,
  ].filter(Boolean).join(' · ')
}

/** One rendering contract for the resolved next action; hosts only choose information density. */
export function ProjectNextActionView({ action, variant = 'detail', className = '' }: {
  action: ProjectNextAction
  variant?: ProjectControlVariant
  className?: string
}) {
  const fmt = useFormat()
  const m = useMessages()
  if (action.source === 'missing') {
    return (
      <span className={`project-control-value ${variant} empty ${className}`.trim()}>
        {action.text}
      </span>
    )
  }
  const meta = actionMeta(action, fmt, m)
  return (
    <span
      className={`project-control-value ${variant} ${className}`.trim()}
      title={`${action.text} · ${meta}`}
    >
      <span className="project-control-main">
        {variant === 'summary'
          ? null
          : (
            <span className={`project-control-source ${action.source}`}>
              {action.source === 'task' ? m.project.plan.taskMode : m.project.sections.graph}
            </span>
          )}
        <span className="project-control-text">{action.text}</span>
      </span>
      {variant === 'inline' ? null : <span className="project-control-meta">{meta}</span>}
    </span>
  )
}

/** The blocker uses the same source vocabulary everywhere; an inline empty blocker takes no room. */
export function ProjectBlockerView({ blocker, variant = 'detail', className = '' }: {
  blocker: ProjectControl['blocker']
  variant?: Extract<ProjectControlVariant, 'detail' | 'inline'>
  className?: string
}) {
  const m = useMessages()
  if (blocker === undefined) {
    return variant === 'inline'
      ? null
      : (
        <span className={`project-control-value detail empty ${className}`.trim()}>
          {m.project.control.noBlocker}
        </span>
      )
  }
  return (
    <span className={`project-control-value ${variant} blocker ${className}`.trim()} title={blocker.text}>
      <span className="project-control-main">
        <span className="project-control-source manual">{m.project.control.manualSource}</span>
        <span className="project-control-text">{blocker.text}</span>
      </span>
    </span>
  )
}
