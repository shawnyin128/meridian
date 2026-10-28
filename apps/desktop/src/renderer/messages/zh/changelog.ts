/** Change log screen copy. */
export const changelog = {
  title: '最近变动',
  unarchivedHeading: '未归档',
  archivedHeading: '已归档',
  conflictsHeading: '冲突',
  keepMine: '用本机的',
  keepTheirs: (device: string) => `用 ${device} 的`,
  archiveAll: '全部归档',
  clearArchived: '清空已归档',
  confirmClearArchived: (count: number) => `清空 ${count} 条已归档记录？`,
  confirmClearArchivedLoss: '撤销快照一并删除',
  confirmClearArchivedLabel: '确认清空',
  state: { undone: '已撤销', notUndoable: '无法撤销' },
  /** Where an agent's proposal came from, by the stored change source. */
  proposalSource: { notes: '笔记', lab: '实验' },
  confirmDelete: '删除这条变动记录？',
  confirmDeleteLoss: '这次变动不能再撤销',
  confirmDeleteLabel: '确认删除',
} satisfies Record<string, unknown>
