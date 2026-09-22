/** Change log screen copy. */
export const changelog = {
  title: (count: number) => `最近变动 · ${count}`,
  unarchivedHeading: '未归档',
  archivedHeading: '已归档',
  empty: '都看过了。',
  archiveAll: '全部归档',
  clearArchived: '清空已归档',
  confirmClearArchived: (count: number) =>
    `清空 ${count} 条已归档记录？对应的撤销快照也会被删除，知识内容本身不会改变。`,
  confirmClearArchivedLabel: '确认清空',
  state: { undone: '已撤销', openToSee: '点开看改了什么', notUndoable: '无法撤销' },
  confirmDelete: '删除这条变动记录？删除后不能再通过它撤销，知识内容本身不会改变。',
  confirmDeleteLabel: '确认删除',
  undoneNote: '已撤销 · 数据回到这一笔之前',
  archivedNote: (count: number) => `已归档 ${count} 条`,
  deletedNote: '已删除变动记录',
  clearedArchivedNote: (count: number) => `已清空 ${count} 条已归档记录`,
} satisfies Record<string, unknown>
