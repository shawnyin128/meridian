import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { errorLabel } from '../lib/failure-label.js'
import { useMessages } from '../messages/useMessages.js'
import { useNotice, useVaultRevision } from '../shell/AppShell.js'

type WriteOpts = { note?: ReactNode }

/**
 * Finishes a vault write: once `op` resolves, bumps the vault revision, shows `note` as a success
 * notice when `note` is given, and returns true. When the write is rejected, or `bump` throws, shows
 * the label of its reason as a refusal notice and returns false. To use the write's resolved
 * value, or to change state before this finishes, chain that step with `.then` before passing the
 * promise here.
 */
export function useVaultWrite(): (op: Promise<unknown>, opts?: WriteOpts) => Promise<boolean> {
  const m = useMessages()
  const notice = useNotice()
  const { bump } = useVaultRevision()
  return useCallback((op: Promise<unknown>, opts: WriteOpts = {}) => op.then(() => {
    bump()
    if (opts.note !== undefined) notice.success(opts.note)
    return true
  }).catch((e: unknown) => {
    notice.refusal(errorLabel(m, e))
    return false
  }), [bump, notice, m])
}
