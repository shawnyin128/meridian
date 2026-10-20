import { useMemo } from 'react'
import type { RecordedChange, TrashedEntry } from '../../shared/contract.js'
import type { NoticeAction } from '../components/Notice.js'
import { changelog, trash } from '../ipc.js'
import { useMessages } from '../messages/useMessages.js'
import { useVaultWrite } from './useVaultWrite.js'

/**
 * The Undo a write's notice offers. `change` undoes the change entry the write recorded, as Recent
 * Changes undoes it; `restore` puts back the trash entries the write created, as the trash restores
 * them. Either reports its outcome, or Core's refusal, through the notice.
 */
export function useUndo(): {
  change: (written: RecordedChange) => NoticeAction
  restore: (entries: readonly TrashedEntry[]) => NoticeAction
} {
  const m = useMessages()
  const write = useVaultWrite()
  return useMemo(() => ({
    change: ({ change }: RecordedChange): NoticeAction => ({
      label: m.common.undo,
      onAction: () => { void write(changelog.undo(change), { note: m.changelog.undoneNote }) },
    }),
    restore: (entries: readonly TrashedEntry[]): NoticeAction => ({
      label: m.common.undo,
      onAction: () => {
        void write(Promise.all(entries.map((entry) => trash.restore(entry.trash))), { note: m.changelog.undoneNote })
      },
    }),
  }), [m, write])
}
