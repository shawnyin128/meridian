import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VaultStore } from './vault.js'
import { createVaultStore } from './vault-store.js'

/** One SSH call Core made: the remote command and, once the test answers it, how it answered. */
type SshCall = { command: string; answer: (stdout: Buffer) => void }

const ssh = vi.hoisted(() => ({
  /** What happened, in order: a call starting, a call finishing, and the steps the test records. */
  events: [] as string[],
  /** The calls not answered yet, oldest first. */
  held: [] as SshCall[],
  /** Whether a call waits for the test to answer it, or is answered with an empty workspace at once. */
  hold: false,
}))

/** The reply of the workspace read for a remote folder with none of the workspace files in it. */
const emptyWorkspace = (): Buffer => Buffer.from([
  '.meridian/workspace.json', '.meridian/control/plan.json', '.meridian/control/changes.json',
  '.meridian/graph/graph.json', '.meridian/events/events.json',
].map((name) => `${name} -1\n`).join(''))

/** The reply OpenSSH gives `command`: what a workspace read finds, nothing for a write. */
const replyTo = (command: string): Buffer => (command.includes('wc -c') ? emptyWorkspace() : Buffer.alloc(0))

vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>()
  return {
    ...real,
    execFile: vi.fn((_file: string, args: string[], _options: unknown, done: (error: null, stdout: Buffer, stderr: Buffer) => void) => {
      const command = args.at(-1)!
      ssh.events.push('ssh started')
      const answer = (stdout: Buffer) => {
        ssh.events.push('ssh finished')
        done(null, stdout, Buffer.alloc(0))
      }
      if (ssh.hold) ssh.held.push({ command, answer })
      else answer(replyTo(command))
      return { stdin: { end: () => {} } }
    }),
    spawnSync: vi.fn((_file: string, args: string[]) => {
      ssh.events.push('ssh started')
      ssh.events.push('ssh finished')
      return { status: 0, stdout: replyTo(args.at(-1)!), stderr: Buffer.alloc(0) }
    }),
  }
})

/** Test vault for the real implementation: two paper pages, no projects and no app state. */
const VAULT = resolve(import.meta.dirname, 'fixtures/vault')

/** Lets every queued callback run, up to `turns` macrotasks. */
const settle = async (turns = 5) => {
  for (let turn = 0; turn < turns; turn += 1) await new Promise((next) => setImmediate(next))
}

describe('a project bound to an SSH workspace', () => {
  let vault: string
  let store: VaultStore
  let remote: string
  let local: string

  beforeEach(async () => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-ssh-'))
    cpSync(VAULT, vault, { recursive: true })
    store = createVaultStore(vault)
    const id = (name: string) => {
      store.createProject(name)
      return store.listProjects().find((project) => project.name === name)!.id
    }
    remote = id('远端的项目')
    local = id('本地的项目')
    ssh.hold = false
    await store.bindProjectWorkspace(remote, { kind: 'ssh', host: 'gpu-lab', path: '/srv/research' })
    ssh.events.length = 0
    ssh.held.length = 0
  })

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true })
  })

  it('Core answers other calls while a read of that workspace is still running, and the read answers once SSH does', async () => {
    ssh.hold = true
    let read = false
    const detail = store.getProject(remote).then((project) => {
      read = true
      return project
    })
    await settle()

    expect((await store.getProject(local)).name).toBe('本地的项目')
    expect(store.listPapers({ page: 1, size: 1 }).total).toBeGreaterThan(0)
    ssh.events.push('other calls answered')
    expect(read).toBe(false)

    ssh.held.shift()?.answer(emptyWorkspace())
    expect((await detail).workspace).toMatchObject({ kind: 'ssh', host: 'gpu-lab', root: '/srv/research' })
    expect(ssh.events).toEqual(['ssh started', 'other calls answered', 'ssh finished'])
  })

  it('runs the SSH calls of one project one at a time, in the order Core made them', async () => {
    ssh.hold = true
    const first = store.getProject(remote)
    const updated = store.updateProject(remote, { focus: '先测宽度' })
    const commands: string[] = []
    for (let step = 0; step < 4; step += 1) {
      await settle()
      expect(ssh.held).toHaveLength(1)
      const call = ssh.held.shift()!
      commands.push(call.command.includes('wc -c') ? 'read' : 'write')
      call.answer(replyTo(call.command))
    }
    await Promise.all([first, updated])
    expect(commands).toEqual(['read', 'read', 'write', 'read'])
  })
})
