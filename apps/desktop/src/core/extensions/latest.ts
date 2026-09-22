import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { HttpGet } from '../net/http.js'
import bundledVersionFile from '../../../../../VERSION?raw'
import { olderThan } from './status.js'

/** The plugin version this build was made with: the skills and MCP share it, independent of the app's version. */
export const BUNDLED_PLUGIN_VERSION = bundledVersionFile.trim()
/** The plugins install from the repository's master branch, whose VERSION file names the version they get. */
export const LATEST_PLUGIN_URL = 'https://raw.githubusercontent.com/shawnyin128/meridian/master/VERSION'
export const PLUGIN_CHECK_EVERY_MS = 6 * 3_600_000
export const PLUGIN_TICK_MS = 3_600_000
export const PLUGIN_FIRST_CHECK_MS = 15_000
const REQUEST_TIMEOUT_MS = 15_000

const StoredSchema = z.object({ version: z.string(), checkedAt: z.string() }).strict()

export interface PluginVersionCheck {
  /** The newest plugin version known: the bundled one or the last one read from master, whichever is newer. */
  latest(): string
  /** When master was last read successfully, as an ISO time, or null before the first successful read. */
  checkedAt(): string | null
  /**
   * Reads master's plugin version now and returns `latest()` afterwards. A failed request is expected when
   * offline, so it leaves the last known version in place instead of failing.
   */
  check(): Promise<string>
  /** Checks shortly after start and then every six hours; returns the stop function. */
  arm(): () => void
}

/**
 * Tracks the newest plugin version. `file` keeps the last version read from master across restarts;
 * `onLatest` receives the newest version after every successful read.
 */
export function createPluginVersionCheck({ get, file, now, onLatest }: {
  get: HttpGet
  file: string
  now: () => number
  onLatest: (version: string) => void
}): PluginVersionCheck {
  let stored = existsSync(file) ? StoredSchema.parse(JSON.parse(readFileSync(file, 'utf8'))) : null
  const latest = () => (stored !== null && olderThan(BUNDLED_PLUGIN_VERSION, stored.version)
    ? stored.version : BUNDLED_PLUGIN_VERSION)

  const check = async (): Promise<string> => {
    const response = await get(LATEST_PLUGIN_URL, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), limit: 1_024 })
      .catch(() => null)
    const version = response?.status === 200 ? new TextDecoder().decode(response.body).trim() : ''
    if (!/^\d+\.\d+\.\d+$/.test(version)) return latest()
    stored = { version, checkedAt: new Date(now()).toISOString() }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`, 'utf8')
    onLatest(latest())
    return latest()
  }

  return {
    latest,
    checkedAt: () => stored?.checkedAt ?? null,
    check,
    arm() {
      const tick = () => {
        if (stored === null || now() - Date.parse(stored.checkedAt) >= PLUGIN_CHECK_EVERY_MS) void check()
      }
      const first = setTimeout(tick, PLUGIN_FIRST_CHECK_MS)
      const every = setInterval(tick, PLUGIN_TICK_MS)
      return () => {
        clearTimeout(first)
        clearInterval(every)
      }
    },
  }
}
