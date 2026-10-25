/** Later (read-later queue) screen copy. */
export const later = {
  title: '稍后阅读',
  groupBy: '分组方式',
  modes: { time: '按时间', src: '按来源' },
  actions: {
    removeFrom: '移出',
  },
  removed: (title: string) => `已移出稍后阅读「${title}」`,
} satisfies Record<string, unknown>
