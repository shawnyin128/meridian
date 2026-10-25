import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { HarnessCli } from '../../../shared/contract.js'
import { type CliChatCall, chatTurnFlags, createCliChatRunner } from './chat-turn.js'
import type { CliDiscovery } from './discovery.js'
import type { InternalMcpOpener, InternalMcpRun } from './internal-mcp.js'
import { CODEX_DISABLED_FEATURES } from './runner.js'

/** What a stand-in CLI saw: its arguments, stdin, the variables of interest and its folder. */
type Seen = { argv: string[]; stdin: string; env: { [name: string]: string | undefined }; cwd: string; entries: string[] }

/**
 * What a stand-in CLI answers: `lines` on stdout, one at a time, stderr and an exit code. With
 * `waitAfter`, it writes that many lines and then waits for the file `STAND_IN_GO` names before it
 * writes the rest, so a test can prove it heard a line while the CLI was still running; after three
 * seconds without that file it exits with code 3.
 */
type Reply = { lines?: unknown[]; waitAfter?: number; stderr?: string; exit?: number }

const STAND_IN = `#!${process.execPath}
const fs = require('node:fs')
let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { stdin += chunk })
process.stdin.on('end', async () => {
  const env = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, OPENAI_API_KEY: process.env.OPENAI_API_KEY, KEEP_ME: process.env.KEEP_ME }
  const record = { argv: process.argv.slice(2), stdin, env, cwd: process.cwd(), entries: fs.readdirSync('.') }
  fs.appendFileSync(process.env.STAND_IN_RECORD, JSON.stringify(record) + '\\n')
  const reply = JSON.parse(process.env.STAND_IN_REPLY)
  const lines = (reply.lines ?? []).map((line) => typeof line === 'string' ? line : JSON.stringify(line))
  for (const [at, line] of lines.entries()) {
    if (at === reply.waitAfter) {
      const until = Date.now() + 3000
      while (!fs.existsSync(process.env.STAND_IN_GO)) {
        if (Date.now() > until) process.exit(3)
        await new Promise((go) => setTimeout(go, 20))
      }
    }
    process.stdout.write(line + '\\n')
  }
  process.stderr.write(reply.stderr ?? '')
  process.exitCode = reply.exit ?? 0
})
`

const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/**
 * Stand-in `claude` and `codex` executables answering `reply`, and the runner that starts them once
 * each is found signed in as `signIn` says, giving a turn that looks up the vault the internal MCP
 * server `internalMcp` opens.
 */
function standIns(reply: Reply, signIn: 'subscription' | 'signed-out' = 'subscription', internalMcp?: InternalMcpOpener) {
  const root = mkdtempSync(join(tmpdir(), 'meridian-chat-turn-test-'))
  folders.push(root)
  const bin = join(root, 'bin')
  mkdirSync(bin)
  for (const name of ['claude', 'codex']) {
    writeFileSync(join(bin, name), STAND_IN)
    chmodSync(join(bin, name), 0o755)
  }
  const recordFile = join(root, 'record.jsonl')
  const go = join(root, 'go')
  const runner = createCliChatRunner({
    discover: async (cli: HarnessCli): Promise<CliDiscovery> => ({
      cli, installed: true, binary: join(bin, cli), version: '1.0.0', missingFlags: [], signIn,
    }),
    ...(internalMcp === undefined ? {} : { internalMcp }),
    environment: {
      ...process.env, ANTHROPIC_API_KEY: 'sk-ant-must-not-cross', OPENAI_API_KEY: 'sk-must-not-cross', KEEP_ME: 'kept',
      PATH: '/usr/bin:/bin', STAND_IN_RECORD: recordFile, STAND_IN_REPLY: JSON.stringify(reply), STAND_IN_GO: go,
    },
  })
  const records = (): Seen[] => existsSync(recordFile)
    ? readFileSync(recordFile, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Seen)
    : []
  return { runner, records, release: () => writeFileSync(go, '') }
}

const turn = (cli: HarnessCli, extra: Partial<CliChatCall> = {}): CliChatCall => ({
  cli, system: 'Chat rules\n\nConversation context:\n{"title":"T"}', prompt: 'Current user message:\nWhy?',
  timeoutMs: 20_000, signal: new AbortController().signal, ...extra,
})

