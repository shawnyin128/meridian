import type { AppUpdatePhase, AppUpdateStatus, UpdateFailure } from '../shared/app-update.js'
import { releaseUrl } from '../shared/app-update.js'
import { displayVersion } from '../shared/app-version.js'
import type { ReleaseInfo, SelfUpdate } from './mac-self-update.js'

export const CHECK_EVERY_MS = 6 * 3_600_000
export const TICK_MS = 3_600_000
/** A failed check, such as one made while offline, is retried after this long rather than a day later. */
export const RETRY_AFTER_ERROR_MS = 3_600_000
export const FIRST_CHECK_MS = 10_000

/** The part of electron-updater's AppUpdater this module drives. */
export interface UpdateFeed {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  checkForUpdates(): Promise<unknown>
  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void
  on(event: 'checking-for-update', listener: () => void): unknown
  on(event: 'update-available', listener: (info: ReleaseInfo) => void): unknown
  on(event: 'update-not-available' | 'update-downloaded', listener: (info: { version: string }) => void): unknown
  on(event: 'download-progress', listener: (info: { percent: number }) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
}

export interface Updater {
  status(): AppUpdateStatus
  /** Starts a check unless one is running or an update is already downloading or ready. */
  check(): void
  /** Quits, installs a downloaded update without the installer's wizard, and reopens the app; does nothing unless the phase is `ready`. */
  install(): void
  /** Checks shortly after start and then every six hours; returns the stop function. */
  arm(): () => void
}

/**
 * Why an update check or download failed: a timeout or no network as Chromium's network layer names
 * it, an HTTP status or a release-feed error from electron-updater, a file system call, or anything else.
 */
export function updateFailure(error: unknown): UpdateFailure {
  if (!(error instanceof Error)) return 'unknown'
  if (error.message.includes('net::ERR_TIMED_OUT') || error.message.includes('net::ERR_CONNECTION_TIMED_OUT')) return 'timeout'
  if (error.message.includes('net::ERR_')) return 'unavailable'
  const { statusCode, code, syscall } = error as Error & { statusCode?: unknown; code?: unknown; syscall?: unknown }
  if (typeof statusCode === 'number' || (typeof code === 'string' && code.startsWith('ERR_UPDATER_'))) return 'server'
  if (typeof syscall === 'string') return 'write'
  return 'unknown'
}

/**
 * How a found release is installed: the feed downloads and installs it (`feed`), the App downloads it
 * and replaces its own bundle (`self`, macOS without a signing identity), or the user downloads it
 * from its release page (`page`, where the App cannot replace itself).
 */
export type InstallRoute = { kind: 'feed' } | { kind: 'self'; self: SelfUpdate } | { kind: 'page' }

/**
 * Tracks self-update state for the running app and installs a found release by `route`. `onChange`
 * receives every new status; `log` receives the text of every failure.
 */
export function createUpdater({ feed, current, supported, route, now, onChange, log }: {
  feed: UpdateFeed
  current: string
  supported: boolean
  route: InstallRoute
  now: () => number
  onChange: (status: AppUpdateStatus) => void
  log: (line: string) => void
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
  // electron-updater appends response headers and a stack to the message; the first line names the failure.
  const fail = (error: unknown): void => {
    log(`[main] Update failed: ${error instanceof Error ? error.message.split('\n', 1)[0]!.trim() : String(error)}`)
    set({ phase: 'error', reason: updateFailure(error) }, true)
  }

  feed.autoDownload = route.kind === 'feed'
  feed.autoInstallOnAppQuit = route.kind === 'feed'
  feed.on('checking-for-update', () => set({ phase: 'checking' }))
  feed.on('update-not-available', () => set({ phase: 'latest' }, true))
  feed.on('update-available', (info) => {
    const version = displayVersion(info.version)
    if (route.kind === 'page') {
      set({ phase: 'available', version, url: releaseUrl(info.version) }, true)
      return
    }
    set({ phase: 'downloading', version, percent: 0 }, true)
    if (route.kind === 'self') {
      route.self.download(info, (percent) => {
        if (phase.phase === 'downloading') set({ ...phase, percent: Math.round(percent) })
      }).then(
        () => set({ phase: 'ready', version }),
        fail,
      )
    }
  })
  feed.on('download-progress', (info) => {
    if (phase.phase === 'downloading') set({ ...phase, percent: Math.round(info.percent) })
  })
  feed.on('update-downloaded', (info) => set({ phase: 'ready', version: displayVersion(info.version) }))
  feed.on('error', fail)

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
      if (phase.phase !== 'ready') return
      if (route.kind === 'self') route.self.install()
      else feed.quitAndInstall(true, true)
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
