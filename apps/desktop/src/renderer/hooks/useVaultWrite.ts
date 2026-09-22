import { useCallback } from 'react'
import { useBanner, useToast, useVaultRevision } from '../shell/AppShell.js'

type WriteOpts = { note?: string | undefined; notify?: ((text: string) => void) | undefined }

/**
 * The end of a library writing: written to auto-increment the full library version, use `notify` to report when `note` is not empty (default confirmation banner),
 * Return true; if the write is rejected, or `bump` or `notify` are thrown by themselves, the original error message will be reported as a toast and false will be returned.
 * If you want to use the written return value, or if you want to move the state before finishing, connect that step in `.then` before passing it here.
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