const delta = (text: string) => ({
  type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
})
const claudeResult = (result: string, extra: Record<string, unknown> = {}) => ({
  type: 'result', subtype: 'success', is_error: false, result, session_id: 'session-1', num_turns: 1,
  usage: { input_tokens: 2, cache_creation_input_tokens: 853, cache_read_input_tokens: 23_327, output_tokens: 88 },
  ...extra,
})
const agentMessage = (text: string) => ({ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text } })
const codexUsage = { input_tokens: 27_023, cached_input_tokens: 7_552, output_tokens: 117 }

describe('a chat turn on Claude Code', () => {
  it('streams the answer as Claude writes it, with every tool, setting and MCP server off and no session kept', async () => {
    const { runner, records, release } = standIns({
      lines: [
        { type: 'system', subtype: 'init', session_id: 'session-1' },
        { type: 'stream_event', event: { type: 'message_start', message: {} } },
        delta('EAGLE reaches '),
        delta('3.76x [p. 6].'),
        { type: 'assistant', message: { content: [{ type: 'text', text: 'EAGLE reaches 3.76x [p. 6].' }] } },
        claudeResult('EAGLE reaches 3.76x [p. 6].'),
      ],
      waitAfter: 3,
    })
    const seen: string[] = []
    const result = await runner(turn('claude', {
      model: 'opus',
      onText: (text) => {
        seen.push(text)
        release()
      },
    }))

    expect(seen).toEqual(['EAGLE reaches ', 'EAGLE reaches 3.76x [p. 6].'])
    expect(result).toMatchObject({
      answer: 'EAGLE reaches 3.76x [p. 6].',
      usage: { inputTokens: 24_182, cachedInputTokens: 23_327, outputTokens: 88 },
    })
    const [seenCall] = records()
    expect(seenCall!.argv).toEqual([
      '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--tools', '', '--strict-mcp-config', '--setting-sources', 'project',
      '--no-session-persistence', '--system-prompt', 'Chat rules\n\nConversation context:\n{"title":"T"}',
      '--model=opus',
    ])
    expect(seenCall!.stdin).toBe('Current user message:\nWhy?')
    expect(seenCall!.env).toEqual({ KEEP_ME: 'kept' })
    expect(seenCall!.entries).toEqual([])
    expect(existsSync(seenCall!.cwd)).toBe(false)
  })

  it('fails in Claude\'s own words when its result is an error, at the usage limit when it says so, and with the exit code when it printed none', async () => {
    const limited = standIns({ lines: [claudeResult('You\'ve hit your limit · resets 3pm', { is_error: true, subtype: 'error_during_execution' })], exit: 1 })
    await expect(limited.runner(turn('claude'))).rejects.toMatchObject({
      name: 'CliRunError', kind: 'usage-limit', message: 'claude 运行失败：You\'ve hit your limit · resets 3pm', exitCode: 1,
    })
    const refused = standIns({ lines: [claudeResult('Overloaded', { is_error: true, subtype: 'error_during_execution' })], exit: 1 })
    await expect(refused.runner(turn('claude'))).rejects.toMatchObject({ kind: 'failed', message: 'claude 运行失败：Overloaded' })
    const crashed = standIns({ lines: ['not json'], stderr: 'boom', exit: 2 })
    await expect(crashed.runner(turn('claude'))).rejects.toMatchObject({
      kind: 'failed', message: 'claude 运行失败（退出码 2）', exitCode: 2, stderr: 'boom',
    })
  })
})

