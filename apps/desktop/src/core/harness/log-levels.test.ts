import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { expect, it, vi } from 'vitest'
import { harnessLog, openCoreLog, teeConsole } from '../core-log.js'
import { openCliChatSessions } from './cli/chat-sessions.js'
import { HARNESS_CAPABILITIES, HARNESS_PROTOCOL_VERSION } from './protocol.js'
import { createHarnessRpc, type HarnessChild } from './rpc.js'

class FakeHarness extends EventEmitter implements HarnessChild {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly kill = vi.fn(() => true)

  send(message: object) {
    this.stdout.write(`${JSON.stringify(message)}\n`)
  }
}

const nextFrame = (stream: PassThrough) => new Promise((resolve) => { stream.once('data', resolve) })

it('writes Core\'s Harness notes and the Harness\'s stderr lines to core.log at the level each was written with', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'meridian-log-levels-'))
  const printers = { error: console.error, warn: console.warn, info: console.info, log: console.log }
  const quiet = (['error', 'warn', 'info'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => {}))
  try {
    teeConsole(openCoreLog({ dir, redact: (text) => text, now: () => new Date('2026-10-26T08:00:00.000Z') }), console)
    const sessions = openCliChatSessions({
      root: join(dir, 'cli-chats'), vault: '/vaults/research', environment: {}, home: join(dir, 'home'), onLog: harnessLog,
    })
    sessions.resumable('chat-1', { source: 'cli', cli: 'codex', model: 'gpt-5' }, 'turns-1')
    sessions.begin('chat-1', 'codex', 'not-a-uuid')

    const child = new FakeHarness()
    const rpc = createHarnessRpc({ launch: () => child, onLog: harnessLog })
    void rpc.request('paper-wiki.run', {}).catch(() => {})
    child.send({ type: 'event', id: 0, event: 'ready', data: { protocol: HARNESS_PROTOCOL_VERSION, capabilities: [...HARNESS_CAPABILITIES] } })
    await nextFrame(child.stdin)
    child.stderr.write('INFO a routine note\nWARNING an option is deprecated\nERROR request 1 failed: boom\nTraceback (most recent call last):\n')
    child.send({ type: 'callback', id: 1, callbackId: 'a', method: 'wiki.write', params: {} })
    await nextFrame(child.stdin)
    rpc.close()
  } finally {
    Object.assign(console, printers)
    for (const spy of quiet) spy.mockRestore()
  }
  const log = readFileSync(join(dir, 'core.log'), 'utf8')
  rmSync(dir, { recursive: true, force: true })
  expect(log.split('\n').map((line) => line.slice('2026-10-26T08:00:00.000Z '.length))).toEqual([
    'info [harness] chat chat-1: a new codex session, no session to resume',
    'warn [harness] a CLI session id that is not a UUID is not kept: "not-a-uuid"',
    'info [harness] a routine note',
    'warn [harness] an option is deprecated',
    'error [harness] request 1 failed: boom',
    'error [harness] Traceback (most recent call last):',
    'error [harness] refused Harness callback wiki.write',
    '',
  ])
})
