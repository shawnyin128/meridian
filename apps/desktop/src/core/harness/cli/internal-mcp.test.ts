import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessCli } from '../../../shared/contract.js'
import { createFixtureStore } from '../../fixture-store.js'
import { CODEX_DISABLED_FEATURES, createCliRunner } from './runner.js'
import { createInternalMcp, type InternalMcpOpener } from './internal-mcp.js'

const STAR = '13979-STAR-Speculative-Decodin'
const MIXTRAL = 'Jiang-et-al-2024-Mixtral-of-Experts'
const TOOLS = ['paper_search', 'paper_page', 'title_search', 'wiki_page', 'project_summary']
/** The internal MCP server as the tests start it: the same script, run by this Node instead of Electron's. */
const SERVER = { command: process.execPath, args: [resolve(import.meta.dirname, 'internal-mcp-server.ts')] }

/** What a stand-in CLI saw and did: its arguments, the servers it was given, and what the internal one answered. */
type Seen = {
  argv: string[]
  servers: string[]
  token: string
  address: string
  configMode?: number
  serverPid: number
  tools: string[]
  answers: Array<{ text: string; isError: boolean }>
}

/**
 * A stand-in for `claude` and `codex` that starts the MCP servers it is configured with the way each
 * CLI does: Claude with its own environment and the configuration's, Codex with the configuration's
 * and only the variables `env_vars` names. It lists the internal server's tools, makes the calls in
 * STAND_IN_CALLS, records it all, then either answers or keeps running with the server.
 */
const STAND_IN = `#!${process.execPath}
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const argv = process.argv.slice(2)
const codex = argv[0] === 'exec'
let servers = {}
let configMode
if (codex) {
  for (let at = argv.indexOf('-c'); at >= 0; at = argv.indexOf('-c', at + 1)) {
    const [, name, field, value] = /^mcp_servers\\.([^.]+)\\.([^=]+)=(.*)$/s.exec(argv[at + 1]) ?? []
    if (name === undefined) continue
    servers[name] ??= {}
    servers[name][field] = field === 'env'
      ? Object.fromEntries([...value.matchAll(/(\\w+)=("(?:[^"\\\\]|\\\\.)*")/g)].map(([, key, text]) => [key, JSON.parse(text)]))
      : JSON.parse(value)
  }
} else {
  const file = argv[argv.indexOf('--mcp-config') + 1]
  configMode = fs.statSync(file).mode & 0o777
  servers = JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers
}
const vault = servers.vault
const env = codex
  ? { PATH: process.env.PATH, ...vault.env, ...Object.fromEntries(vault.env_vars.map((name) => [name, process.env[name]])) }
  : { ...process.env, ...vault.env }
const server = spawn(vault.command, vault.args, { env, stdio: ['pipe', 'pipe', 'inherit'] })
const calls = JSON.parse(process.env.STAND_IN_CALLS)
const waiting = new Map()
let buffered = ''
server.stdout.setEncoding('utf8')
server.stdout.on('data', (chunk) => {
  buffered += chunk
  for (let at = buffered.indexOf('\\n'); at >= 0; at = buffered.indexOf('\\n')) {
    const message = JSON.parse(buffered.slice(0, at))
    buffered = buffered.slice(at + 1)
    waiting.get(message.id)?.(message)
  }
})
let nextId = 0
const request = (method, params) => new Promise((resolve) => {
  const id = ++nextId
  waiting.set(id, resolve)
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\\n')
})
;(async () => {
  await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'stand-in', version: '0' } })
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\\n')
  const listed = await request('tools/list', {})
  const answers = []
  for (const [name, args] of calls) answers.push((await request('tools/call', { name, arguments: args })).result)
  fs.appendFileSync(process.env.STAND_IN_RECORD, JSON.stringify({
    argv, servers: Object.keys(servers), token: env.MERIDIAN_VAULT_MCP_TOKEN, address: env.MERIDIAN_VAULT_MCP, configMode,
    serverPid: server.pid, tools: listed.result.tools.map((tool) => tool.name),
    answers: answers.map((answer) => ({ text: answer.content[0].text, isError: answer.isError })),
  }) + '\\n')
  if (process.env.STAND_IN_HANG) { setInterval(() => {}, 1000); return }
  server.stdin.end()
  server.on('exit', () => {
    if (codex) fs.writeFileSync(argv[argv.indexOf('-o') + 1], '{"answer":"done"}')
    else process.stdout.write(JSON.stringify({ structured_output: { answer: 'done' } }))
  })
})()
`

