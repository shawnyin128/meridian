import type { AppUpdatePhase, AppUpdateStatus } from '../shared/app-update.js'
import { releaseUrl } from '../shared/app-update.js'

export const CHECK_EVERY_MS = 24 * 3_600_000
export const TICK_MS = 3_600_000
/** A failed check, such as one made while offline, is retried after this long rather than a day later. */
export const RETRY_AFTER_ERROR_MS = 3_600_000
export const FIRST_CHECK_MS = 10_000

/** The part of electron-updater's AppUpdater this module drives. */
export interface UpdateFeed {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  checkForUpdates(): Promise<unknown>
  quitAndInstall(): void
  on(event: 'checking-for-update', listener: () => void): unknown
  on(event: 'update-available' | 'update-not-available' | 'update-downloaded', listener: (info: { version: string }) => void): unknown
  on(event: 'download-progress', listener: (info: { percent: number }) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
}

export interface Updater {
  status(): AppUpdateStatus
  /** Starts a check unless one is running or an update is already downloading or ready. */
  check(): void
  /** Quits and installs a downloaded update; does nothing unless the phase is `ready`. */
  install(): void
  /** Checks shortly after start and then once a day; returns the stop function. */
  arm(): () => void
}

/**
 * Tracks self-update state for the running app. When `installsInPlace` is false (macOS without a
 * signing identity) a found release is reported as `available` with its download page instead of
 * being downloaded. `onChange` receives every new status.
 */
export function createUpdater({ feed, current, supported, installsInPlace, now, onChange }: {
  feed: UpdateFeed
  current: string
  supported: boolean
  installsInPlace: boolean
  now: () => number
  onChange: (status: AppUpdateStatus) => void
}): Updater {
  let phase: AppUpdatePhase = supported ? { phase: 'idle' } : { phase: 'unsupported' }
  let checkedAt: number | undefined
  const status = (): AppUpdateStatus => ({
    ...phase, current, ...(checkedAt === undefined ? {} : { checkedAt: new Date(checkedAt).toISOString() }),
  })
  const set = (next: AppUpdatePhase, finished = false): void => {
    phase = next
    if (finished) checkedAt = now()
    onChange(status())
  }

  feed.autoDownload = installsInPlace
  feed.autoInstallOnAppQuit = installsInPlace
  feed.on('checking-for-update', () => set({ phase: 'checking' }))
  feed.on('update-not-available', () => set({ phase: 'latest' }, true))
  feed.on('update-available', (info) => set(installsInPlace
    ? { phase: 'downloading', version: info.version, percent: 0 }
    : { phase: 'available', version: info.version, url: releaseUrl(info.version) }, true))
  feed.on('download-progress', (info) => {
    if (phase.phase === 'downloading') set({ ...phase, percent: Math.round(info.percent) })
  })
  feed.on('update-downloaded', (info) => set({ phase: 'ready', version: info.version }))
  // electron-updater appends response headers and a stack to the message; the first line names the failure.
  feed.on('error', (error) => set({ phase: 'error', message: error.message.split('\n', 1)[0]!.trim() }, true))

  const busy = () => ['unsupported', 'checking', 'downloading', 'ready'].includes(phase.phase)
  const check = (): void => {
    if (busy()) return
    // Failures also arrive through the `error` event, which records them; the promise only repeats them.
    feed.checkForUpdates().catch(() => undefined)
  }

  return {
    status,
    check,
    install() {
      if (phase.phase === 'ready') feed.quitAndInstall()
    },
    arm() {
      if (!supported) return () => {}
      const tick = () => {
        const wait = phase.phase === 'error' ? RETRY_AFTER_ERROR_MS : CHECK_EVERY_MS
        if (checkedAt === undefined || now() - checkedAt >= wait) check()
      }
      const first = setTimeout(tick, FIRST_CHECK_MS)
      const every = setInterval(tick, TICK_MS)
      return () => {
        clearTimeout(first)
        clearInterval(every)
      }
    },
  }
}
