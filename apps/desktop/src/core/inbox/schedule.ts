import type { WatchFetcher } from './fetch.js'

export const FETCH_EVERY_MS = 6 * 3_600_000
export const DISCOVER_EVERY_MS = 24 * 3_600_000
export const RETRY_AFTER_MS = 30 * 60_000
export const TICK_MS = 10 * 60_000
export const FIRST_TICK_MS = 15_000

/** Returns whether a job last completed at `checkedAt` is due again `every` later, at most once per RETRY_AFTER_MS of attempts. */
export function fetchDue(
  now: number, checkedAt: number | null, attemptedAt: number | null, every = FETCH_EVERY_MS,
): boolean {
  return (checkedAt === null || now - checkedAt >= every)
    && (attemptedAt === null || now - attemptedAt >= RETRY_AFTER_MS)
}

/**
 * Asks `due` FIRST_TICK_MS after arming and every TICK_MS after that, passing the time of the last run
 * this schedule started, and starts `run` whenever it answers yes. Returns the stop function.
 */
function armSchedule(
  due: (now: number, attemptedAt: number | null) => boolean, run: () => Promise<unknown>, now: () => number,
): () => void {
  let attemptedAt: number | null = null
  const tick = (): void => {
    if (!due(now(), attemptedAt)) return
    attemptedAt = now()
    void run()
  }
  const first = setTimeout(tick, FIRST_TICK_MS)
  const every = setInterval(tick, TICK_MS)
  return () => {
    clearTimeout(first)
    clearInterval(every)
  }
}

/** Arms the six-hour watch schedule and returns its stop function. */
export function armFetchSchedule(fetcher: WatchFetcher, now: () => number): () => void {
  return armSchedule((at, attemptedAt) => {
    const status = fetcher.status()
    return status.state !== 'checking' && fetchDue(at, status.checkedAt, attemptedAt)
  }, () => fetcher.run(), now)
}

/**
 * Arms the daily discovery schedule and returns its stop function. `refreshedAt` gives the last refresh
 * time of every project discovery can refresh, null for one never refreshed; discovery runs when one of
 * them is due under DISCOVER_EVERY_MS and no discovery is `running`.
 */
export function armDiscoverySchedule(discovery: {
  running(): boolean; refreshedAt(): (number | null)[]; run(): Promise<unknown>
}, now: () => number): () => void {
  return armSchedule((at, attemptedAt) => !discovery.running() && discovery.refreshedAt().some((refreshedAt) => (
    fetchDue(at, refreshedAt, attemptedAt, DISCOVER_EVERY_MS)
  )), () => discovery.run(), now)
}