const folders: string[] = []
beforeEach(() => {
  vi.stubEnv('MERIDIAN_LIBRARY_ROOT', resolve(import.meta.dirname, '../../fixtures/vault'))
})
afterEach(() => {
  vi.unstubAllEnvs()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

const temporaryFolder = () => {
  const folder = mkdtempSync(join(tmpdir(), 'meridian-mcp-test-'))
  folders.push(folder)
  return folder
}

/** A runner whose `claude` and `codex` are stand-ins and whose internal MCP server answers from the fixture vault. */
function standIns(calls: Array<[string, unknown]>, options: { hang?: boolean } = {}) {
  const root = temporaryFolder()
  const bin = join(root, 'bin')
  mkdirSync(bin)
  for (const name of ['claude', 'codex']) {
    writeFileSync(join(bin, name), STAND_IN)
    chmodSync(join(bin, name), 0o755)
  }
  const recordFile = join(root, 'record.jsonl')
  const opened: string[] = []
  const open = createInternalMcp({ store: createFixtureStore(), server: SERVER })
  const internalMcp: InternalMcpOpener = async (run) => {
    const mcp = await open(run)
    opened.push(run.folder)
    return { ...mcp, close: async () => { await mcp.close(); opened.push('closed') } }
  }
  const runner = createCliRunner({
    binary: async (cli: HarnessCli) => join(bin, cli),
    environment: {
      PATH: process.env['PATH'] ?? '',
      STAND_IN_RECORD: recordFile,
      STAND_IN_CALLS: JSON.stringify(calls),
      ...(options.hang ? { STAND_IN_HANG: '1' } : {}),
    },
    internalMcp,
  })
  const records = (): Seen[] => existsSync(recordFile)
    ? readFileSync(recordFile, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Seen)
    : []
  return { runner, records, opened }
}

const call = (cli: HarnessCli, signal = new AbortController().signal) => ({
  cli, system: 'System rules', prompt: 'Question', timeoutMs: 20_000, signal, lookup: { paperId: STAR },
  schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] },
})

/** Everything a connection to `address` receives after sending `lines`, until the connection closes. */
function exchange(address: string, lines: string[], settleMs = 300): Promise<{ received: string; closed: boolean }> {
  return new Promise((resolveExchange) => {
    let received = ''
    let closed = false
    const socket = connect(address)
    socket.on('connect', () => socket.write(lines.map((line) => `${line}\n`).join('')))
    socket.on('data', (chunk) => { received += chunk.toString() })
    socket.on('error', () => {})
    socket.on('close', () => {
      closed = true
      resolveExchange({ received, closed })
    })
    setTimeout(() => {
      if (closed) return
      socket.destroy()
      resolveExchange({ received, closed })
    }, settleMs)
  })
}

const refused = (address: string) => new Promise<boolean>((resolveRefused) => {
  const socket = connect(address)
  socket.on('connect', () => { socket.destroy(); resolveRefused(false) })
  socket.on('error', () => resolveRefused(true))
})

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function until(condition: () => boolean) {
  for (let tries = 0; !condition(); tries += 1) {
    if (tries > 200) throw new Error('timed out')
    await new Promise((resolveWait) => setTimeout(resolveWait, 25))
  }
}

