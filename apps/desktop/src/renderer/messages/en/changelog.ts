import { pluralEn } from '../../lib/plural.js'
import { changelog as zh } from '../zh/changelog.js'

/** English counterpart of `zh/changelog`. `satisfies` makes a missing, extra or re-parameterised key a compile error. */
export const changelog = {
  title: 'Recent changes',
  unarchivedHeading: 'Current',
  archivedHeading: 'Archived',
  conflictsHeading: 'Conflicts',
  keepMine: 'Keep this device’s',
  keepTheirs: (device: string) => `Keep ${device}’s`,
  archiveAll: 'Archive all',
  clearArchived: 'Clear archived',
  confirmClearArchived: (count: number) =>
    `Clear ${count} archived ${pluralEn(count, { one: 'record', other: 'records' })}?`,
  confirmClearArchivedLoss: 'Their undo history goes too',
  confirmClearArchivedLabel: 'Clear archived',
  state: { undone: 'Undone', notUndoable: 'Cannot be undone' },
  proposalSource: { notes: 'Notes', lab: 'Lab' },
  confirmDelete: 'Delete this change record?',
  confirmDeleteLoss: 'Its undo history goes too',
  confirmDeleteLabel: 'Delete',
} satisfies typeof zh
