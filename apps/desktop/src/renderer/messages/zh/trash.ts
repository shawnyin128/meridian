/** Trash screen copy. */
export const trash = {
  title: '垃圾桶',
  kinds: {
    inbox: '论文推送', later: '稍后阅读', paper: '论文', project: '项目', idea: '想法', chat: '对话', attachment: '附件',
  },
  autoClear: (days: number) => `${days} 天后自动清除`,
  daysLeft: (days: number) => `${days} 天`,
  projectGone: '项目已删除',
  paperTaken: '库中已有同名论文',
  chatTaken: '论文已有新的对话',
  clear: '清空垃圾桶',
  confirmClear: '清空垃圾桶？',
  confirmClearDescription: (count: number) => `${count} 项不能恢复`,
  confirmClearLabel: '确认清空',
  confirmPurge: (title: string) => `彻底删除「${title}」？`,
  confirmPurgeLabel: '彻底删除',
} satisfies Record<string, unknown>
