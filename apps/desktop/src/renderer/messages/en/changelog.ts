import { pluralEn } from '../../lib/plural.js'
import { changelog as zh } from '../zh/changelog.js'

/** English counterpart of `zh/changelog`. `satisfies` makes a missing, extra or re-parameterised key a compile error. */
export const changelog = {
  title: (count: number) => `Recent Changes · ${count}`,
  unarchivedHeading: 'Current',
  archivedHeading: 'Archived',
  empty: 'No new changes yet',
  archiveAll: 'Archive all',
  clearArchived: 'Clear archived',
  confirmClearArchived: (count: number) =>
    `Clear ${count} archived ${pluralEn(count, { one: 'record', other: 'records' })}?`,
  confirmClearArchivedDescription: 'This also deletes their undo history.',
  confirmClearArchivedLabel: 'Clear archived',
  state: { undone: 'Undone', notUndoable: 'Cannot be undone' },
  proposalSource: { notes: 'Notes', lab: 'Lab' },
  confirmDelete: 'Delete this change record?',
  confirmDeleteDescription: 'This also removes its undo history.',
  confirmDeleteLabel: 'Delete',
  undoneNote: 'Undone',
  archivedNote: (count: number) => `Archived ${count} ${pluralEn(count, { one: 'record', other: 'records' })}`,
  deletedNote: 'Change deleted',
  clearedArchivedNote: (count: number) =>
    `Cleared ${count} archived ${pluralEn(count, { one: 'record', other: 'records' })}`,
} satisfies typeof zh
