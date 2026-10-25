import { useCallback } from 'react'
import type { ReactNode } from 'react'
import type { NoticeAction } from '../components/Notice.js'
import { changelog } from '../ipc.js'
import { errorLabel } from '../lib/failure-label.js'
import { useMessages } from '../messages/useMessages.js'
import { useNotice, useVaultRevision } from '../shell/AppShell.js'
import { offerUndo } from '../shell/undo-offers.js'

type WriteOpts<T> = { note?: ReactNode; action?: ((result: T) => NoticeAction) | undefined }

/** The change entry a write's result names as the one it recorded, or null when it names none. */
function recordedChange(result: unknown): string | null {
  if (typeof result !== 'object' || result === null || !('change' in result)) return null
  return typeof result.change === 'string' ? result.change : null
}

/**
 * Finishes a vault write: once `op` resolves, bumps the vault revision, shows `note` as a success
 * notice when `note` is given, offering the action `action` builds from the write's resolved value,
 * and returns true. When the write's result names the change entry it recorded and the notice offers
 * no Undo of it, that Undo is still offered to ⌘Z, as the notice's would be. When the write is
 * rejected, or `bump` throws, shows the label of its reason as a refusal notice and returns false. To
 * change state before this finishes, chain that step with `.then` before passing the promise here.
 */
export function useVaultWrite(): <T>(op: Promise<T>, opts?: WriteOpts<T>) => Promise<boolean> {
  const m = useMessages()
  const notice = useNotice()
  const { bump } = useVaultRevision()
  return useCallback(function write<T>(op: Promise<T>, opts: WriteOpts<T> = {}): Promise<boolean> {
    return op.then((result) => {
      bump()
      const action = opts.note === undefined ? undefined : opts.action?.(result)
      if (opts.note !== undefined) notice.success(opts.note, action)
      const change = recordedChange(result)
      if (change !== null && action?.undoes !== true) {
        offerUndo(() => { void write(changelog.undo(change), { note: m.changelog.undoneNote }) })
      }
      return true
    }).catch((e: unknown) => {
      notice.refusal(errorLabel(m, e))
      return false
    })
  }, [bump, notice, m])
}
