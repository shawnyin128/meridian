import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import type { Milestone, Task, TaskWindow } from '../../../shared/contract.js'
import { useToday } from '../../shell/AppShell.js'
import { dnum, isoOf } from '../../../shared/dates.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import { FadeText } from '../FadeText.js'
import { FoldToggle } from '../FoldToggle.js'
import { ProjectPriorityTag } from '../project/ProjectIdentity.js'
import { Toolbar, ToolbarButton } from '../Toolbar.js'
import { Tooltip } from '../Tooltip.js'
import {
  DAY_SLOT_HOURS, shiftTaskWindow, timelineDayAt, TimelineControls, TimelineGrid,
  TimelineNowMarker, timelineTaskSpan, useFittedTimelineWindow,
} from './TimelineScale.js'
import type { TimelinePeriod } from './TimelineScale.js'
import { useGanttDrag } from '../../hooks/useGanttDrag.js'
import { useDragReorder } from '../../hooks/useDragReorder.js'
import { useScrollFade } from '../../hooks/useScrollFade.js'
import { isClipped } from '../../hooks/useClipped.js'
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
  | { kind: 'task'; project: TimelineProject; task: Task; span: { left: number; right: number } }

type Grab =
  | {
    kind: 'task'; projectId: string; taskId: string; start: string; end: string
    window?: TaskWindow
  }
  | { kind: 'milestone'; projectId: string; milestoneId: string; date: string }

/** The room, in px, between a one-day bar and the title drawn beside it. */
const BESIDE_GAP = 6

const dragKey = (grab: Grab) => grab.kind === 'milestone'
  ? `${grab.projectId}/milestone/${grab.milestoneId}`
  : `${grab.projectId}/task/${grab.taskId}`

function pointAt(canvas: HTMLElement, clientX: number, clientY: number): TimelinePoint {
  const rect = canvas.getBoundingClientRect()
  return { left: clientX - rect.left, top: clientY - rect.top }
}

/**
 * With `foldable`, each project's milestone row carries a caret that hides or shows that project's task rows.
 * With `showProjectNames`, the milestone row's label is the project's name, the one place it is named.
 * A one-day bar narrower than its title draws the title beside it.
 * The full timeline shared by the project page and Overview. The two callers hold the period it shows
 * (`period`, from `useTimelinePeriod`) and only choose the label content, the header action and what
 * clicks do, through props; the time scale, grid, task and milestone rows, drag and drop, status
 * colors, priorities and overdue warnings live only here.
 * The label column and the canvas are one Tab stop each, with the up and down arrow keys between
 * their rows: a label that opens something, a task's bar or edge stub, and a project's milestone
 * lane, where Enter or Space names a new milestone on today's date.
 */
