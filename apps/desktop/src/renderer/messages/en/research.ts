import { pluralEn } from '../../lib/plural.js'
import { research as zh } from '../zh/research.js'

/** English counterpart of `zh/research`. */
export const research = {
  overview: {
    title: (n: number) => `Overview · ${n}`,
    timelineHeading: 'Timeline · Projects',
    statsHeading: 'Stats',
    stats: {
      active: 'Active',
      shelved: 'Shelved',
      openMilestones: 'Open milestones',
      recentProgress: 'Progress over the last 7 days',
    },
    decisions: (n: number) => `Needs a decision · ${n}`,
    progressHeading: 'Project progress',
    empty: 'No active projects yet.',
    activePathNote: (taskText: string | undefined) =>
      `Current research path${taskText === undefined ? '' : ` · Task: ${taskText}`}`,
    /** Suffix after the first in-progress node's label when several nodes are active at once. */
    activeNodesMore: (n: number) => `+${n} more`,
    focusWithActiveTasks: (label: string, n: number) =>
      `${label} · ${n} ${pluralEn(n, { one: 'active task', other: 'active tasks' })}`,
    noRecentRecord: 'No research record yet',
    waitingForAgent: 'Waiting for an agent update',
    recentHeading: 'Recent progress',
    eventKind: 'Progress',
    upcomingHeading: 'Upcoming milestones',
    hideHistory: 'Hide finished and shelved projects',
    showHistory: 'Show finished and shelved projects',
    historyProjects: 'History',
    milestonePopTitle: (isNew: boolean, date: string) => `${isNew ? 'New milestone' : 'Edit milestone'} · ${date}`,
    taskWindowMovedHours: (slots: number, hours: number) =>
      `Task moved ${slots > 0 ? 'later' : 'earlier'} by ${hours} ${pluralEn(hours, { one: 'hour', other: 'hours' })}`,
  },
  list: {
    title: (n: number) => `Projects · ${n}`,
    create: 'New project',
    sort: 'Sort',
    sortPriority: 'By priority',
    sortMilestone: 'By next milestone',
    renameTitle: 'Rename project',
    rename: 'Rename',
    renamed: 'Renamed',
    statusChangedTo: (status: string) => `Marked as ${status}`,
    groupHeading: (status: string, n: number) => `${status} · ${n}`,
    createdNote: 'Project created · added to Overview',
    createdFeedNote: (name: string) => `Created project “${name}” and added it to Overview.`,
  },
  panel: {
    milestoneOn: (date: string) => `Milestone · ${date}`,
    dueToday: 'Today',
    dueInDays: (n: number) => `In ${n} ${pluralEn(n, { one: 'day', other: 'days' })}`,
    noUpcomingMilestone: 'No upcoming milestone',
    focusUndefined: 'Not set yet',
    recentProgressLabel: 'Recent progress',
    noRecords: 'No research updates yet.',
    staleAlert: (n: number) => `No progress for ${n} ${pluralEn(n, { one: 'day', other: 'days' })}`,
    paperCount: (n: number) =>
      (n === 0 ? 'No linked papers yet.' : `${n} linked ${pluralEn(n, { one: 'paper', other: 'papers' })}`),
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
    editTime: 'Edit time',
  },
} satisfies typeof zh
