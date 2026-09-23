import type { RefObject } from 'react'
import type { ProjectDetail, Task, TaskWindow } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { ActionMenu, MenuItem } from '../ActionMenu.js'
import { AddAction } from '../AddAction.js'
import { TimelineBoard } from '../timeline/TimelineBoard.js'
import { timelineSlotWindow } from '../timeline/TimelineScale.js'

/** Project-detail configuration of the shared timeline board. */
export function ProjectTimeline({
  project, hoverMilestone, onHoverMilestone, onLocateTask, onLocateMilestone,
  onMoveTask, onMoveTaskWindow, onMoveMilestone, onReorderTasks, onNewTask, onNewMilestone,
  newActionRef, milestoneLaneRef,
}: {
  project: ProjectDetail
  hoverMilestone: string | null
  onHoverMilestone: (milestoneId: string | null) => void
  onLocateTask: (taskId: string) => void
  onLocateMilestone: (milestoneId: string) => void
  onMoveTask: (taskId: string, start: string, end: string, days: number) => void
  onMoveTaskWindow: (taskId: string, patch: Pick<Task, 'start' | 'end' | 'window'>, slots: number) => void
  onMoveMilestone: (milestoneId: string, date: string) => void
  onReorderTasks: (order: string[]) => void
  onNewTask: (date: string, window: TaskWindow | null) => void
  onNewMilestone: (date: string) => void
  newActionRef: RefObject<HTMLButtonElement | null>
  milestoneLaneRef: RefObject<HTMLDivElement | null>
}) {
  const m = useMessages()
  return (
    <TimelineBoard
      projects={[project]}
      milestoneLaneRef={milestoneLaneRef}
      hoverMilestoneId={hoverMilestone}
      onHoverMilestone={(_projectId, milestoneId) => onHoverMilestone(milestoneId)}
      onLabelClick={(_projectId, kind, itemId) => {
        if (kind === 'task' && itemId) onLocateTask(itemId)
      }}
      onTaskClick={(_projectId, taskId) => onLocateTask(taskId)}
      onMilestoneClick={(_projectId, milestoneId) => onLocateMilestone(milestoneId)}
      onMilestoneLaneClick={(_projectId, date) => onNewMilestone(date)}
      onMoveTask={(_projectId, taskId, start, end, days) => onMoveTask(taskId, start, end, days)}
      onMoveTaskWindow={(_projectId, taskId, patch, slots) => onMoveTaskWindow(taskId, patch, slots)}
      onMoveMilestone={(_projectId, milestoneId, date) => onMoveMilestone(milestoneId, date)}
      onReorderTasks={(_projectId, order) => onReorderTasks(order)}
      headerAction={({ scale, firstDay, today }) => (
        <ActionMenu trigger={(
          <AddAction variant="section" ref={newActionRef} title={m.project.plan.addTaskOrMilestone}>
            {m.project.plan.newAction}
          </AddAction>
        )}
        >
          <MenuItem
            onSelect={() => {
              const date = scale === 'day' ? firstDay : today
              const now = new Date()
              onNewTask(date, scale === 'day'
                ? timelineSlotWindow(date === today ? now.getHours() * 60 + now.getMinutes() : 10 * 60)
                : null)
            }}
          >{m.project.plan.taskMode}</MenuItem>
          <MenuItem onSelect={() => onNewMilestone(today)}>{m.project.plan.milestoneMode}</MenuItem>
        </ActionMenu>
      )}
    />
  )
}
