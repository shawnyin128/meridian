/** Trash screen copy. */
export const trash = {
  title: (count: number) => `垃圾桶 · ${count}`,
  empty: '还没有移入垃圾桶的内容',
  kinds: {
    inbox: '论文推送', later: '稍后阅读', paper: '论文', project: '项目', idea: '想法', attachment: '附件',
  },
  autoClear: (days: number) => `${days} 天后自动清除`,
  projectGone: '项目已删除',
  restored: (title: string) => `已恢复「${title}」`,
  purged: '已彻底删除',
  clear: '清空垃圾桶',
  confirmClear: '清空垃圾桶？',
  confirmClearDescription: (count: number) => `${count} 项将被彻底删除，不可恢复。`,
  confirmClearLabel: '确认清空',
  confirmPurge: (title: string) => `彻底删除「${title}」？`,
  confirmPurgeDescription: '删除后不可恢复。',
  confirmPurgeLabel: '彻底删除',
  cleared: '已清空垃圾桶',
} satisfies Record<string, unknown>
