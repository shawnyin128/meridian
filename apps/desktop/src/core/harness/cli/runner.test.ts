import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, parse } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { HarnessCli } from '../../../shared/contract.js'
import { CODEX_DISABLED_FEATURES, createCliRunner, runnerFlags, strictSchema } from './runner.js'

/** What a stand-in CLI saw: its arguments, stdin, the variables of interest and its folder. */
type Seen = {
  argv: string[]
  stdin: string
  env: { [name: string]: string | undefined }
  cwd: string
  entries: string[]
  pid: number
  schema?: unknown
}

/** What a stand-in CLI answers: stdout, stderr, an exit code, a last message for `-o`, or no end at all. */
type Reply = { stdout?: string; stderr?: string; exit?: number; lastMessage?: string; hang?: boolean }

const RECORDED_VARIABLES = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY', 'HOME', 'PATH', 'KEEP_ME',
]

const STAND_IN = `#!${process.execPath}
const fs = require('node:fs')
const argv = process.argv.slice(2)
const at = (flag) => { const index = argv.indexOf(flag); return index < 0 ? undefined : argv[index + 1] }
let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { stdin += chunk })
process.stdin.on('end', () => {
  const env = Object.fromEntries(${JSON.stringify(RECORDED_VARIABLES)}.map((name) => [name, process.env[name]]))
  const record = { argv, stdin, env, cwd: process.cwd(), entries: fs.readdirSync('.'), pid: process.pid }
  if (at('--output-schema') !== undefined) record.schema = JSON.parse(fs.readFileSync(at('--output-schema'), 'utf8'))
  const reply = JSON.parse(process.env.STAND_IN_REPLY)
  if (reply.lastMessage !== undefined) fs.writeFileSync(at('-o'), reply.lastMessage)
  fs.appendFileSync(process.env.STAND_IN_RECORD, JSON.stringify(record) + '\\n')
  if (reply.hang) { setInterval(() => {}, 1000); return }
  process.stdout.write(reply.stdout ?? '')
  process.stderr.write(reply.stderr ?? '')
  process.exitCode = reply.exit ?? 0
})
`

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', default: 'untitled' },
    default: { $ref: '#/$defs/Item' },
    items: { type: 'array', items: { $ref: '#/$defs/Item' }, default: [] },
  },
  required: ['title'],
  $defs: {
    Item: {
      type: 'object',
      properties: { text: { type: 'string' }, pages: { type: 'array', default: [] } },
      required: ['text'],
    },
  },
}

const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** A folder holding stand-in `claude` and `codex` executables and the file they record to. */
function standIns(reply: Reply) {
  const root = mkdtempSync(join(tmpdir(), 'meridian-cli-test-'))
  folders.push(root)
  const bin = join(root, 'bin')
  mkdirSync(bin)
  for (const name of ['claude', 'codex']) {
    writeFileSync(join(bin, name), STAND_IN)
    chmodSync(join(bin, name), 0o755)
  }
  const recordFile = join(root, 'record.jsonl')
  const environment = {
    ...process.env,
    ANTHROPIC_API_KEY: 'sk-ant-must-not-cross',
    ANTHROPIC_AUTH_TOKEN: 'token-must-not-cross',
    OPENAI_API_KEY: 'sk-must-not-cross',
    KEEP_ME: 'kept',
    PATH: '/usr/bin:/bin',
    STAND_IN_RECORD: recordFile,
    STAND_IN_REPLY: JSON.stringify(reply),
  }
  const runner = createCliRunner({
    binary: async (cli: HarnessCli) => join(bin, cli),
    environment,
  })
  const records = (): Seen[] => existsSync(recordFile)
    ? readFileSync(recordFile, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Seen)
    : []
  return { bin, runner, records }
}

const call = (cli: HarnessCli, signal = new AbortController().signal) => ({
  cli, system: 'System rules', prompt: 'Paper scope', schema: SCHEMA, timeoutMs: 20_000, signal,
})