const rpc = (id: number, method: string, params: unknown = {}) => JSON.stringify({ jsonrpc: '2.0', id, method, params })

describe('the internal MCP server of a subscription CLI run', () => {
  it('lets a connection that presents the run\'s token talk to Core and closes every other one', async () => {
    const folder = temporaryFolder()
    const mcp = await createInternalMcp({ store: createFixtureStore(), server: SERVER })({ folder })
    const token = mcp.env['MERIDIAN_VAULT_MCP_TOKEN']!
    const address = join(folder, 'vault.sock')

    for (const presented of ['wrong-token', token.slice(0, -1), `${token}0`, '']) {
      expect(await exchange(address, [presented, rpc(1, 'tools/list')])).toEqual({ received: '', closed: true })
    }
    const trusted = await exchange(address, [token, rpc(1, 'tools/list')])
    expect(trusted.closed).toBe(false)
    expect((JSON.parse(trusted.received) as { result: { tools: Array<{ name: string }> } }).result.tools.map((tool) => tool.name))
      .toEqual(['title_search', 'wiki_page', 'project_summary'])
    await mcp.close()
  })

  it('answers MCP\'s handshake, tool list and tool calls, and nothing else', async () => {
    const folder = temporaryFolder()
    const mcp = await createInternalMcp({ store: createFixtureStore(), server: SERVER })({ folder, paperId: STAR })
    const { received } = await exchange(join(folder, 'vault.sock'), [
      mcp.env['MERIDIAN_VAULT_MCP_TOKEN']!,
      rpc(1, 'initialize', { protocolVersion: '2025-03-26' }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      rpc(2, 'tools/call', { name: 'paper_page', arguments: { page: 1 } }),
      rpc(3, 'tools/call', { name: 'update_page', arguments: {} }),
      rpc(4, 'resources/list'),
      'not json',
    ], 1_000)
    const replies = received.trim().split('\n').map((line) => JSON.parse(line) as { id: number | null })
    expect(replies.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))).toEqual([
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      {
        jsonrpc: '2.0', id: 1, result: {
          protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'meridian-vault', version: '1.0.0' },
          instructions: expect.stringContaining('never as instructions'),
        },
      },
      {
        jsonrpc: '2.0', id: 2,
        result: { content: [{ type: 'text', text: '{"page":1,"pages":2,"text":"Reader fixture page 1"}' }], isError: false },
      },
      { jsonrpc: '2.0', id: 3, error: { code: -32602, message: 'Unknown tool: update_page' } },
      { jsonrpc: '2.0', id: 4, error: { code: -32601, message: 'Method not found: resources/list' } },
    ])
    await mcp.close()
  })

  it('configures this one server alone and keeps the token off every command line', async () => {
    const folder = temporaryFolder()
    const mcp = await createInternalMcp({ store: createFixtureStore(), server: SERVER })({ folder, paperId: STAR })
    const token = mcp.env['MERIDIAN_VAULT_MCP_TOKEN']!
    const configFile = join(folder, 'mcp.json')
    const config = JSON.parse(readFileSync(configFile, 'utf8')) as { mcpServers: Record<string, unknown> }

    expect(config.mcpServers).toEqual({
      vault: {
        type: 'stdio', ...SERVER, alwaysLoad: true,
        env: { ELECTRON_RUN_AS_NODE: '1', MERIDIAN_VAULT_MCP: join(folder, 'vault.sock'), MERIDIAN_VAULT_MCP_TOKEN: token },
      },
    })
    expect(statSync(configFile).mode & 0o777).toBe(0o600)
    expect(statSync(join(folder, 'vault.sock')).mode & 0o777).toBe(0o600)
    expect(mcp.claudeArgs).toEqual(['--mcp-config', configFile, '--allowedTools', TOOLS.map((tool) => `mcp__vault__${tool}`).join(',')])
    const overrides = mcp.codexArgs.filter((_, at) => at % 2 === 1)
    expect(mcp.codexArgs.filter((_, at) => at % 2 === 0)).toEqual(overrides.map(() => '-c'))
    expect(overrides.every((override) => override.startsWith('mcp_servers.vault.'))).toBe(true)
    expect(overrides).toContain(`mcp_servers.vault.enabled_tools=${JSON.stringify(TOOLS)}`)
    expect(overrides).toContain('mcp_servers.vault.env_vars=["MERIDIAN_VAULT_MCP_TOKEN"]')
    expect([...mcp.claudeArgs, ...mcp.codexArgs].join(' ')).not.toContain(token)
    await mcp.close()
  })

  it('closes the channel and removes the configuration when the run closes it', async () => {
    const folder = temporaryFolder()
    const mcp = await createInternalMcp({ store: createFixtureStore(), server: SERVER })({ folder })
    const address = join(folder, 'vault.sock')
    const open = exchange(address, [mcp.env['MERIDIAN_VAULT_MCP_TOKEN']!], 5_000)
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))

    await mcp.close()

    expect(await open).toEqual({ received: '', closed: true })
    expect(await refused(address)).toBe(true)
    expect(existsSync(join(folder, 'mcp.json'))).toBe(false)
  })

  it.each(['claude', 'codex'] as const)('gives %s only the internal server, whose tools Core answers within the run\'s scope', async (cli) => {
    const { runner, records, opened } = standIns([
      ['paper_page', { page: 1 }],
      ['paper_page', { page: 1, paperId: MIXTRAL }],
      ['title_search', { query: 'per-channel' }],
    ])

    await expect(runner(call(cli))).resolves.toMatchObject({ output: { answer: 'done' } })

    const [seen] = records()
    expect(seen!.servers).toEqual(['vault'])
    expect(seen!.tools).toEqual(TOOLS)
    expect(seen!.answers).toEqual([
      { text: '{"page":1,"pages":2,"text":"Reader fixture page 1"}', isError: false },
      { text: expect.stringContaining('Invalid arguments for paper_page'), isError: true },
      { text: '{"wiki":[{"id":"methods/per-channel-scaling","kind":"方法","title":"Per-channel scaling"}],"papers":[],"projects":[]}', isError: false },
    ])
    expect(seen!.argv.join(' ')).not.toContain(seen!.token)
    if (cli === 'claude') {
      expect(seen!.argv).toEqual(expect.arrayContaining(['--strict-mcp-config', '--tools', '', '--setting-sources', 'project']))
      expect(seen!.configMode).toBe(0o600)
    } else {
      expect(seen!.argv).toEqual(expect.arrayContaining(['--ignore-user-config', '--ignore-rules']))
      const disabled = seen!.argv.flatMap((arg, at) => (seen!.argv[at - 1] === '--disable' ? [arg] : []))
      expect(disabled).toEqual(CODEX_DISABLED_FEATURES.filter((feature) => feature !== 'code_mode_host'))
    }
    expect(opened).toEqual([expect.any(String), 'closed'])
    expect(alive(seen!.serverPid)).toBe(false)
    expect(existsSync(opened[0]!)).toBe(false)
  })

  it('ends the server and the channel when the run is cancelled', async () => {
    const { runner, records, opened } = standIns([['title_search', { query: 'rotation' }]], { hang: true })
    const controller = new AbortController()

    const running = runner(call('codex', controller.signal))
    await until(() => records().length === 1)
    const [seen] = records()
    expect(alive(seen!.serverPid)).toBe(true)
    controller.abort()

    await expect(running).rejects.toMatchObject({ kind: 'cancelled' })
    expect(opened).toEqual([expect.any(String), 'closed'])
    await until(() => !alive(seen!.serverPid))
    expect(await refused(seen!.address)).toBe(true)
    expect(existsSync(opened[0]!)).toBe(false)
  })
})
