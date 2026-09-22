import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { JobsStatus } from '../../shared/contract.js'
import { jobs } from '../ipc.js'

const POLL_MS = 1000
export const JobsContext = createContext<JobsStatus | null>(null)

/** Polls Core background status and bumps vault consumers after a background write. */
export function useJobsPoll(bump: () => void): JobsStatus | null {
  const [status, setStatus] = useState<JobsStatus | null>(null)
  const writes = useRef<number | null>(null)
  useEffect(() => {
    let alive = true
    const tick = () => {
      void jobs.status().then((next) => {
        if (!alive) return
        if (writes.current !== null && writes.current !== next.writes) bump()
        writes.current = next.writes
        setStatus((held) => (JSON.stringify(held) === JSON.stringify(next) ? held : next))
      })
    }
    tick()
    const timer = window.setInterval(tick, POLL_MS)
    return () => { alive = false; window.clearInterval(timer) }
  }, [bump])
  return status
}

/** Returns the latest background status from the shell. */
export function useJobs(): JobsStatus | null {
  return useContext(JobsContext)
}
