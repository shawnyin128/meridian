import type { RefObject } from 'react'
import type { Milestone, ProjectDetail, Task, TaskWindow } from '../../../shared/contract.js'
import { isoOf } from '../../../shared/dates.js'
import { useMessages } from '../../messages/useMessages.js'
import { useToday } from '../../shell/AppShell.js'
import { ActionMenu, MenuItem } from '../ActionMenu.js'
import { AddAction } from '../AddAction.js'
import { SectionHeading } from '../PageShell.js'
import { useMilestoneEditor } from '../timeline/MilestoneEditor.js'
import { TimelineBoard } from '../timeline/TimelineBoard.js'
import { timelineSlotWindow, useTimelinePeriod } from '../timeline/TimelineScale.js'

/**
 * The project page's timeline section: its heading and the shared timeline board. The milestone lane
 * and the diamonds open the shared milestone editor; the heading's add action starts `onNewTask`'s
 * or `onNewMilestone`'s row in the plan list, a task on the shown day in the day view and on today
 * otherwise. `onCreateMilestone` and `onUpdateMilestone` return whether that write succeeded.
 */
export function ProjectTimeline({
  project, hoverMilestone, onHoverMilestone, onLocateTask,
  onMoveTask, onMoveTaskWindow, onMoveMilestone, onReorderTasks, onNewTask, onNewMilestone,
  onCreateMilestone, onUpdateMilestone, onDeleteMilestone, newActionRef,
}: {
  project: ProjectDetail
  hoverMilestone: string | null
  onHoverMilestone: (milestoneId: string | null) => void
  onLocateTask: (taskId: string) => void
  onMoveTask: (taskId: string, start: string, end: string, days: number) => void
  onMoveTaskWindow: (taskId: string, patch: Pick<Task, 'start' | 'end' | 'window'>, slots: number) => void
  onMoveMilestone: (milestoneId: string, date: string) => void
  onReorderTasks: (order: string[]) => void
  onNewTask: (date: string, window: TaskWindow | null) => void
  onNewMilestone: (date: string) => void
  onCreateMilestone: (date: string, title: string) => Promise<boolean>
  onUpdateMilestone: (milestoneId: string, patch: Pick<Milestone, 'title' | 'date'>) => Promise<boolean>
  onDeleteMilestone: (milestoneId: string) => void
  newActionRef: RefObject<HTMLButtonElement | null>
}) {
  const m = useMessages()
  const today = useToday()
  const period = useTimelinePeriod(today)
  const editor = useMilestoneEditor({
    projects: [project],
    onCreate: (_projectId, date, title) => onCreateMilestone(date, title),
    onUpdate: (_projectId, milestoneId, patch) => onUpdateMilestone(milestoneId, patch),
    onDelete: (_projectId, milestoneId) => onDeleteMilestone(milestoneId),
  })
  return (
    <>
      <SectionHeading
        actions={(
          <ActionMenu trigger={(
            <AddAction size="compact" ref={newActionRef} label={m.project.plan.addTaskOrMilestone}>
              {m.project.plan.newAction}
            </AddAction>
          )}
          >
            <MenuItem
              onSelect={() => {
                const date = period.scale === 'day' ? isoOf(period.window.w0) : today
                const now = new Date()
                onNewTask(date, period.scale === 'day'
                  ? timelineSlotWindow(date === today ? now.getHours() * 60 + now.getMinutes() : 10 * 60)
                  : null)
              }}
            >{m.project.plan.taskMode}</MenuItem>
            <MenuItem onSelect={() => onNewMilestone(today)}>{m.project.plan.milestoneMode}</MenuItem>
          </ActionMenu>
        )}
      >{m.project.sections.timeline}
      </SectionHeading>
      <TimelineBoard
        projects={[project]} period={period}
        {...editor.board}
        hoverMilestoneId={hoverMilestone}
        onHoverMilestone={(_projectId, milestoneId) => onHoverMilestone(milestoneId)}
        onTaskLabelClick={(_projectId, taskId) => onLocateTask(taskId)}
        onTaskClick={(_projectId, taskId) => onLocateTask(taskId)}
        onMoveTask={(_projectId, taskId, start, end, days) => onMoveTask(taskId, start, end, days)}
        onMoveTaskWindow={(_projectId, taskId, patch, slots) => onMoveTaskWindow(taskId, patch, slots)}
        onMoveMilestone={(_projectId, milestoneId, date) => onMoveMilestone(milestoneId, date)}
        onReorderTasks={(_projectId, order) => onReorderTasks(order)}
      />
    </>
  )
}