describe('a chat turn on Codex', () => {
  it('shows each agent message as Codex completes it and answers with the last, read-only with its tools off', async () => {
    const { runner, records, release } = standIns({
      lines: [
        { type: 'thread.started', thread_id: 'thread-1' },
        { type: 'item.completed', item: { id: 'item_0', type: 'error', message: 'Code Mode is unavailable' } },
        { type: 'turn.started' },
        agentMessage('Drafting [p. 4].'),
        agentMessage('EAGLE drafts features [p. 4].'),
        { type: 'turn.completed', usage: codexUsage },
      ],
      waitAfter: 4,
    })
    const seen: string[] = []
    const result = await runner(turn('codex', {
      onText: (text) => {
        seen.push(text)
        release()
      },
    }))

    expect(seen).toEqual(['Drafting [p. 4].', 'EAGLE drafts features [p. 4].'])
    expect(result).toMatchObject({
      answer: 'EAGLE drafts features [p. 4].',
      usage: { inputTokens: 27_023, cachedInputTokens: 7_552, outputTokens: 117 },
    })
    const [seenCall] = records()
    expect(seenCall!.argv).toEqual([
      'exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
      '--ignore-user-config', '--ignore-rules', '--json', '--color', 'never', '-c', 'web_search="disabled"',
      '-C', expect.any(String),
      ...CODEX_DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
      '-',
    ])
    const work = seenCall!.argv[seenCall!.argv.indexOf('-C') + 1]!
    expect(work.split('/').slice(-2)).toEqual(seenCall!.cwd.split('/').slice(-2))
    expect(seenCall!.stdin).toBe('Chat rules\n\nConversation context:\n{"title":"T"}\n\nCurrent user message:\nWhy?')
    expect(seenCall!.env).toEqual({ KEEP_ME: 'kept' })
    expect(seenCall!.entries).toEqual([])
  })

  it('gives a turn that looks up the vault the internal MCP server, in the turn\'s own folder, and closes it after', async () => {
    const runs: InternalMcpRun[] = []
    const closed: boolean[] = []
    const internalMcp: InternalMcpOpener = async (run) => {
      runs.push(run)
      return {
        claudeArgs: ['--mcp-config', join(run.folder, 'mcp.json')], codexArgs: ['-c', 'mcp_servers.vault.command="x"'],
        env: { VAULT_TOKEN: 'run-token' }, close: async () => { closed.push(true) },
      }
    }
    const { runner, records } = standIns({ lines: [agentMessage('Found it [p. 9].'), { type: 'turn.completed', usage: codexUsage }] }, 'subscription', internalMcp)
    await expect(runner(turn('codex', { lookup: { paperId: 'paper-1' } }))).resolves.toMatchObject({ answer: 'Found it [p. 9].' })

    expect(runs).toEqual([{ paperId: 'paper-1', folder: expect.any(String) }])
    expect(closed).toEqual([true])
    const [seenCall] = records()
    expect(seenCall!.argv.slice(-3)).toEqual(['-c', 'mcp_servers.vault.command="x"', '-'])
    expect(seenCall!.argv).toContain('code_mode_host')
  })

  it('refuses a turn on a CLI not signed in with the subscription before starting it', async () => {
    const { runner, records } = standIns({ lines: [] }, 'signed-out')
    await expect(runner(turn('claude'))).rejects.toMatchObject({ name: 'CliRunError', kind: 'signed-out' })
    expect(records()).toEqual([])
  })

  it('fails in the words of Codex\'s last error event when it exits with an error', async () => {
    const { runner } = standIns({
      lines: [{ type: 'thread.started', thread_id: 'thread-1' }, { type: 'turn.failed', error: { message: 'usage limit reached' } }],
      exit: 1,
    })
    await expect(runner(turn('codex'))).rejects.toMatchObject({
      kind: 'failed', message: 'codex 运行失败：usage limit reached', exitCode: 1,
    })
  })
})

describe('the flags a chat turn needs', () => {
  it('lists each option a chat turn passes once, without its value, a turn that looks up the vault included', () => {
    expect(chatTurnFlags('claude')).toEqual([
      '-p', '--output-format', '--verbose', '--include-partial-messages', '--tools', '--strict-mcp-config',
      '--setting-sources', '--no-session-persistence', '--system-prompt', '--model', '--mcp-config', '--allowedTools',
    ])
    expect(chatTurnFlags('codex')).toEqual([
      '--ephemeral', '--skip-git-repo-check', '--sandbox', '--ignore-user-config', '--ignore-rules', '--json',
      '--color', '-c', '-C', '--disable', '--model',
    ])
  })
})
