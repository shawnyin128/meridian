import { pluralEn } from '../../lib/plural.js'
import { research as zh } from '../zh/research.js'

/** English counterpart of `zh/research`. */
export const research = {
  overview: {
    title: 'Overview',
    timelineHeading: 'Timeline · Projects',
    statsHeading: 'Stats',
    stats: {
      active: 'Active',
      shelved: 'Shelved',
      openMilestones: 'Open milestones',
      recentProgress: 'Research log entries, last 7 days',
    },
    decisions: 'Needs attention',
    progressHeading: 'Project progress',
    activePathNote: (taskText: string | undefined) =>
      `Active research path${taskText === undefined ? '' : ` · Task: ${taskText}`}`,
    /** Suffix after the first in-progress node's label when several nodes are active at once. */
    activeNodesMore: (n: number) => `+${n} more`,
    focusWithActiveTasks: (label: string, n: number) =>
      `${label} · ${n} ${pluralEn(n, { one: 'active task', other: 'active tasks' })}`,
    recentHeading: 'Recent research log',
    upcomingHeading: 'Upcoming milestones',
    historyProjects: 'History',
    milestonePopTitle: (isNew: boolean) => (isNew ? 'Add milestone' : 'Edit milestone'),
    newMilestoneOn: (date: string) => `Add milestone · ${date}`,
    taskWindowMovedHours: (slots: number, hours: number) =>
      `Task moved ${slots > 0 ? 'later' : 'earlier'} by ${hours} ${pluralEn(hours, { one: 'hour', other: 'hours' })}`,
  },
  list: {
    title: 'Projects',
    create: 'New project',
    sort: 'Sort',
    sortPriority: 'By priority',
    sortMilestone: 'By next milestone',
    renameTitle: 'Rename project',
    rename: 'Rename…',
    renamed: 'Renamed',
    statusChangedTo: (status: string) => `Marked as ${status}`,
    createdNote: 'Project created',
    createdFeedNote: (name: string) => `Created project “${name}”`,
  },
  panel: {
    milestoneOn: (date: string) => `Milestone · ${date}`,
    dueToday: 'Today',
    dueInDays: (n: number) => `In ${n} ${pluralEn(n, { one: 'day', other: 'days' })}`,
    recentProgressLabel: 'Recent progress',
    staleAlert: (n: number) => `No progress for ${n} ${pluralEn(n, { one: 'day', other: 'days' })}`,
  },
  chips: {
    addProject: 'Link project',
    pickerHeading: 'Projects',
    linked: (name: string) => `Linked to project “${name}”`,
    unlinked: 'Link removed',
  },
  schedule: {
    startLabel: 'Start',
    endLabel: 'End',
    modeLabel: 'Schedule mode',
    startSlot: 'Start slot',
    endSlot: 'End slot',
  },
} satisfies typeof zh
