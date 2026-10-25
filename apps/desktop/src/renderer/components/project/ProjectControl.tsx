import type { ProjectControl, ProjectNextAction } from '../../../shared/contract.js'
import { useFormat, type Format } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import type { Catalog } from '../../messages/catalog.js'
import { FadeText } from '../FadeText.js'
import { Tag } from '../Tag.js'
import { Tooltip } from '../Tooltip.js'
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
    <Tooltip label={variant === 'inline' ? action.text : `${action.text} · ${meta}`} whenClipped>
      <span className={`project-control-value ${variant} ${className}`.trim()}>
        <span className="project-control-main">
          {variant === 'summary'
            ? null
            : (
              <Tag>
                {action.source === 'task' ? m.project.plan.taskMode : m.project.sections.graph}
              </Tag>
            )}
          <FadeText className="project-control-text">{action.text}</FadeText>
        </span>
        {variant === 'inline' ? null : <FadeText className="project-control-meta">{meta}</FadeText>}
      </span>
    </Tooltip>
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
    <Tooltip label={blocker.text} whenClipped>
      <span className={`project-control-value ${variant} blocker ${className}`.trim()}>
        <span className="project-control-main">
          <Tag>{m.project.control.manualSource}</Tag>
          <FadeText className="project-control-text">{blocker.text}</FadeText>
        </span>
      </span>
    </Tooltip>
  )
}
