import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHECK_EVERY_MS, createUpdater, FIRST_CHECK_MS, RETRY_AFTER_ERROR_MS, TICK_MS, type UpdateFeed,
} from './updater.js'

class FakeFeed extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = true
  checks = 0
  installs = 0
  checkForUpdates = () => { this.checks += 1; this.emit('checking-for-update'); return Promise.resolve(null) }
  quitAndInstall = () => { this.installs += 1 }
}

function setup({ supported = true, installsInPlace = true } = {}) {
  const feed = new FakeFeed()
  let clock = Date.parse('2026-09-22T00:00:00Z')
  const changes: string[] = []
  const updater = createUpdater({
    feed: feed as unknown as UpdateFeed, current: '0.0.3', supported, installsInPlace,
    now: () => clock, onChange: (status) => changes.push(status.phase),
  })
  return { feed, updater, changes, advance: (ms: number) => { clock += ms } }
}

afterEach(() => { vi.useRealTimers() })

describe('createUpdater', () => {
  it('downloads a newer release in place and installs it only once it is ready', () => {
    const { feed, updater } = setup()
    updater.install()
    expect(feed.installs).toBe(0)

    updater.check()
    feed.emit('update-available', { version: '0.0.4' })
    feed.emit('download-progress', { percent: 41.6 })
    expect(updater.status()).toMatchObject({ phase: 'downloading', version: '0.0.4', percent: 42, current: '0.0.3' })
    updater.install()
    expect(feed.installs).toBe(0)

    feed.emit('update-downloaded', { version: '0.0.4' })
    expect(updater.status()).toMatchObject({ phase: 'ready', version: '0.0.4' })
    updater.check()
    expect(feed.checks).toBe(1)
    updater.install()
    expect(feed.installs).toBe(1)
  })

  it('reports a release it cannot install in place as available with its download page', () => {
    const { feed, updater } = setup({ installsInPlace: false })
    expect(feed.autoDownload).toBe(false)
    expect(feed.autoInstallOnAppQuit).toBe(false)
    updater.check()
    feed.emit('update-available', { version: '0.0.4' })
    expect(updater.status()).toMatchObject({
      phase: 'available', version: '0.0.4', url: 'https://github.com/shawnyin128/meridian/releases/tag/v0.0.4',
    })
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

  it('checks shortly after start and then every four hours', () => {
    vi.useFakeTimers()
    const { feed, updater, advance } = setup()
    const stop = updater.arm()
    vi.advanceTimersByTime(FIRST_CHECK_MS)
    expect(feed.checks).toBe(1)
    feed.emit('update-not-available', { version: '0.0.3' })

    advance(CHECK_EVERY_MS - TICK_MS)
    vi.advanceTimersByTime(TICK_MS * 2)
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
