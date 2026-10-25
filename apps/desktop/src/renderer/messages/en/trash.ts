import { pluralEn } from '../../lib/plural.js'
import { trash as zh } from '../zh/trash.js'

/** English counterpart of `zh/trash`. `satisfies` makes a missing, extra or re-parameterised key a compile error. */
export const trash = {
  title: 'Trash',
  kinds: {
    inbox: 'Inmail', later: 'Read Later', paper: 'Papers', project: 'Projects', idea: 'Ideas', chat: 'Chats',
    attachment: 'Attachments',
  },
  autoClear: (days: number) => `Deletes automatically in ${days} ${pluralEn(days, { one: 'day', other: 'days' })}`,
  daysLeft: (days: number) => `${days} ${pluralEn(days, { one: 'day', other: 'days' })}`,
  projectGone: 'Project deleted',
  paperTaken: 'Same name in library',
  chatTaken: 'Paper has a new chat',
  restored: (title: string) => `Restored “${title}”`,
  purged: 'Deleted permanently',
  clear: 'Empty trash',
  confirmClear: 'Empty the trash?',
  confirmClearDescription: (count: number) => `${count} ${pluralEn(count, { one: 'item', other: 'items' })} cannot be recovered`,
  confirmClearLabel: 'Empty trash',
  confirmPurge: (title: string) => `Delete “${title}” permanently?`,
  confirmPurgeLabel: 'Delete permanently',
  cleared: 'Trash emptied',
} satisfies typeof zh
