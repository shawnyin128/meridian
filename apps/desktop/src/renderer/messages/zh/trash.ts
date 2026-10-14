/** Trash screen copy. */
export const trash = {
  title: (count: number) => `垃圾桶 · ${count}`,
  empty: '垃圾桶是空的。',
  kinds: {
    inbox: '论文推送', paper: '论文', project: '项目', idea: '想法', attachment: '附件',
  },
  autoClear: (days: number) => `${days} 天后自动清除`,
  retentionNote: (days: number) => `删除的内容在这里保留 ${days} 天，到期自动清除。`,
  restored: (title: string) => `已恢复「${title}」`,
  purged: '已彻底删除',
  clear: '清空垃圾桶',
  confirmClear: (count: number) => `清空垃圾桶？${count} 项将被彻底删除，不可恢复。`,
  confirmClearLabel: '确认清空',
  confirmPurge: (title: string) => `彻底删除「${title}」？删除后不可恢复。`,
  confirmPurgeLabel: '彻底删除',
  cleared: '已清空垃圾桶',
} satisfies Record<string, unknown>
