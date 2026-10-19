import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { useBanner, useToast, useVaultRevision } from '../shell/AppShell.js'

type WriteOpts = { note?: ReactNode; notify?: ((text: ReactNode) => void) | undefined }

/**
 * Finishes a vault write: once `op` resolves, bumps the vault revision, reports `note` through
 * `notify` (the confirmation banner by default) when `note` is given, and returns true. When the
 * write is rejected, or `bump` or `notify` throws, shows the original error message as a toast and
 * returns false. To use the write's resolved value, or to change state before this finishes, chain
 * that step with `.then` before passing the promise here.
 */
export function useVaultWrite(): (op: Promise<unknown>, opts?: WriteOpts) => Promise<boolean> {
  const banner = useBanner()
  const toast = useToast()
  const { bump } = useVaultRevision()
  return useCallback((op: Promise<unknown>, opts: WriteOpts = {}) => op.then(() => {
    bump()
    if (opts.note !== undefined) (opts.notify ?? banner)(opts.note)
    return true
  }).catch((e: Error) => {
    toast(e.message)
    return false
  }), [banner, bump, toast])
}
