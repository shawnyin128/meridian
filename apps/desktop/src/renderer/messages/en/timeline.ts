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
  milestoneTitle: (date: string, title: string, note: string) => `${date} ${title}${note === '' ? '' : ` · ${note}`}`,
  taskTitle: (title: string, range: string, window: string, priority: string, note: string) =>
    `${title} · ${range}${window === '' ? '' : ` · ${window}`} · ${priority}${note === '' ? '' : ` · ${note}`}`,
  fold: {
    collapse: (project: string) => `Collapse tasks of ${project}`,
    expand: (project: string) => `Expand tasks of ${project}`,
    hidden: (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'} hidden`,
  },
} satisfies typeof zh
