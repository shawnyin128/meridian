/** Later (read-later queue) screen copy. */
export const later = {
  title: '稍后阅读',
  empty: '还没有稍后阅读的论文',
  groupBy: '分组方式',
  modes: { time: '按时间', src: '按来源' },
  actions: {
    downloading: '从 arXiv 下载中',
    removeFrom: '移出',
  },
  removed: (title: string) => `已移出稍后阅读「${title}」`,
} satisfies Record<string, unknown>
