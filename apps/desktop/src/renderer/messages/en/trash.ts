import { pluralEn } from '../../lib/plural.js'
import { trash as zh } from '../zh/trash.js'

/** English counterpart of `zh/trash`. `satisfies` makes a missing, extra or re-parameterised key a compile error. */
export const trash = {
  title: (count: number) => `Trash · ${count}`,
  empty: 'Trash is empty.',
  kinds: {
    inbox: 'Inmail', paper: 'Papers', project: 'Projects', idea: 'Ideas', attachment: 'Attachments',
  },
  autoClear: (days: number) => `Deletes automatically in ${days} ${pluralEn(days, { one: 'day', other: 'days' })}`,
  retentionNote: (days: number) =>
    `Deleted items stay here for ${days} ${pluralEn(days, { one: 'day', other: 'days' })}, then they are cleared automatically.`,
  restored: (title: string) => `Restored “${title}”`,
  purged: 'Deleted permanently',
  clear: 'Empty trash',
  confirmClear: (count: number) =>
    `Empty the trash? ${count} ${pluralEn(count, { one: 'item', other: 'items' })} will be deleted permanently and cannot be recovered.`,
  confirmClearLabel: 'Empty trash',
  cleared: 'Trash emptied',
} satisfies typeof zh
