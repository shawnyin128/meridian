import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHECK_EVERY_MS, createUpdater, FIRST_CHECK_MS, RETRY_AFTER_ERROR_MS, TICK_MS, type InstallRoute, type UpdateFeed,
} from './updater.js'
import type { SelfUpdate } from './mac-self-update.js'

class FakeFeed extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = true
  checks = 0
  installs: [boolean, boolean][] = []
  checkForUpdates = () => { this.checks += 1; this.emit('checking-for-update'); return Promise.resolve(null) }
  quitAndInstall = (isSilent: boolean, isForceRunAfter: boolean) => { this.installs.push([isSilent, isForceRunAfter]) }
}

function setup({ supported = true, route = { kind: 'feed' } as InstallRoute } = {}) {
  const feed = new FakeFeed()
  let clock = Date.parse('2026-09-22T00:00:00Z')
  const changes: string[] = []
  const updater = createUpdater({
    feed: feed as unknown as UpdateFeed, current: '0.0.3', supported, route,
    now: () => clock, onChange: (status) => changes.push(status.phase),
  })
  return { feed, updater, changes, advance: (ms: number) => { clock += ms } }
}

afterEach(() => { vi.useRealTimers() })

describe('createUpdater', () => {
  it('downloads a newer release in place and installs it silently, then reopens, only once it is ready', () => {
    const { feed, updater } = setup()
    updater.install()
    expect(feed.installs).toEqual([])

    updater.check()
    feed.emit('update-available', { version: '0.0.4' })
    feed.emit('download-progress', { percent: 41.6 })
    expect(updater.status()).toMatchObject({ phase: 'downloading', version: '0.0.4', percent: 42, current: '0.0.3' })
    updater.install()
    expect(feed.installs).toEqual([])

    feed.emit('update-downloaded', { version: '0.0.4' })
    expect(updater.status()).toMatchObject({ phase: 'ready', version: '0.0.4' })
    updater.check()
    expect(feed.checks).toBe(1)
    updater.install()
    expect(feed.installs).toEqual([[true, true]])
  })

  it('reports a release it cannot install in place as available with its download page', () => {
    const { feed, updater } = setup({ route: { kind: 'page' } })
    expect(feed.autoDownload).toBe(false)
    expect(feed.autoInstallOnAppQuit).toBe(false)
    updater.check()
    feed.emit('update-available', { version: '0.0.4' })
    expect(updater.status()).toMatchObject({
      phase: 'available', version: '0.0.4', url: 'https://github.com/shawnyin128/meridian/releases/tag/v0.0.4',
    })
  })

  it('downloads a release itself and relaunches into it when the App replaces its own bundle', async () => {
    let finish: () => void = () => {}
    let progress: (percent: number) => void = () => {}
    const self = {
      downloads: [] as string[], installs: 0,
      download(release, onProgress) {
        self.downloads.push(release.version)
        progress = onProgress
        return new Promise<void>((done) => { finish = done })
      },
      install() { self.installs += 1 },
    } satisfies SelfUpdate & { downloads: string[]; installs: number }
    const { feed, updater } = setup({ route: { kind: 'self', self } })
    expect(feed.autoDownload).toBe(false)
    expect(feed.autoInstallOnAppQuit).toBe(false)

    updater.check()
    feed.emit('update-available', { version: '0.0.15003', files: [] })
    expect(self.downloads).toEqual(['0.0.15003'])
    progress(57.4)
    expect(updater.status()).toMatchObject({ phase: 'downloading', version: '0.0.15.3', percent: 57 })
    updater.install()
    expect(self.installs).toBe(0)

    finish()
    await Promise.resolve()
    expect(updater.status()).toMatchObject({ phase: 'ready', version: '0.0.15.3' })
    updater.install()
    expect(self.installs).toBe(1)
    expect(feed.installs).toEqual([])
  })

  it('reports a failed self download as an error and lets the user check again', async () => {
    const self: SelfUpdate = {
      download: () => Promise.reject(new Error('Meridian-0.0.15.3-arm64.zip does not match the checksum its release lists')),
      install: () => { throw new Error('install must not run') },
    }
    const { feed, updater } = setup({ route: { kind: 'self', self } })
    updater.check()
    feed.emit('update-available', { version: '0.0.15003', files: [] })
    await Promise.resolve()
    await Promise.resolve()
    expect(updater.status()).toMatchObject({
      phase: 'error', message: 'Meridian-0.0.15.3-arm64.zip does not match the checksum its release lists',
    })
    updater.install()
    updater.check()
    expect(feed.checks).toBe(2)
  })

  it('records when a check finished, keeps the error, and lets the user check again', () => {
    const { feed, updater } = setup()
    expect(updater.status().checkedAt).toBeUndefined()
    updater.check()
    feed.emit('error', new Error('Cannot find latest.yml: HttpError: 404 \nHeaders: {"server": "github.com"}\n    at createHttpError'))
    expect(updater.status()).toMatchObject({
      phase: 'error', message: 'Cannot find latest.yml: HttpError: 404', checkedAt: '2026-09-22T00:00:00.000Z',
    })
    updater.check()
    feed.emit('update-not-available', { version: '0.0.3' })
    expect(feed.checks).toBe(2)
    expect(updater.status().phase).toBe('latest')
  })

  it('never checks when the build has no update feed', () => {
    const { feed, updater } = setup({ supported: false })
    updater.check()
    expect(feed.checks).toBe(0)
    expect(updater.status()).toEqual({ phase: 'unsupported', current: '0.0.3' })
  })

  it('checks shortly after start and then every six hours', () => {
    vi.useFakeTimers()
    const { feed, updater, advance } = setup()
    const stop = updater.arm()
    vi.advanceTimersByTime(FIRST_CHECK_MS)
    expect(feed.checks).toBe(1)
    feed.emit('update-not-available', { version: '0.0.3' })

    advance(CHECK_EVERY_MS - TICK_MS)
    vi.advanceTimersByTime(TICK_MS * 4)
    expect(feed.checks).toBe(1)
    advance(TICK_MS)
    vi.advanceTimersByTime(TICK_MS)
    expect(feed.checks).toBe(2)
    stop()
  })

  it('retries a failed check an hour later instead of the next day', () => {
    vi.useFakeTimers()
    const { feed, updater, advance } = setup()
    const stop = updater.arm()
    vi.advanceTimersByTime(FIRST_CHECK_MS)
    feed.emit('error', new Error('offline'))

    advance(RETRY_AFTER_ERROR_MS - 1)
    vi.advanceTimersByTime(TICK_MS)
    expect(feed.checks).toBe(1)
    advance(1)
    vi.advanceTimersByTime(TICK_MS)
    expect(feed.checks).toBe(2)
    stop()
  })
})