export function TimelineBoard({
  projects, period, className = '', showProjectNames = false, foldable = false, headerAction, canvasOverlay,
  hoverMilestoneId, onHoverMilestone, onTaskLabelClick, onProjectLabelClick, onTaskClick,
  onMilestoneClick, onMilestoneLaneClick, onMoveTask, onMoveTaskWindow, onMoveMilestone,
  onReorderTasks, onPeriodChange,
}: {
  projects: TimelineProject[]
  period: TimelinePeriod
  className?: string
  showProjectNames?: boolean
  foldable?: boolean
  headerAction?: ReactNode
  canvasOverlay?: ReactNode
  hoverMilestoneId?: string | null
  onHoverMilestone?: (projectId: string, milestoneId: string | null) => void
  /** Opens a task from its label; without it a task label opens nothing. */
  onTaskLabelClick?: (projectId: string, taskId: string) => void
  /** Opens a project from the label of its milestone row; without it that label opens nothing. */
  onProjectLabelClick?: (projectId: string) => void
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
  const wrapFade = useScrollFade('x', wrap)
  const canvas = useRef<HTMLDivElement>(null)
  const todayIso = useToday()
  const { anchor, scale } = period
  const window = useFittedTimelineWindow(wrap, period.window, scale)
  const today = dnum(todayIso)
  const { w0, w1, days, dayWidth, label } = window
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  // The width of each one-day bar's title that its bar cannot hold, by drag key.
  const [beside, setBeside] = useState<ReadonlyMap<string, number>>(new Map())
  const toggleFold = (projectId: string) => setFolded((held) => {
    const next = new Set(held)
    if (next.has(projectId)) next.delete(projectId)
    else next.add(projectId)
    return next
  })
  // Only tasks that overlap the shown period get a row.
  const shown = new Map(projects.map((project) => [project.id, project.tasks.flatMap((task) => {
    const span = timelineTaskSpan(task, window, scale)
    return span === null ? [] : [{ kind: 'task' as const, project, task, span }]
  })]))
  const rows = projects.flatMap((project): TimelineRow[] => [
    { kind: 'milestones', project },
    ...(folded.has(project.id) ? [] : shown.get(project.id)!),
  ])

  // Scopes a dragged task label to its own project, so a drop only reorders tasks within that
  // project; `order` interleaves every project's task ids, so the project whose sub-order changed
  // is the one the user actually reordered.
  const taskProjectId = new Map(rows.flatMap((row) => (row.kind === 'task' ? [[row.task.id, row.project.id] as const] : [])))
  const labelReorder = useDragReorder(
    [...taskProjectId.keys()], (id) => taskProjectId.get(id) ?? '',
    (order) => {
      for (const project of projects) {
        const current = project.tasks.map((task) => task.id)
        // Tasks outside the shown period keep their places; the dragged order fills the shown ones'.
        const moved = order.filter((id) => taskProjectId.get(id) === project.id)
        let at = 0
        const next = current.map((id) => (taskProjectId.has(id) ? moved[at++]! : id))
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

  // The title inside a one-day bar keeps its box, hidden while it is drawn beside, so its fit is measured the same way in both.
  useLayoutEffect(() => {
    const cut = new Map([...canvas.current!.querySelectorAll<HTMLElement>('.gbar.one-day .gbar-label')]
      .filter((label) => isClipped(label, 'x'))
      .map((label) => {
        const bar = label.closest<HTMLElement>('.gbar')!
        return [`${bar.dataset['proj']}/task/${bar.dataset['task']}`, label.scrollWidth] as const
      }))
    setBeside((held) => (held.size === cut.size && [...cut].every(([key, width]) => held.get(key) === width) ? held : cut))
  })

  const labelFor = (row: TimelineRow) => row.kind === 'milestones'
    ? (showProjectNames ? row.project.name : m.project.plan.milestoneMode)
    : row.task.title
  const openLabel = (row: TimelineRow) => row.kind === 'task'
    ? (onTaskLabelClick === undefined ? undefined : () => onTaskLabelClick(row.project.id, row.task.id))
    : (onProjectLabelClick === undefined ? undefined : () => onProjectLabelClick(row.project.id))
  const todayShown = today >= w0 && today <= w1

  return (
    <div className={`gantt${className ? ` ${className}` : ''}`} onClickCapture={drag.onClickCapture}>
      <Toolbar>
        <div className="ghead">
          <span className="gm">{label}</span>
          <TimelineControls
            scale={scale} onScaleChange={(next) => { onPeriodChange?.(); period.setScale(next) }}
            onStep={(direction) => { onPeriodChange?.(); period.step(direction) }}
            onToday={() => { onPeriodChange?.(); period.goToday() }}
          />
          {headerAction}
        </div>
      </Toolbar>
      <div className="gsplit">
        <Toolbar orientation="vertical">
          <div className="glabels">
            <div className="glhead" />
            {rows.map((row) => {
              const key = row.kind === 'milestones'
                ? `${row.project.id}/milestones`
                : `${row.project.id}/task/${row.task.id}`
              const open = openLabel(row)
              const text = <FadeText className="timeline-item-label">{labelFor(row)}</FadeText>
              return (
                <div
                  className={row.kind === 'milestones' ? 'glrow msl timeline-label-row' : 'glrow timeline-label-row'}
                  data-proj={row.project.id}
                  data-task={row.kind === 'task' ? row.task.id : undefined}
                  key={key}
                  {...(row.kind === 'task' && onReorderTasks !== undefined
                    ? { ...labelReorder.handleProps(row.task.id), ...labelReorder.itemProps(row.task.id) }
                    : {})}
                  onClick={open}
                >
                  {/* A label that opens something is the row's button; its click reaches the row. */}
                  <Tooltip label={labelFor(row)} whenClipped>
                    {open === undefined ? text : <ToolbarButton className="timeline-label-open">{text}</ToolbarButton>}
                  </Tooltip>
                  {foldable && row.kind === 'milestones' ? (
                    <FoldToggle
                      variant="caret" label={folded.has(row.project.id)
                        ? m.timeline.fold.expand(row.project.name) : m.timeline.fold.collapse(row.project.name)}
                      open={!folded.has(row.project.id)} onToggle={() => toggleFold(row.project.id)}
                    />
                  ) : null}
                  {row.kind === 'milestones' && folded.has(row.project.id) && shown.get(row.project.id)!.length > 0
                    ? <span className="timeline-folded-count">{m.timeline.fold.hidden(shown.get(row.project.id)!.length)}</span>
                    : null}
                  {row.kind === 'task'
                    ? <ProjectPriorityTag priority={row.task.priority} className="timeline-task-priority" />
                    : null}
                </div>
              )
            })}
          </div>
        </Toolbar>
        <div className="gwrap" ref={wrapFade}>
          <Toolbar orientation="vertical">
            <div className="gcanvas" ref={canvas} style={{ width: days * dayWidth }}>
              <TimelineGrid window={window} scale={scale} today={today} />
              {rows.map((row) => {
                const { project } = row
                if (row.kind === 'milestones') {
                  return (
                    <div
                      className="grow msrow" data-row={project.id} data-proj={project.id}
                      key={`${project.id}/milestones`}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest('.gddl')) return
                        onMilestoneLaneClick(
                          project.id,
                          timelineDayAt(canvas.current!, event.clientX, window),
                          pointAt(canvas.current!, event.clientX, event.clientY),
                        )
                      }}
                    >
                      {/* The lane's keyboard control covers today's day; a pointer press reaches the lane through it. */}
                      <ToolbarButton
                        className="glane-new" aria-label={m.research.overview.newMilestoneOn(fmt.date(todayIso))}
                        style={todayShown
                        ? { left: `calc(${(today - w0) * dayWidth}px + var(--ring-room))`, width: `calc(${dayWidth}px - 2 * var(--ring-room))` }
                        : { left: 'var(--ring-room)', right: 'var(--ring-room)' }}
                        onClick={(event) => {
                          event.stopPropagation()
                          const rect = event.currentTarget.getBoundingClientRect()
                          onMilestoneLaneClick(
                            project.id, todayIso, pointAt(canvas.current!, rect.left + rect.width / 2, rect.top + rect.height / 2),
                          )
                        }}
                      />
                      {project.milestones.map((milestone) => {
                        const day = dnum(milestone.date)
                        if (day < w0 || day > w1) return null
                        const key = `${project.id}/${milestone.id}`
                        const overdue = !milestone.done && day < today
                        return (
                          <Tooltip
                            key={milestone.id}
                            label={m.timeline.milestoneTitle(fmt.date(milestone.date), milestone.title, overdue ? m.common.overdue : '')}
                          >
                            <span
                              className={`gddl${milestone.done ? ' done' : ''}${overdue ? ' overdue' : ''}${hoverMilestoneId === milestone.id ? ' hl' : ''}${
                                drag.dragging(`${project.id}/milestone/${milestone.id}`) ? ' dragging' : ''}`}
                              data-proj={project.id} data-milestone={key}
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
                          </Tooltip>
                        )
                      })}
                    </div>
                  )
                }

                const { task, span } = row
                const start = dnum(task.start)
                const end = dnum(task.end)
                const stub = drag.stubAt(span.left, span.right - 6)
                const leftInset = start < w0 ? 0 : 3
                const rightInset = end > w1 ? 0 : 3
                const id = `${project.id}/task/${task.id}`
                const overdue = task.state !== 'done' && end < today
                const titleWidth = beside.get(id)
                const name = m.timeline.taskTitle(
                  task.title,
                  task.end === task.start ? fmt.date(task.start) : `${fmt.date(task.start)} – ${fmt.date(task.end)}`,
                  task.window ? `${task.window.start}–${task.window.end}` : '',
                  task.priority.toUpperCase(),
                  overdue ? m.common.overdue : '',
                )
                return (
                  <div
                    className="grow" data-row={`${project.id}/${task.id}`}
                    data-proj={project.id} data-task={task.id} key={id}
                  >
                    <Tooltip label={name}>
                      <ToolbarButton
                        className={`gbar${start < w0 ? ' clipl' : ''}${task.state === 'done' ? ' dim' : task.state === 'plan' ? ' plan' : ' active'}${overdue ? ' overdue' : ''} priority-${task.priority}${task.start === task.end ? ' one-day' : ''}${titleWidth === undefined ? '' : ' label-beside'}${drag.dragging(id) ? ' dragging' : ''}`}
                        data-proj={project.id} data-task={task.id} aria-label={name}
                        style={{
                          left: span.left + leftInset + drag.dragged(id),
                          width: Math.max(10, span.right - span.left - leftInset - rightInset),
                        }}
                        onMouseDown={(event: ReactMouseEvent) => drag.grab(event, {
                          kind: 'task', projectId: project.id, taskId: task.id,
                          start: task.start, end: task.end,
                          ...(task.window === undefined ? {} : { window: task.window }),
                        })}
                        // A pointer press opens the task through the drag, which swallows the click after it,
                        // so only Enter and Space reach this click.
                        onClick={() => onTaskClick(project.id, task.id)}
                      ><FadeText className="gbar-label">{task.title}</FadeText></ToolbarButton>
                    </Tooltip>
                    {titleWidth === undefined
                      ? null
                      : (
                        // After the bar, or before it where the canvas ends first; the bar's own name says it to assistive technology.
                        <span
                          className="gbar-aside" aria-hidden="true"
                          style={span.right + BESIDE_GAP + titleWidth <= days * dayWidth
                            ? { left: span.right + BESIDE_GAP + drag.dragged(id) }
                            : { right: days * dayWidth - span.left + BESIDE_GAP - drag.dragged(id) }}
                        >{task.title}</span>
                      )}
                    {stub
                      ? (
                        <Tooltip label={name}>
                          <ToolbarButton
                            className={task.state === 'done' ? 'gstub done' : 'gstub'} aria-label={name}
                            style={{ left: stub.left }} onClick={() => onTaskClick(project.id, task.id)}
                          >{stub.side === 'l' ? '‹' : '›'}</ToolbarButton>
                        </Tooltip>
                      )
                      : null}
                  </div>
                )
              })}
              <TimelineNowMarker window={window} scale={scale} today={today} />
              {canvasOverlay}
            </div>
          </Toolbar>
        </div>
      </div>
    </div>
  )
}
