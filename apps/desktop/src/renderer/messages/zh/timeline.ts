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
  bar: {
    clickHint: '点击空白处新建里程碑',
  },
  milestoneTitle: (date: string, title: string, note: string) =>
    `${date} ${title}${note === '' ? '' : ` · ${note}`} · 拖动改期，点击定位`,
  taskTitle: (range: string, window: string, priority: string, note: string) =>
    `${range}${window === '' ? '' : ` · ${window}`} · ${priority}${note === '' ? '' : ` · ${note}`} · 拖动改期，点击定位`,
  stub: {
    left: '左',
    right: '右',
    clickToLocate: (range: string, title: string, side: string) => `${range} ${title} · 在窗口${side}侧外，点击定位`,
  },
} satisfies Record<string, unknown>
