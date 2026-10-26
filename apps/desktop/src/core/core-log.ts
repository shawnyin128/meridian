import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { format } from 'node:util'

/** How bad a log line is, as the console method that printed it says. */
export type CoreLogLevel = 'error' | 'warn' | 'info'

/** How many characters of one entry the log keeps. */
const MAX_ENTRY_CHARS = 8_000

/**
 * The log file Core writes in `dir`: `core.log`, then `core.1.log` up to `core.<files - 1>.log`, the
 * oldest dropped once each holds `maxBytes`. Each entry is one line, its time from `now`, its level,
 * and its text as `redact` leaves it; a text of several lines continues on indented lines. Creates
 * `dir`; throws when it cannot be created or written.
 */
export function openCoreLog({ dir, redact, maxBytes = 1_000_000, files = 3, now = () => new Date() }: {
  dir: string
  redact: (text: string) => string
  maxBytes?: number
  files?: number
  now?: () => Date
}) {
  mkdirSync(dir, { recursive: true })
  const nth = (n: number) => join(dir, n === 0 ? 'core.log' : `core.${n}.log`)
  const current = nth(0)
  let size = existsSync(current) ? statSync(current).size : 0
  const rotate = () => {
    rmSync(nth(files - 1), { force: true })
    for (let n = files - 2; n >= 0; n -= 1) if (existsSync(nth(n))) renameSync(nth(n), nth(n + 1))
    size = 0
  }
  return {
    write(level: CoreLogLevel, text: string): void {
      const kept = redact(text.length > MAX_ENTRY_CHARS ? `${text.slice(0, MAX_ENTRY_CHARS - 1)}…` : text)
      const entry = `${now().toISOString()} ${level} ${kept.split(/\r?\n/).join('\n  ')}\n`
      const bytes = Buffer.byteLength(entry)
      if (size > 0 && size + bytes > maxBytes) rotate()
      appendFileSync(current, entry, 'utf8')
      size += bytes
    },
  }
}

export type CoreLog = ReturnType<typeof openCoreLog>

type Printer = (...args: unknown[]) => void

/**
 * Makes each of `target`'s error, warn, info and log methods also write what it prints to `log`, as
 * the console formats it; log writes at level info.
 */
export function teeConsole(
  log: CoreLog,
  target: { error: Printer; warn: Printer; info: Printer; log: Printer } = console,
): void {
  const levels = { error: 'error', warn: 'warn', info: 'info', log: 'info' } as const
  for (const method of ['error', 'warn', 'info', 'log'] as const) {
    const print = target[method].bind(target)
    target[method] = (...args: unknown[]) => {
      print(...args)
      log.write(levels[method], format(...args))
    }
  }
}
