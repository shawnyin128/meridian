import { useCallback } from 'react'
import type { ReactNode } from 'react'
import type { NoticeAction } from '../components/Notice.js'
import { useNotice, useVaultRevision } from '../shell/AppShell.js'

type WriteOpts<T> = { note?: ReactNode; action?: (result: T) => NoticeAction }

/**
 * Finishes a vault write: once `op` resolves, bumps the vault revision, shows `note` as a success
 * notice when `note` is given, offering the action `action` builds from the write's resolved value,
 * and returns true. When the write is rejected, or `bump` throws, shows the original error message
 * as a refusal notice and returns false. To change state before this finishes, chain that step with
 * `.then` before passing the promise here.
 */
export function useVaultWrite(): <T>(op: Promise<T>, opts?: WriteOpts<T>) => Promise<boolean> {
  const notice = useNotice()
  const { bump } = useVaultRevision()
  return useCallback(<T,>(op: Promise<T>, opts: WriteOpts<T> = {}) => op.then((result) => {
    bump()
    if (opts.note !== undefined) notice.success(opts.note, opts.action?.(result))
    return true
  }).catch((e: Error) => {
    notice.refusal(e.message)
    return false
  }), [bump, notice])
}
