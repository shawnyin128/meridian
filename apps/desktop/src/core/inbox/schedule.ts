import type { WatchFetcher } from './fetch.js'

export const FETCH_EVERY_MS = 6 * 3_600_000
export const RETRY_AFTER_MS = 30 * 60_000
export const TICK_MS = 10 * 60_000
export const FIRST_TICK_MS = 15_000

/** Returns whether a full watch fetch is due. */
export function fetchDue(now: number, checkedAt: number | null, attemptedAt: number | null): boolean {
  return (checkedAt === null || now - checkedAt >= FETCH_EVERY_MS)
    && (attemptedAt === null || now - attemptedAt >= RETRY_AFTER_MS)
}

/** Arms the six-hour watch schedule and returns its stop function. */
export function armFetchSchedule(fetcher: WatchFetcher, now: () => number): () => void {
  let attemptedAt: number | null = null
  const tick = (): void => {
    const status = fetcher.status()
    if (status.state === 'checking' || !fetchDue(now(), status.checkedAt, attemptedAt)) return
    attemptedAt = now()
    void fetcher.run()
  }
  const first = setTimeout(tick, FIRST_TICK_MS)
  const every = setInterval(tick, TICK_MS)
  return () => {
    clearTimeout(first)
    clearInterval(every)
  }
}
