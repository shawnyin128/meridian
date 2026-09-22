import { timeline as zh } from '../zh/timeline.js'

/** English counterpart of `zh/timeline`. */
export const timeline = {
  scaleGroup: 'Timeline range',
  scale: { day: 'Day', week: 'Week', month: 'Month' },
  prevPeriod: 'Previous period',
  nextPeriod: 'Next period',
  today: 'Today',
  currentTime: 'Current time',
  dayHeading: (date: string, weekday: string) => `${date} · ${weekday}`,
  weekdayCell: (weekday: string, day: number) => `${weekday} ${day}`,
  bar: {
    clickHint: 'Click an empty date to add a milestone',
  },
  milestoneTitle: (date: string, title: string, note: string) =>
    `${date} ${title}${note === '' ? '' : ` · ${note}`} · Drag to reschedule · Click to open`,
  taskTitle: (range: string, window: string, priority: string, note: string) =>
    `${range}${window === '' ? '' : ` · ${window}`} · ${priority}${note === '' ? '' : ` · ${note}`}`
    + ' · Drag to reschedule · Click to open',
  fold: {
    collapse: (project: string) => `Collapse tasks of ${project}`,
    expand: (project: string) => `Expand tasks of ${project}`,
    hidden: (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'} hidden`,
  },
  stub: {
    left: 'left',
    right: 'right',
    clickToLocate: (range: string, title: string, side: string) =>
      `${range} ${title} · Outside the visible range to the ${side} · Click to jump to it`,
  },
} satisfies typeof zh
