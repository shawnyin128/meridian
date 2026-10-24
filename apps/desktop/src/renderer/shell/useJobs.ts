import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { JobsStatus } from '../../shared/contract.js'
import { jobs } from '../ipc.js'

const POLL_MS = 1000
export const JobsContext = createContext<JobsStatus | null>(null)

/**
 * Polls Core background status and bumps vault consumers after a background write. `refresh` asks
 * Core for the status at once and keeps its identity across renders.
 */
export function useJobsPoll(bump: () => void): { status: JobsStatus | null; refresh: () => void } {
  const [status, setStatus] = useState<JobsStatus | null>(null)
  const writes = useRef<number | null>(null)
  const alive = useRef(false)
  const refresh = useCallback(() => {
    void jobs.status().then((next) => {
      if (!alive.current) return
      if (writes.current !== null && writes.current !== next.writes) bump()
      writes.current = next.writes
      setStatus((held) => (JSON.stringify(held) === JSON.stringify(next) ? held : next))
    })
  }, [bump])
  useEffect(() => {
    alive.current = true
    refresh()
    const timer = window.setInterval(refresh, POLL_MS)
    return () => { alive.current = false; window.clearInterval(timer) }
  }, [refresh])
  return { status, refresh }
}

/** Returns the latest background status from the shell. */
export function useJobs(): JobsStatus | null {
  return useContext(JobsContext)
}
