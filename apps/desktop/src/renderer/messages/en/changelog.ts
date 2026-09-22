import { pluralEn } from '../../lib/plural.js'
import { changelog as zh } from '../zh/changelog.js'

/** English counterpart of `zh/changelog`. `satisfies` makes a missing, extra or re-parameterised key a compile error. */
export const changelog = {
  title: (count: number) => `Recent Changes · ${count}`,
  unarchivedHeading: 'Current',
  archivedHeading: 'Archived',
  empty: 'All caught up.',
  archiveAll: 'Archive all',
  clearArchived: 'Clear archived',
  confirmClearArchived: (count: number) =>
    `Clear ${count} archived ${pluralEn(count, { one: 'record', other: 'records' })}? This also deletes their undo history. Your Wiki content will not change.`,
  confirmClearArchivedLabel: 'Clear archived',
  state: { undone: 'Undone', openToSee: 'Open to review changes', notUndoable: 'Cannot be undone' },
  confirmDelete: 'Delete this change record? This also removes its undo history. Your Wiki content will not change.',
  confirmDeleteLabel: 'Delete',
  undoneNote: 'Undone · restored the previous version',
  archivedNote: (count: number) => `Archived ${count} ${pluralEn(count, { one: 'record', other: 'records' })}`,
  deletedNote: 'Change deleted',
  clearedArchivedNote: (count: number) =>
    `Cleared ${count} archived ${pluralEn(count, { one: 'record', other: 'records' })}`,
} satisfies typeof zh
