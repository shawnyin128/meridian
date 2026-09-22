import { useEffect, useState } from 'react'
import type { AppUpdateStatus } from '../../shared/app-update.js'
import { appUpdates } from '../ipc.js'

/** The app's current self-update status, kept live; null until the first read returns. */
export function useAppUpdate(): AppUpdateStatus | null {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null)
  useEffect(() => {
    let live = true
    void appUpdates.status().then((next) => { if (live) setStatus(next) })
    const stop = appUpdates.onChange(setStatus)
    return () => {
      live = false
      stop()
    }
  }, [])
  return status
}