/** Whether `folder` or one of its ancestors holds a `.git`, which would make it part of a repository. */
function insideRepository(folder: string): boolean {
  for (let at = folder; ; at = dirname(at)) {
    if (existsSync(join(at, '.git'))) return true
    if (at === parse(at).root) return false
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function until(check: () => boolean) {
  for (let tries = 0; !check(); tries += 1) {
    if (tries > 200) throw new Error('the stand-in never started')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

const claudeResult = (fields: object) => JSON.stringify({
  type: 'result', subtype: 'success', is_error: false, num_turns: 3,
  usage: { input_tokens: 4, cache_creation_input_tokens: 6_102, cache_read_input_tokens: 87_410, output_tokens: 11_382 },
  ...fields,
})

const codexEvents = (...usages: object[]) => [
  { type: 'thread.started', thread_id: 't1' },
  ...usages.flatMap((usage) => [{ type: 'turn.started' }, { type: 'turn.completed', usage }]),
].map((event) => JSON.stringify(event)).join('\n')

describe('subscription CLI runner', () => {
  it('runs claude with the isolation flags and the prompt on stdin in an empty folder outside any repository, then removes it', async () => {
    const { bin, runner, records } = standIns({
      stdout: claudeResult({ structured_output: { title: 'Draft' } }),
    })

    const result = await runner({ ...call('claude'), model: 'opus' })

    const [record] = records()
    expect(record!.argv).toEqual([
      '-p', '--output-format', 'json', '--json-schema', JSON.stringify(strictSchema(SCHEMA)),
      '--tools', '', '--strict-mcp-config', '--setting-sources', 'project',
      '--no-session-persistence', '--system-prompt', 'System rules', '--model=opus',
    ])
    expect(record!.stdin).toBe('Paper scope')
    expect(record!.entries).toEqual([])
    expect(insideRepository(record!.cwd)).toBe(false)
    expect(record!.cwd.startsWith(bin)).toBe(false)
    expect(existsSync(record!.cwd)).toBe(false)
    expect(result).toMatchObject({
      output: { title: 'Draft' },
      turns: 3,
      usage: { inputTokens: 93_516, cachedInputTokens: 87_410, outputTokens: 11_382 },
    })
  })

  it('removes the API-key variables from the child\'s environment and keeps the rest', async () => {
    const { bin, runner, records } = standIns({
      stdout: claudeResult({ structured_output: { title: 'Draft' } }),
    })

    await runner(call('claude'))

    const { env } = records()[0]!
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined()
    expect(env['ANTHROPIC_AUTH_TOKEN']).toBeUndefined()
    expect(env['OPENAI_API_KEY']).toBeUndefined()
    expect(env['KEEP_ME']).toBe('kept')
    expect(env['HOME']).toBe(process.env['HOME'])
    expect(env['PATH']).toBe(`${bin}:/usr/bin:/bin`)
  })

  it('runs codex with its tool features off, the strict schema in a file and the last message read from -o', async () => {
    const { runner, records } = standIns({
      stdout: codexEvents(
        { input_tokens: 40_317, cached_input_tokens: 0, output_tokens: 2_932 },
        { input_tokens: 1_000, cached_input_tokens: 800, output_tokens: 10 },
      ),
      lastMessage: JSON.stringify({ title: 'Draft' }),
    })

    const result = await runner({ ...call('codex'), model: 'gpt-5.5' })

    const [record] = records()
    const flag = (name: string) => record!.argv[record!.argv.indexOf(name) + 1]
    expect(record!.argv.slice(0, 11)).toEqual([
      'exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
      '--ignore-user-config', '--ignore-rules', '--json', '--color', 'never', '--output-schema',
    ])
    // The child sees the real path of the folder (/private/var on macOS); its unique name matches.
    expect(flag('-C')!.split('/').slice(-2)).toEqual(record!.cwd.split('/').slice(-2))
    expect(CODEX_DISABLED_FEATURES.length).toBeGreaterThan(0)
    for (const feature of CODEX_DISABLED_FEATURES) {
      expect(record!.argv.join(' ')).toContain(`--disable ${feature}`)
    }
    expect(record!.argv.slice(-2)).toEqual(['--model=gpt-5.5', '-'])
    expect(record!.stdin).toBe('System rules\n\nPaper scope')
    expect(record!.entries).toEqual([])
    expect(insideRepository(record!.cwd)).toBe(false)
    expect(existsSync(flag('--output-schema')!)).toBe(false)
    expect(existsSync(record!.cwd)).toBe(false)
    expect(record!.schema).toEqual({
      type: 'object',
      properties: {
        title: { type: 'string' },
        default: { $ref: '#/$defs/Item' },
        items: { type: 'array', items: { $ref: '#/$defs/Item' } },
      },
      required: ['title', 'default', 'items'],
      additionalProperties: false,
      $defs: {
        Item: {
          type: 'object',
          properties: { text: { type: 'string' }, pages: { type: 'array' } },
          required: ['text', 'pages'],
          additionalProperties: false,
        },
      },
    })
    expect(result).toMatchObject({
      output: { title: 'Draft' },
      turns: 2,
      usage: { inputTokens: 41_317, cachedInputTokens: 800, outputTokens: 2_942 },
    })
  })

  it('returns no output when the CLI gives none that parses, so the caller\'s validation rejects it', async () => {
    const claude = standIns({
      stdout: claudeResult({ subtype: 'error_max_structured_output_retries', is_error: true }),
      exit: 1,
    })
    await expect(claude.runner(call('claude'))).resolves.toMatchObject({ output: null, turns: 3 })

    const codex = standIns({ stdout: codexEvents({ input_tokens: 1, output_tokens: 1 }), lastMessage: 'not json' })
    await expect(codex.runner(call('codex'))).resolves.toMatchObject({ output: null })
    expect(claude.records()).toHaveLength(1)
    expect(codex.records()).toHaveLength(1)
  })

  it('reports an error the CLI gives as a failure in its own words, once and without a retry', async () => {
    const claude = standIns({
      stdout: claudeResult({ is_error: true, result: 'Claude AI usage limit reached' }),
      exit: 1,
    })
    await expect(claude.runner(call('claude'))).rejects.toMatchObject({
      kind: 'failed', message: expect.stringContaining('Claude AI usage limit reached'),
    })
    expect(claude.records()).toHaveLength(1)

    const codex = standIns({
      stdout: `${codexEvents()}\n${JSON.stringify({ type: 'turn.failed', error: { message: 'You hit your usage limit' } })}`,
      exit: 1,
    })
    await expect(codex.runner(call('codex'))).rejects.toMatchObject({
      kind: 'failed', message: expect.stringContaining('You hit your usage limit'),
    })
    expect(codex.records()).toHaveLength(1)
  })

  it('gives a failure the CLI\'s exit code and the redacted end of its stderr', async () => {
    const claude = standIns({
      stdout: claudeResult({ is_error: true, result: 'Claude AI usage limit reached' }),
      stderr: 'warming up\nAuthorization: Bearer sk-ant-oat01-secretsecretsecret\nrate limited until 15:00\n',
      exit: 1,
    })
    const failure = await claude.runner(call('claude')).catch((cause: unknown) => cause)
    expect(failure).toMatchObject({ kind: 'failed', exitCode: 1 })
    expect((failure as { stderr: string }).stderr).toMatch(/rate limited until 15:00$/)
    expect((failure as { stderr: string }).stderr).not.toContain('sk-ant')

    const codex = standIns({ stdout: 'not json', stderr: 'ERROR: 401 Unauthorized\n', exit: 2 })
    await expect(codex.runner(call('codex'))).rejects.toMatchObject({
      kind: 'failed', exitCode: 2, stderr: 'ERROR: 401 Unauthorized',
    })
  })

  it('cancelling ends the child and removes its folder', async () => {
    const { runner, records } = standIns({ hang: true })
    const controller = new AbortController()

    const running = runner(call('claude', controller.signal))
    await until(() => records().length === 1)
    controller.abort()

    await expect(running).rejects.toMatchObject({ kind: 'cancelled' })
    const [record] = records()
    expect(alive(record!.pid)).toBe(false)
    expect(existsSync(record!.cwd)).toBe(false)
  })

  it('a run past its timeout ends the child', async () => {
    const { runner, records } = standIns({ hang: true })

    await expect(runner({ ...call('codex'), timeoutMs: 500 })).rejects.toMatchObject({ kind: 'timeout' })

    const [record] = records()
    expect(alive(record!.pid)).toBe(false)
    expect(existsSync(record!.cwd)).toBe(false)
  })

  it('names every flag it passes, the way each CLI\'s help lists them', () => {
    expect(runnerFlags('claude')).toEqual([
      '-p', '--output-format', '--json-schema', '--tools', '--strict-mcp-config', '--setting-sources',
      '--no-session-persistence', '--system-prompt', '--model',
    ])
    expect(runnerFlags('codex')).toEqual([
      '--ephemeral', '--skip-git-repo-check', '--sandbox', '--ignore-user-config', '--ignore-rules', '--json',
      '--color', '--output-schema', '-o', '-C', '--disable', '--model',
    ])
  })

  it('a CLI that is not installed or does not start is unavailable', async () => {
    const missing = createCliRunner({ binary: async () => null, environment: {} })
    await expect(missing(call('claude'))).rejects.toMatchObject({ kind: 'unavailable' })

    const broken = createCliRunner({ binary: async () => join(tmpdir(), 'meridian-no-such-cli'), environment: {} })
    await expect(broken(call('codex'))).rejects.toMatchObject({ kind: 'unavailable' })
  })
})
