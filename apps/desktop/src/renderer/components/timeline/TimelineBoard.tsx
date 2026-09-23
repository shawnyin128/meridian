import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  MouseEvent as ReactMouseEvent, ReactNode, RefObject,
} from 'react'
import type { Milestone, Task, TaskWindow } from '../../../shared/contract.js'
import { useToday } from '../../shell/AppShell.js'
import { dnum, isoOf } from '../../../shared/dates.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import { Icon } from '../icons.js'
import {
  DAY_SLOT_HOURS, shiftTaskWindow, timelineDayAt, TimelineControls, TimelineGrid,
  TimelineNowMarker, timelineTaskSpan, useFittedTimelineWindow, useTimelinePeriod,
} from './TimelineScale.js'
import type { TimelineScale } from './TimelineScale.js'
import { useGanttDrag } from '../../hooks/useGanttDrag.js'
import { useDragReorder } from '../../hooks/useDragReorder.js'
import './TimelineBoard.css'

export type TimelineProject = {
  id: string
  name: string
  tasks: Task[]
  milestones: Milestone[]
}

export type TimelinePoint = { left: number; top: number }

type TimelineRow =
  | { kind: 'milestones'; project: TimelineProject }
  | { kind: 'task'; project: TimelineProject; task: Task }

type Grab =
  | {
    kind: 'task'; projectId: string; taskId: string; start: string; end: string
    window?: TaskWindow
  }
  | { kind: 'milestone'; projectId: string; milestoneId: string; date: string }

const dragKey = (grab: Grab) => grab.kind === 'milestone'
  ? `${grab.projectId}/milestone/${grab.milestoneId}`
  : `${grab.projectId}/task/${grab.taskId}`

function pointAt(canvas: HTMLElement, clientX: number, clientY: number): TimelinePoint {
  const rect = canvas.getBoundingClientRect()
  return { left: clientX - rect.left, top: clientY - rect.top }
}

/**
 * With `foldable`, each project's milestone row carries a caret that hides or shows that project's task rows.
 * A complete timeline shared between the project page and the overview. The two places only determine the label content, head movement and click behavior through parameters;
 * Time scales, grids, task/milestone rows, drag and drop, status colors, priorities and overdue reminders are only implemented here once.
 */
