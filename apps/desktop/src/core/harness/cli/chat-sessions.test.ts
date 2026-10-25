import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openCliChatSessions } from './chat-sessions.js'

const CLAUDE_SESSION = 'acc5bbcf-d11b-4be3-992d-2ff0b5fbe703'
const CODEX_SESSION = '01a174c5-42d7-7391-a182-f4eabdc88939'
const OPUS = { source: 'cli', cli: 'claude', model: 'opus' } as const

const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** A user-data folder and the CLIs' homes, all temporary, and a way to write the session files a CLI keeps. */
function machine() {
  const root = mkdtempSync(join(tmpdir(), 'meridian-chat-sessions-test-'))
  folders.push(root)
  const environment = { CLAUDE_CONFIG_DIR: join(root, 'claude-home'), CODEX_HOME: join(root, 'codex-home') }
  const logs: string[] = []
  const open = (vault = '/vaults/research') => openCliChatSessions({
    root: join(root, 'user-data', 'cli-chats'), vault, environment, home: join(root, 'home'), onLog: (line) => logs.push(line),
  })
  const touch = (path: string) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '{}\n')
  }
  const claudeFile = (id: string) => join(environment.CLAUDE_CONFIG_DIR, 'projects', '-chat-folder', `${id}.jsonl`)
  const codexFile = (id: string) => join(environment.CODEX_HOME, 'sessions', '2026', '10', '25', `rollout-2026-10-25T17-00-00-${id}.jsonl`)
  return { root, open, touch, claudeFile, codexFile, logs, file: join(root, 'user-data', 'cli-chats', 'sessions.json') }
}

describe('the CLI sessions of a chat', () => {
  it('offers the kept session again after Core restarts, and never to a chat of the same id in another vault', () => {
    const { open, touch, claudeFile } = machine()
    touch(claudeFile(CLAUDE_SESSION))
    open().keep('chat-3', { cli: 'claude', id: CLAUDE_SESSION, model: 'opus', history: 'turns-1' })

    expect(open().resumable('chat-3', OPUS, 'turns-1')).toEqual({
      cli: 'claude', id: CLAUDE_SESSION, model: 'opus', history: 'turns-1',
    })
    expect(open('/vaults/other').resumable('chat-3', OPUS, 'turns-1')).toBeNull()
  })

  it('falls back to a new session when the chat changed, the model changed, or the CLI no longer has the session', () => {
    const { open, touch, claudeFile, codexFile, logs } = machine()
    const sessions = open()
    touch(claudeFile(CLAUDE_SESSION))
    sessions.keep('chat-3', { cli: 'claude', id: CLAUDE_SESSION, model: 'opus', history: 'turns-1' })

    expect(sessions.resumable('chat-3', OPUS, 'turns-1-edited')).toBeNull()
    expect(sessions.resumable('chat-3', { source: 'cli', cli: 'claude', model: 'sonnet' }, 'turns-1')).toBeNull()
    expect(sessions.resumable('chat-3', { source: 'cli', cli: 'claude' }, 'turns-1')).toBeNull()
    expect(sessions.resumable('chat-3', { source: 'cli', cli: 'codex', model: 'opus' }, 'turns-1')).toBeNull()
    expect(sessions.resumable('chat-9', OPUS, 'turns-1')).toBeNull()
    rmSync(claudeFile(CLAUDE_SESSION))
    expect(sessions.resumable('chat-3', OPUS, 'turns-1')).toBeNull()
    expect(logs).toEqual([
      'chat chat-3: a new claude session, the chat changed',
      'chat chat-3: a new claude session, the model changed',
      'chat chat-3: a new claude session, the model changed',
      'chat chat-3: a new codex session, the model changed',
      'chat chat-9: a new claude session, no session to resume',
      'chat chat-3: a new claude session, the session is gone',
    ])

    sessions.keep('chat-4', { cli: 'codex', id: CODEX_SESSION, history: 'turns-2' })
    expect(sessions.resumable('chat-4', { source: 'cli', cli: 'codex' }, 'turns-2')).toBeNull()
    touch(codexFile(CODEX_SESSION))
    expect(sessions.resumable('chat-4', { source: 'cli', cli: 'codex' }, 'turns-2')).toMatchObject({ id: CODEX_SESSION })
  })

  it('offers no session once a turn runs, until that turn\'s answer is kept, and lists every session the chat started once', () => {
    const { open, touch, claudeFile, file } = machine()
    const sessions = open()
    touch(claudeFile(CLAUDE_SESSION))
    sessions.keep('chat-3', { cli: 'claude', id: CLAUDE_SESSION, model: 'opus', history: 'turns-1' })

    sessions.begin('chat-3', 'claude', CLAUDE_SESSION)
    expect(sessions.resumable('chat-3', OPUS, 'turns-1')).toBeNull()
    sessions.begin('chat-3', 'codex')
    sessions.started('chat-3', 'codex', CODEX_SESSION)
    sessions.started('chat-3', 'codex', CODEX_SESSION)
    sessions.started('chat-3', 'codex', '../../etc')
    sessions.keep('chat-3', { cli: 'codex', id: CODEX_SESSION, history: 'turns-2' })

    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      chats: [{
        vault: '/vaults/research', chat: 'chat-3',
        sessions: [{ cli: 'claude', id: CLAUDE_SESSION }, { cli: 'codex', id: CODEX_SESSION }],
        resumable: { cli: 'codex', id: CODEX_SESSION, history: 'turns-2' },
      }],
    })
  })

  it('skips a record it cannot read, says so, and writes it back as it was beside the others', () => {
    const { open, file, logs, touch, claudeFile } = machine()
    const strange = { vault: '/vaults/research', chat: 'chat-1', sessions: 'not a list' }
    const newer = {
      vault: '/vaults/research', chat: 'chat-2', sessions: [{ cli: 'claude', id: CLAUDE_SESSION, startedAt: 1 }],
      resumable: { cli: 'claude', id: CLAUDE_SESSION, history: 'turns-1', turns: 4 }, pinned: true,
    }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ chats: [strange, newer], version: 2 }))
    touch(claudeFile(CLAUDE_SESSION))

    const sessions = open()
    expect(logs).toEqual([`${file}: 1 chat records cannot be read and are skipped`])
    expect(sessions.resumable('chat-2', { source: 'cli', cli: 'claude' }, 'turns-1')).toMatchObject({ id: CLAUDE_SESSION })
    sessions.begin('chat-5', 'claude', CLAUDE_SESSION)
    expect(JSON.parse(readFileSync(file, 'utf8')).chats.slice(0, 2)).toEqual([strange, newer])
  })

  it('reports a sessions file that is not JSON and starts again from no sessions', () => {
    const { open, file, logs } = machine()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, '{ not json')

    expect(open().resumable('chat-3', OPUS, 'turns-1')).toBeNull()
    expect(logs[0]).toBe(`${file} cannot be read; the chats' CLI sessions start again`)
  })

  it('gives each chat of each vault a working folder of its own under the user-data folder', () => {
    const { open, root } = machine()
    const here = open().folder('chat-3')

    expect(existsSync(here)).toBe(true)
    expect(dirname(here)).toBe(join(root, 'user-data', 'cli-chats'))
    expect(open().folder('chat-3')).toBe(here)
    expect(open().folder('chat-4')).not.toBe(here)
    expect(open('/vaults/other').folder('chat-3')).not.toBe(here)
  })
})
