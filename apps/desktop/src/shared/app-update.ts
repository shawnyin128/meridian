/**
 * Where the app's self-update stands. `unsupported` covers development and test builds, which have
 * no published feed. `available` means a newer release exists that this platform cannot install in
 * place, so the user downloads it from `url`.
 */
export type AppUpdatePhase =
  | { phase: 'unsupported' }
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'latest' }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'ready'; version: string }
  | { phase: 'available'; version: string; url: string }
  | { phase: 'error'; message: string }

/** Running version, the update phase, and when the last check finished (ISO time, absent before the first). */
export type AppUpdateStatus = AppUpdatePhase & { current: string; checkedAt?: string }

/** Release page of one published version. */
export const releaseUrl = (version: string): string =>
  `https://github.com/shawnyin128/meridian/releases/tag/v${version}`