export function TimelineBoard({
  projects, className = '', showProjectNames = false, foldable = false, headerAction, canvasOverlay,
  milestoneLaneRef, hoverMilestoneId, onHoverMilestone, onLabelClick, onTaskClick,
  onMilestoneClick, onMilestoneLaneClick, onMoveTask, onMoveTaskWindow, onMoveMilestone,
  onReorderTasks, onPeriodChange,
}: {
  projects: TimelineProject[]
  className?: string
  showProjectNames?: boolean
  foldable?: boolean
  headerAction?: (context: {
    scale: TimelineScale; firstDay: string; today: string
  }) => ReactNode
  canvasOverlay?: ReactNode
  milestoneLaneRef?: RefObject<HTMLDivElement | null>
  hoverMilestoneId?: string | null
  onHoverMilestone?: (projectId: string, milestoneId: string | null) => void
  onLabelClick?: (projectId: string, kind: 'milestones' | 'task', itemId?: string) => void
  onTaskClick: (projectId: string, taskId: string) => void
  onMilestoneClick: (projectId: string, milestoneId: string, point: TimelinePoint) => void
  onMilestoneLaneClick: (projectId: string, date: string, point: TimelinePoint) => void
  onMoveTask: (
    projectId: string, taskId: string, start: string, end: string, days: number
  ) => void
  onMoveTaskWindow: (
    projectId: string, taskId: string, patch: Pick<Task, 'start' | 'end' | 'window'>,
    slots: number
  ) => void
  onMoveMilestone: (projectId: string, milestoneId: string, date: string) => void
  /** Persists a full drag-reordering of one project's tasks; omit to leave the label column undraggable. */
  onReorderTasks?: (projectId: string, order: string[]) => void
  onPeriodChange?: () => void
}) {
  const fmt = useFormat()
  const m = useMessages()
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const todayIso = useToday()
  const period = useTimelinePeriod(todayIso)
  const { anchor, scale } = period
  const window = useFittedTimelineWindow(wrap, period.window, scale)
  const today = dnum(todayIso)
  const { w0, w1, days, dayWidth, label } = window
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const toggleFold = (projectId: string) => setFolded((held) => {
    const next = new Set(held)
    if (next.has(projectId)) next.delete(projectId)
    else next.add(projectId)
    return next
  })
  const rows = useMemo(() => projects.flatMap((project): TimelineRow[] => [
    { kind: 'milestones', project },
    ...(folded.has(project.id) ? [] : project.tasks.map((task) => ({ kind: 'task' as const, project, task }))),
  ]), [folded, projects])

  // Scopes a dragged task label to its own project, so a drop only reorders tasks within that
  // project; `order` interleaves every project's task ids, so the project whose sub-order changed
  // is the one the user actually reordered.
  const taskProjectId = useMemo(
    () => new Map(rows.flatMap((row) => (row.kind === 'task' ? [[row.task.id, row.project.id] as const] : []))),
    [rows],
  )
  const labelReorder = useDragReorder(
    [...taskProjectId.keys()], (id) => taskProjectId.get(id) ?? '',
    (order) => {
      for (const project of projects) {
        const current = project.tasks.map((task) => task.id)
        const known = new Set(current)
        const next = order.filter((id) => known.has(id))
        if (next.some((id, index) => id !== current[index])) {
          onReorderTasks?.(project.id, next)
          return
        }
      }
    },
  )

  const onMove = useCallback((grab: Grab, delta: number) => {
    if (grab.kind === 'milestone') {
      onMoveMilestone(grab.projectId, grab.milestoneId, isoOf(dnum(grab.date) + delta))
    } else if (scale === 'day' && grab.window) {
      onMoveTaskWindow(
        grab.projectId, grab.taskId,
        shiftTaskWindow({ ...grab, window: grab.window }, delta), delta,
      )
    } else {
      onMoveTask(
        grab.projectId, grab.taskId,
        isoOf(dnum(grab.start) + delta), isoOf(dnum(grab.end) + delta), delta,
      )
    }
  }, [onMoveMilestone, onMoveTask, onMoveTaskWindow, scale])

  const onClick = useCallback((grab: Grab) => {
    if (grab.kind === 'milestone') {
      const marker = canvas.current?.querySelector<HTMLElement>(
        `[data-milestone="${CSS.escape(`${grab.projectId}/${grab.milestoneId}`)}"]`,
      )
      const rect = marker?.getBoundingClientRect()
      const point = rect && canvas.current
        ? pointAt(canvas.current, rect.left + rect.width / 2, rect.top + rect.height / 2)
        : { left: 0, top: 0 }
      onMilestoneClick(grab.projectId, grab.milestoneId, point)
    } else onTaskClick(grab.projectId, grab.taskId)
  }, [onMilestoneClick, onTaskClick])

  const drag = useGanttDrag<Grab>({
    wrap, dayWidth,
    unitWidthOf: (grab) => scale === 'day' && grab.kind === 'task' && grab.window
      ? dayWidth / (24 / DAY_SLOT_HOURS)
      : dayWidth,
    idOf: dragKey, onMove, onClick,
  })

  useEffect(() => {
    const viewport = wrap.current
    const focus = today >= w0 && today <= w1 ? today : w0
    if (viewport) viewport.scrollLeft = Math.max(0, (focus - w0) * dayWidth - viewport.clientWidth / 2)
  }, [anchor, dayWidth, scale, today, w0, w1])

  const labelFor = (row: TimelineRow) => row.kind === 'milestones' ? m.project.plan.milestoneMode : row.task.title

  return (
    <div className={`gantt${className ? ` ${className}` : ''}`} onClickCapture={drag.onClickCapture}>
      <div className="ghead">
        <span className="gm">{label}</span>
        <TimelineControls
          scale={scale} onScaleChange={(next) => { onPeriodChange?.(); period.setScale(next) }}
          onStep={(direction) => { onPeriodChange?.(); period.step(direction) }}
          onToday={() => { onPeriodChange?.(); period.goToday() }}
        />
        {headerAction?.({ scale, firstDay: isoOf(w0), today: todayIso })}
      </div>
      <div className="gsplit">
        <div className="glabels">
          <div className="glhead" />
          {rows.map((row) => {
            const key = row.kind === 'milestones'
              ? `${row.project.id}/milestones`
              : `${row.project.id}/task/${row.task.id}`
            const dropClass = row.kind === 'task' && onReorderTasks !== undefined
              ? labelReorder.dropClass(row.task.id) : ''
            return (
              <div
                className={`${row.kind === 'milestones' ? 'glrow msl timeline-label-row' : 'glrow timeline-label-row'}${
                  dropClass ? ` ${dropClass}` : ''}`}
                data-proj={row.project.id}
                data-task={row.kind === 'task' ? row.task.id : undefined}
                key={key}
                {...(row.kind === 'task' && onReorderTasks !== undefined ? labelReorder.cardProps(row.task.id) : {})}
                onClick={() => onLabelClick?.(
                  row.project.id, row.kind, row.kind === 'task' ? row.task.id : undefined,
                )}
              >
                {foldable && row.kind === 'milestones' ? (
                  <button
                    type="button" className="timeline-fold" aria-expanded={!folded.has(row.project.id)}
                    title={folded.has(row.project.id)
                      ? m.timeline.fold.expand(row.project.name) : m.timeline.fold.collapse(row.project.name)}
                    onClick={(event) => { event.stopPropagation(); toggleFold(row.project.id) }}
                  ><Icon sw={2.4}><path d="M6 9l6 6 6-6" /></Icon></button>
                ) : null}
                {showProjectNames
                  ? <span className="timeline-project-label" title={row.project.name}>{row.project.name}</span>
                  : null}
                <span className="timeline-item-label" title={labelFor(row)}>{labelFor(row)}</span>
                {row.kind === 'milestones' && folded.has(row.project.id) && row.project.tasks.length > 0
                  ? <span className="timeline-folded-count">{m.timeline.fold.hidden(row.project.tasks.length)}</span>
                  : null}
                {row.kind === 'task'
                  ? <span className={`timeline-task-priority ${row.task.priority}`}>{row.task.priority.toUpperCase()}</span>
                  : null}
              </div>
            )
          })}
        </div>
        <div className="gwrap" ref={wrap}>
          <div className="gcanvas" ref={canvas} style={{ width: days * dayWidth }}>
            <TimelineGrid window={window} scale={scale} today={today} />
            {rows.map((row, rowIndex) => {
              const { project } = row
              if (row.kind === 'milestones') {
                return (
                  <div
                    className="grow msrow" data-row={project.id} data-proj={project.id}
                    key={`${project.id}/milestones`}
                    title={m.timeline.bar.clickHint}
                    ref={rowIndex === 0 ? milestoneLaneRef : undefined}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('.gddl')) return
                      onMilestoneLaneClick(
                        project.id,
                        timelineDayAt(canvas.current!, event.clientX, window),
                        pointAt(canvas.current!, event.clientX, event.clientY),
                      )
                    }}
                  >
                    {project.milestones.map((milestone) => {
                      const day = dnum(milestone.date)
                      if (day < w0 || day > w1) return null
                      const key = `${project.id}/${milestone.id}`
                      const overdue = !milestone.done && day < today
                      return (
                        <span
                          className={`gddl${milestone.done ? ' done' : ''}${overdue ? ' overdue' : ''}${hoverMilestoneId === milestone.id ? ' hl' : ''}`}
                          data-proj={project.id} data-milestone={key} key={milestone.id}
                          title={m.timeline.milestoneTitle(
                            fmt.date(milestone.date), milestone.title, overdue ? m.common.overdue : '',
                          )}
                          style={{
                            left: (day - w0) * dayWidth + dayWidth / 2 - 4
                              + drag.dragged(`${project.id}/milestone/${milestone.id}`),
                          }}
                          onMouseDown={(event) => drag.grab(event, {
                            kind: 'milestone', projectId: project.id,
                            milestoneId: milestone.id, date: milestone.date,
                          })}
                          onMouseEnter={() => onHoverMilestone?.(project.id, milestone.id)}
                          onMouseLeave={() => onHoverMilestone?.(project.id, null)}
                        />
                      )
                    })}
                  </div>
                )
              }

              const { task } = row
              const start = dnum(task.start)
              const end = dnum(task.end)
              const span = timelineTaskSpan(task, window, scale)
              const fallbackLeft = (start - w0) * dayWidth
              const fallbackRight = (end - w0 + 1) * dayWidth - 6
              const stub = drag.stubAt(span?.left ?? fallbackLeft, (span?.right ?? fallbackRight) - 6)
              const leftInset = start < w0 ? 0 : 3
              const rightInset = end > w1 ? 0 : 3
              const id = `${project.id}/task/${task.id}`
              const overdue = task.state !== 'done' && end < today
              return (
                <div
                  className="grow" data-row={`${project.id}/${task.id}`}
                  data-proj={project.id} data-task={task.id} key={id}
                >
                  {span === null
                    ? null
                    : (
                      <div
                        className={`gbar${start < w0 ? ' clipl' : ''}${task.state === 'done' ? ' dim' : task.state === 'plan' ? ' plan' : ' active'}${overdue ? ' overdue' : ''} priority-${task.priority}`}
                        data-proj={project.id} data-task={task.id}
                        title={m.timeline.taskTitle(
                          task.end === task.start ? fmt.date(task.start) : `${fmt.date(task.start)} – ${fmt.date(task.end)}`,
                          task.window ? `${task.window.start}–${task.window.end}` : '',
                          task.priority.toUpperCase(),
                          overdue ? m.common.overdue : '',
                        )}
                        style={{
                          left: span.left + leftInset + drag.dragged(id),
                          width: Math.max(10, span.right - span.left - leftInset - rightInset),
                        }}
                        onMouseDown={(event: ReactMouseEvent) => drag.grab(event, {
                          kind: 'task', projectId: project.id, taskId: task.id,
                          start: task.start, end: task.end,
                          ...(task.window === undefined ? {} : { window: task.window }),
                        })}
                      ><span className="gbar-label">{task.title}</span></div>
                    )}
                  {stub
                    ? (
                      <div
                        className={task.state === 'done' ? 'gstub done' : 'gstub'}
                        title={m.timeline.stub.clickToLocate(
                          `${fmt.date(task.start)} – ${fmt.date(task.end)}`, task.title,
                          stub.side === 'l' ? m.timeline.stub.left : m.timeline.stub.right,
                        )}
                        style={{ left: stub.left }} onClick={() => onTaskClick(project.id, task.id)}
                      >{stub.side === 'l' ? '‹' : '›'}</div>
                    )
                    : null}
                </div>
              )
            })}
            <TimelineNowMarker window={window} scale={scale} today={today} />
            {canvasOverlay}
          </div>
        </div>
      </div>
    </div>
  )
}
