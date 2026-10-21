import type { RecordedChange, TrashedEntry } from '../shared/contract.js'
import type { VaultStore } from './vault.js'

/**
 * Runs `write`, a write the change log records, and returns its result with the id of the change
 * entry it recorded: the entry `undoChange` takes to undo exactly that write. `write` runs
 * synchronously, so no other write lands between it and the read after it. Throws if the write
 * recorded no entry.
 */
export function recordChange<T>(
  store: Pick<VaultStore, 'listChanges'>, write: () => T,
): { result: T } & RecordedChange {
  const before = store.listChanges()[0]?.id
  const result = write()
  const change = store.listChanges()[0]?.id
  if (change === undefined || change === before) throw new Error('这次写入没有记进最近变动')
  return { result, change }
}

/**
 * Runs `write`, a write that moves one item into the trash without a change entry, and returns the id
 * of the trash entry it created: the entry `restoreTrash` takes to put that item back. Throws if the
 * trash holds no new entry after the write.
 */
export function trashedEntry(store: Pick<VaultStore, 'listTrash'>, write: () => void): TrashedEntry {
  const before = store.listTrash()[0]?.id
  write()
  const trash = store.listTrash()[0]?.id
  if (trash === undefined || trash === before) throw new Error('这次写入没有在垃圾桶里多出一条')
  return { trash }
}
