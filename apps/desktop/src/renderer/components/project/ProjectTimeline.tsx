import type { RefObject } from 'react'
import type { ProjectDetail, Task, TaskWindow } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { ActionMenu, MenuItem } from '../ActionMenu.js'
import { AddAction } from '../AddAction.js'
import { useMilestoneEditor } from '../timeline/MilestoneEditor.js'
import { TimelineBoard } from '../timeline/TimelineBoard.js'
import { timelineSlotWindow } from '../timeline/TimelineScale.js'

/**
 * Project-detail configuration of the shared timeline board. The milestone lane and the diamonds
 * open the shared milestone editor; the header's new-milestone action starts `onNewMilestone`'s row
 * in the plan list. `onCreateMilestone` and `onRenameMilestone` return whether that write succeeded.
 */
export function ProjectTimeline({
  project, hoverMilestone, onHoverMilestone, onLocateTask,
  onMoveTask, onMoveTaskWindow, onMoveMilestone, onReorderTasks, onNewTask, onNewMilestone,
  onCreateMilestone, onRenameMilestone, onDeleteMilestone, newActionRef,
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
  onRenameMilestone: (milestoneId: string, title: string) => Promise<boolean>
  onDeleteMilestone: (milestoneId: string) => void
  newActionRef: RefObject<HTMLButtonElement | null>
}) {
  const m = useMessages()
  const editor = useMilestoneEditor({
    projects: [project],
    onCreate: (_projectId, date, title) => onCreateMilestone(date, title),
    onRename: (_projectId, milestoneId, title) => onRenameMilestone(milestoneId, title),
    onDelete: (_projectId, milestoneId) => onDeleteMilestone(milestoneId),
  })
  return (
    <TimelineBoard
      projects={[project]}
      {...editor.board}
      hoverMilestoneId={hoverMilestone}
      onHoverMilestone={(_projectId, milestoneId) => onHoverMilestone(milestoneId)}
      onLabelClick={(_projectId, kind, itemId) => {
        if (kind === 'task' && itemId) onLocateTask(itemId)
      }}
      onTaskClick={(_projectId, taskId) => onLocateTask(taskId)}
      onMoveTask={(_projectId, taskId, start, end, days) => onMoveTask(taskId, start, end, days)}
      onMoveTaskWindow={(_projectId, taskId, patch, slots) => onMoveTaskWindow(taskId, patch, slots)}
      onMoveMilestone={(_projectId, milestoneId, date) => onMoveMilestone(milestoneId, date)}
      onReorderTasks={(_projectId, order) => onReorderTasks(order)}
      headerAction={({ scale, firstDay, today }) => (
        <ActionMenu trigger={(
          <AddAction variant="section" className="ghost" ref={newActionRef} title={m.project.plan.addTaskOrMilestone}>
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
