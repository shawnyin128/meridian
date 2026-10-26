import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openCoreLog, teeConsole } from './core-log.js'

const folders: string[] = []
const folder = () => {
  const made = mkdtempSync(join(tmpdir(), 'meridian-core-log-'))
  folders.push(made)
  return made
}
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true })
})

const at = () => new Date('2026-10-26T08:00:00.000Z')
const same = (text: string) => text

describe('the Core log file', () => {
  it('appends each line to logs/core.log with the time it was written', () => {
    const root = folder()
    const log = openCoreLog({ dir: join(root, 'logs'), redact: same, now: at })
    log.write('error', '[chat] chat-1 failed')
    log.write('warn', 'second')
    expect(readFileSync(join(root, 'logs', 'core.log'), 'utf8')).toBe(
      '2026-10-26T08:00:00.000Z error [chat] chat-1 failed\n2026-10-26T08:00:00.000Z warn second\n',
    )
  })

  it('keeps three files of at most the size cap, dropping the oldest', () => {
    const dir = folder()
    const log = openCoreLog({ dir, redact: same, maxBytes: 200, now: at })
    for (let n = 0; n < 40; n += 1) log.write('info', `line ${String(n).padStart(2, '0')} ${'x'.repeat(20)}`)
    for (const name of ['core.log', 'core.1.log', 'core.2.log']) expect(statSync(join(dir, name)).size).toBeLessThanOrEqual(200)
    expect(existsSync(join(dir, 'core.3.log'))).toBe(false)
    expect(readFileSync(join(dir, 'core.log'), 'utf8')).toContain('line 39')
    expect(readFileSync(join(dir, 'core.1.log'), 'utf8')).not.toContain('line 39')
    expect(readFileSync(join(dir, 'core.2.log'), 'utf8')).not.toContain('line 00')
  })

  it('goes on in the file an earlier session left', () => {
    const dir = folder()
    openCoreLog({ dir, redact: same, maxBytes: 200, now: at }).write('info', 'x'.repeat(150))
    openCoreLog({ dir, redact: same, maxBytes: 200, now: at }).write('info', 'y'.repeat(150))
    expect(readFileSync(join(dir, 'core.1.log'), 'utf8')).toContain('x'.repeat(150))
    expect(readFileSync(join(dir, 'core.log'), 'utf8')).toContain('y'.repeat(150))
  })

  it('writes each entry as redact leaves it', () => {
    const dir = folder()
    openCoreLog({ dir, redact: (text) => text.replace('hunter2', '[redacted]'), now: at }).write('error', 'api_key=hunter2')
    expect(readFileSync(join(dir, 'core.log'), 'utf8')).toBe('2026-10-26T08:00:00.000Z error api_key=[redacted]\n')
  })

  it('writes English only, each run of Chinese text replaced by a marker', () => {
    const dir = folder()
    openCoreLog({ dir, redact: same, now: at }).write('error', '[core] chat.send failed: 项目不存在：p1')
    expect(readFileSync(join(dir, 'core.log'), 'utf8')).toBe('2026-10-26T08:00:00.000Z error [core] chat.send failed: [non-English]p1\n')
  })

  it('keeps every entry on lines of its own, a continued line indented', () => {
    const dir = folder()
    openCoreLog({ dir, redact: same, now: at }).write('error', 'first\r\nsecond')
    expect(readFileSync(join(dir, 'core.log'), 'utf8')).toBe('2026-10-26T08:00:00.000Z error first\n  second\n')
  })
})

describe('teeConsole', () => {
  it('writes what Core prints to its console to the log as well, formatted as the console prints it', () => {
    const dir = folder()
    const printed: unknown[][] = []
    const target = {
      error: (...args: unknown[]) => { printed.push(args) },
      warn: (...args: unknown[]) => { printed.push(args) },
      info: (...args: unknown[]) => { printed.push(args) },
      log: (...args: unknown[]) => { printed.push(args) },
    }
    teeConsole(openCoreLog({ dir, redact: same, now: at }), target)
    target.error('[harness] %s failed', 'codex')
    target.warn('sync failed')
    target.info('vault', 3)
    target.log('plain')
    expect(printed).toEqual([['[harness] %s failed', 'codex'], ['sync failed'], ['vault', 3], ['plain']])
    expect(readFileSync(join(dir, 'core.log'), 'utf8').split('\n')).toEqual([
      '2026-10-26T08:00:00.000Z error [harness] codex failed',
      '2026-10-26T08:00:00.000Z warn sync failed',
      '2026-10-26T08:00:00.000Z info vault 3',
      '2026-10-26T08:00:00.000Z info plain',
      '',
    ])
  })
})
