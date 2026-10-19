/** timeline screen copy. */
export const timeline = {
  scaleGroup: '时间线显示范围',
  scale: { day: '日', week: '周', month: '月' },
  prevPeriod: '上一个周期',
  nextPeriod: '下一个周期',
  today: '今天',
  currentTime: '当前时刻',
  dayHeading: (date: string, weekday: string) => `${date} · 周${weekday}`,
  weekdayCell: (weekday: string, day: number) => `周${weekday} ${day}`,
  milestoneTitle: (date: string, title: string, note: string) => `${date} ${title}${note === '' ? '' : ` · ${note}`}`,
  taskTitle: (title: string, range: string, window: string, priority: string, note: string) =>
    `${title} · ${range}${window === '' ? '' : ` · ${window}`} · ${priority}${note === '' ? '' : ` · ${note}`}`,
  fold: {
    collapse: (project: string) => `折叠「${project}」的任务`,
    expand: (project: string) => `展开「${project}」的任务`,
    hidden: (n: number) => `${n} 项任务已折叠`,
  },
} satisfies Record<string, unknown>
