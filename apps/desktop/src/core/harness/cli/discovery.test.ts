import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HarnessCli } from '../../../shared/contract.js'
import type { CoreLogLevel } from '../../core-log.js'
import { CliRunError, type CliFailureKind } from './child.js'
import { checkCliConnection, type DiscoveryOptions, discoverCli, resolveCliBinary } from './discovery.js'
import { chatTurnFlags } from './chat-turn.js'
import { type CliCall, type CliRunner, runnerFlags } from './runner.js'

/**
 * Answers `--version`, `--help` (`exec --help` for Codex), `auth status --json` (Claude) and
 * `login status` (Codex, on stderr) and records each call.
 */
const STAND_IN = `#!${process.execPath}
const fs = require('node:fs')
const argv = process.argv.slice(2)
fs.appendFileSync(process.env.STAND_IN_RECORD, JSON.stringify({
  argv, apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY ?? null,
}) + '\\n')
if (argv.includes('--help')) process.stdout.write(process.env.STAND_IN_HELP)
else if (argv[0] === '--version') process.stdout.write(process.env.STAND_IN_VERSION)
else if (argv[0] === 'auth') process.stdout.write(process.env.STAND_IN_STATUS)
else { process.stderr.write(process.env.STAND_IN_STATUS); process.exitCode = Number(process.env.STAND_IN_STATUS_EXIT ?? 0) }
`

/** Help text listing every flag the runner and a chat turn pass to either CLI, one option per line. */
const FULL_HELP = [...runnerFlags('claude'), ...runnerFlags('codex'), ...chatTurnFlags('claude'), ...chatTurnFlags('codex')]
  .map((flag) => `  ${flag} <value>    What the option does`).join('\n')

const CLAUDE_STATUS = JSON.stringify({
  loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty',
  email: 'researcher@example.org', orgName: 'Example Lab', orgId: 'org-123',
})

const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

function scratch(): string {
  const folder = mkdtempSync(join(tmpdir(), 'meridian-discovery-test-'))
  folders.push(folder)
  return folder
}

function executable(path: string, body: string): string {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, body)
  chmodSync(path, 0o755)
  return path
}

/** A home folder, an environment with no PATH, and a login shell that knows nothing. */
function machine(answers: { version?: string; help?: string; status?: string; statusExit?: number } = {}) {
  const root = scratch()
  const home = join(root, 'home')
  mkdirSync(home)
  const record = join(root, 'record.jsonl')
  const silentShell = executable(join(root, 'shell', 'silent'), '#!/bin/sh\necho "welcome from .zshrc"\n')
  const environment: NodeJS.ProcessEnv = {
    HOME: home,
    ANTHROPIC_API_KEY: 'sk-ant-must-not-cross',
    OPENAI_API_KEY: 'sk-must-not-cross',
    STAND_IN_RECORD: record,
    STAND_IN_VERSION: answers.version ?? '2.1.280 (Claude Code)\n',
    STAND_IN_HELP: answers.help ?? FULL_HELP,
    STAND_IN_STATUS: answers.status ?? CLAUDE_STATUS,
    STAND_IN_STATUS_EXIT: String(answers.statusExit ?? 0),
  }
  const options = { environment, home, shell: silentShell, systemFolders: [] }
  const calls = () => existsSync(record)
    ? readFileSync(record, 'utf8').split('\n').filter((line) => line !== '')
      .map((line) => JSON.parse(line) as { argv: string[]; apiKey: string | null })
    : []
  return { root, home, environment, options, calls }
}

/** A stand-in runner that answers each call with a one-word output, or fails it with `failure`, recording every call. */
function standInRunner(failure?: CliRunError) {
  const calls: CliCall[] = []
  const run: CliRunner = async (call) => {
    calls.push(call)
    if (failure !== undefined) throw failure
    return { output: { word: 'ok' }, usage: { inputTokens: 18_204, cachedInputTokens: 0, outputTokens: 5 }, turns: 1, durationMs: 4_200 }
  }
  return { run, calls }
}

/** The connection check of `cli`, with `model` when given, its model call made through `run`. */
const check = (cli: HarnessCli, options: DiscoveryOptions & { onLog?: (level: CoreLogLevel, line: string) => void }, run = standInRunner().run, model?: string) =>
  checkCliConnection({ source: 'cli', cli, ...(model === undefined ? {} : { model }) }, { ...options, run })

describe('subscription CLI discovery', () => {
  it('finds a CLI through the user\'s login shell when the App has no PATH', async () => {
    const { root, options } = machine()
    const claude = executable(join(root, 'elsewhere', 'claude'), STAND_IN)
    const argsFile = join(root, 'shell-args')
    const shell = executable(join(root, 'shell', 'login'), [
      '#!/bin/sh',
      `printf '%s\\n' "$@" > '${argsFile}'`,
      'echo "alias claude=/somewhere/else"',
      `echo '${claude}'`,
    ].join('\n'))

    await expect(resolveCliBinary('claude', { ...options, shell })).resolves.toBe(claude)
    expect(readFileSync(argsFile, 'utf8').split('\n').filter((line) => line !== '')).toEqual(['-l', '-i', '-c', 'command -v claude'])
  })

  it('falls back to ~/.local/bin, then Homebrew and the npm folders, newest Node first', async () => {
    const { root, home, options } = machine()
    expect(options.environment['PATH']).toBeUndefined()
    await expect(resolveCliBinary('claude', options)).resolves.toBeNull()

    const brew = executable(join(root, 'opt', 'homebrew', 'bin', 'claude'), STAND_IN)
    await expect(resolveCliBinary('claude', { ...options, systemFolders: [join(root, 'opt', 'homebrew', 'bin')] }))
      .resolves.toBe(brew)
    const local = executable(join(home, '.local', 'bin', 'claude'), STAND_IN)
    await expect(resolveCliBinary('claude', { ...options, systemFolders: [join(root, 'opt', 'homebrew', 'bin')] }))
      .resolves.toBe(local)

    executable(join(home, '.nvm', 'versions', 'node', 'v9.11.2', 'bin', 'codex'), STAND_IN)
    const newest = executable(join(home, '.nvm', 'versions', 'node', 'v22.1.0', 'bin', 'codex'), STAND_IN)
    await expect(resolveCliBinary('codex', options)).resolves.toBe(newest)
    const npmGlobal = executable(join(home, '.npm-global', 'bin', 'codex'), STAND_IN)
    await expect(resolveCliBinary('codex', options)).resolves.toBe(npmGlobal)
  })

  it('reports the version and a Claude subscription sign-in, and nothing else of the status', async () => {
    const { home, options, calls } = machine()
    const claude = executable(join(home, '.local', 'bin', 'claude'), STAND_IN)

    const found = await discoverCli('claude', options)

    expect(found).toEqual({
      cli: 'claude', installed: true, binary: claude, version: '2.1.280', missingFlags: [], signIn: 'subscription',
    })
    expect(JSON.stringify(found)).not.toMatch(/researcher|Example Lab|org-123/)
    expect(calls().map((call) => call.argv)).toEqual([['--version'], ['--help'], ['auth', 'status', '--json']])
    expect(calls().every((call) => call.apiKey === null)).toBe(true)
  })

  it('takes a ChatGPT login of codex as a subscription, and an API-key login or none as not one', async () => {
    const chatgpt = machine({ version: 'codex-cli 0.163.0\n', status: 'Logged in using ChatGPT\n' })
    executable(join(chatgpt.home, '.local', 'bin', 'codex'), STAND_IN)
    await expect(discoverCli('codex', chatgpt.options)).resolves.toMatchObject({ version: '0.163.0', signIn: 'subscription' })
    expect(chatgpt.calls().map((call) => call.argv)).toEqual([['--version'], ['exec', '--help'], ['login', 'status']])

    const apiKey = machine({ version: 'codex-cli 0.163.0\n', status: 'Logged in using an API key - sk-proj-***ABCD\n' })
    executable(join(apiKey.home, '.local', 'bin', 'codex'), STAND_IN)
    const found = await discoverCli('codex', apiKey.options)
    expect(found).toMatchObject({ signIn: 'other' })
    expect(JSON.stringify(found)).not.toContain('sk-proj')

    const signedOut = machine({ version: 'codex-cli 0.163.0\n', status: 'Not logged in\n', statusExit: 1 })
    executable(join(signedOut.home, '.local', 'bin', 'codex'), STAND_IN)
    await expect(discoverCli('codex', signedOut.options)).resolves.toMatchObject({ signIn: 'signed-out' })
  })

  it('fails the check of a sign-in it cannot read as its own reason, logging the status output\'s shape and none of its content', async () => {
    const results: unknown[] = []
    const logs: string[] = []
    for (const [cli, status] of [
      ['claude', 'Logged in as researcher@example.org\nToken sk-ant-oat01-secretsecret\n'],
      ['claude', JSON.stringify({ signedIn: true, method: 'claude.ai', account: { email: 'researcher@example.org' } })],
      ['codex', 'Signed in with ChatGPT as researcher@example.org\n'],
    ] as const) {
      const unreadable = machine({ version: '9.9.9\n', status })
      executable(join(unreadable.home, '.local', 'bin', cli), STAND_IN)
      results.push(await check(cli, { ...unreadable.options, onLog: (level, line) => logs.push(`${level} ${line}`) }))
    }

    expect(results).toEqual(['claude', 'claude', 'codex'].map((cli) => ({
      state: 'failed', reason: 'cli-sign-in-unknown', detail: `读不出 ${cli} 的登录状态`, version: '9.9.9', modelCalls: 0,
    })))
    expect(logs).toEqual([
      'warn claude 9.9.9: its sign-in status is in no form Meridian reads: stdout 2 lines of text, stderr 0 lines, exit 0',
      'warn claude 9.9.9: its sign-in status is in no form Meridian reads: '
        + 'stdout a JSON object of account: object, method: string, signedIn: boolean, stderr 0 lines, exit 0',
      'warn codex 9.9.9: its sign-in status is in no form Meridian reads: stdout 0 lines of text, stderr 1 lines, exit 0',
    ])
    expect(logs.join('\n')).not.toMatch(/researcher|sk-ant|secret|claude\.ai|Logged|ChatGPT as/)
  })

  it('checks installation, the flags its help lists and sign-in before any model call, naming the CLI problem', async () => {
    const runner = standInRunner()
    const missing = machine()
    await expect(check('claude', missing.options, runner.run)).resolves.toEqual({
      state: 'failed', reason: 'cli-missing', detail: '没有找到 claude 命令', modelCalls: 0,
    })

    const logs: string[] = []
    const old = machine({ version: '2.0.9 (Claude Code)\n', help: FULL_HELP.replace(/^ {2}--json-schema .*$/m, '') })
    executable(join(old.home, '.local', 'bin', 'claude'), STAND_IN)
    const unsupported = await check('claude', { ...old.options, onLog: (level, line) => logs.push(`${level} ${line}`) })
    expect(unsupported).toMatchObject({ state: 'failed', reason: 'cli-unsupported', version: '2.0.9', modelCalls: 0 })
    expect(JSON.stringify(unsupported)).not.toContain('json-schema')
    expect(logs).toEqual([expect.stringMatching(/^warn .*--json-schema/)])
    const noStreaming = machine({ help: FULL_HELP.replace(/^ {2}--include-partial-messages .*$/m, '') })
    executable(join(noStreaming.home, '.local', 'bin', 'claude'), STAND_IN)
    await expect(check('claude', noStreaming.options)).resolves.toMatchObject({
      state: 'failed', reason: 'cli-unsupported', modelCalls: 0,
    })
    const variantHelp = machine({
      help: `${FULL_HELP.replace(/^ {2}--system-prompt-file .*$/m, '')}\n  --bare    Provide context via: --system-prompt[-file], --mcp-config`,
    })
    executable(join(variantHelp.home, '.local', 'bin', 'claude'), STAND_IN)
    await expect(check('claude', variantHelp.options)).resolves.toMatchObject({ state: 'connected' })
    const noVariant = machine({ help: FULL_HELP.replace(/^ {2}--system-prompt-file .*$/m, '') })
    executable(join(noVariant.home, '.local', 'bin', 'claude'), STAND_IN)
    await expect(check('claude', noVariant.options)).resolves.toMatchObject({ reason: 'cli-unsupported' })
    for (const [cli, flag] of [['claude', '--resume'], ['claude', '--effort'], ['codex', 'resume']] as const) {
      const noResume = machine({ help: FULL_HELP.replace(new RegExp(`^ {2}${flag} .*$`, 'gm'), '') })
      executable(join(noResume.home, '.local', 'bin', cli), STAND_IN)
      await expect(check(cli, noResume.options)).resolves.toMatchObject({
        state: 'failed', reason: 'cli-unsupported', modelCalls: 0,
      })
    }

    const apiKey = machine({ status: JSON.stringify({ loggedIn: true, authMethod: 'api_key' }) })
    executable(join(apiKey.home, '.local', 'bin', 'claude'), STAND_IN)
    await expect(check('claude', apiKey.options)).resolves.toMatchObject({
      state: 'failed', reason: 'cli-signed-out', detail: 'claude 没有用 Claude 订阅登录', modelCalls: 0,
    })

    const signedOut = machine({ status: JSON.stringify({ loggedIn: false }) })
    executable(join(signedOut.home, '.local', 'bin', 'claude'), STAND_IN)
    await expect(check('claude', signedOut.options, runner.run)).resolves.toMatchObject({
      state: 'failed', reason: 'cli-signed-out', detail: 'claude 还没有登录', modelCalls: 0,
    })
    expect(runner.calls).toEqual([])
  })

  it('once the CLI is ready makes one model call through the runner, on the chosen model or the CLI\'s default, and keeps nothing of its answer', async () => {
    const signedIn = machine({ version: '0.0.1 (Claude Code)\n' })
    executable(join(signedIn.home, '.local', 'bin', 'claude'), STAND_IN)
    const runner = standInRunner()
    const logs: string[] = []

    await expect(check('claude', { ...signedIn.options, onLog: (level, line) => logs.push(`${level} ${line}`) }, runner.run)).resolves.toEqual({
      state: 'connected', version: '0.0.1', modelCalls: 1,
    })
    await check('claude', signedIn.options, runner.run, 'opus')

    expect(signedIn.calls().map((call) => call.argv).slice(0, 3)).toEqual([['--version'], ['--help'], ['auth', 'status', '--json']])
    expect(runner.calls.map((call) => [call.cli, call.model, call.lookup])).toEqual([['claude', undefined, undefined], ['claude', 'opus', undefined]])
    expect(runner.calls[0]!.prompt.length + runner.calls[0]!.system.length).toBeLessThan(200)
    expect(runner.calls[0]!.schema).toEqual({
      type: 'object', properties: { word: { type: 'string', maxLength: 40 } }, required: ['word'], additionalProperties: false,
    })
    expect(logs).toEqual(['info claude: 4.2 s, 1 turns, 18204 input tokens (0 cached), 5 output tokens'])
  })

  it('makes the check\'s model call at the CLI\'s own default effort, whatever effort the model is set to', async () => {
    const signedIn = machine()
    executable(join(signedIn.home, '.local', 'bin', 'claude'), STAND_IN)
    const runner = standInRunner()

    await expect(checkCliConnection({ source: 'cli', cli: 'claude', model: 'opus', effort: 'max' }, { ...signedIn.options, run: runner.run }))
      .resolves.toMatchObject({ state: 'connected' })

    expect(runner.calls.map((call) => [call.model, call.effort])).toEqual([['opus', undefined]])
  })

  it.each([
    ['model-unavailable', 'cli-model-unavailable', 1],
    ['usage-limit', 'cli-usage-limit', 1],
    ['timeout', 'cli-timeout', 1],
    ['failed', 'unknown', 1],
    ['signed-out', 'cli-signed-out', 0],
    ['unavailable', 'cli-missing', 0],
  ] as const)('a model call that fails as %s fails the check as %s, in the CLI\'s words', async (kind: CliFailureKind, reason, modelCalls) => {
    const signedIn = machine({ status: 'Logged in using ChatGPT\n' })
    executable(join(signedIn.home, '.local', 'bin', 'codex'), STAND_IN)
    const failure = new CliRunError(kind, `codex 运行失败：${kind}`)

    await expect(check('codex', signedIn.options, standInRunner(failure).run, 'gpt-9')).resolves.toEqual({
      state: 'failed', reason, detail: `codex 运行失败：${kind}`, version: '2.1.280', modelCalls,
    })
  })

  it('fails the check of a CLI that does not answer in time as a CLI timeout, and ends it', async () => {
    const slow = machine()
    const pidFile = join(slow.root, 'pid')
    executable(join(slow.home, '.local', 'bin', 'claude'), `#!${process.execPath}
require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))
setInterval(() => {}, 1000)
`)

    await expect(check('claude', { ...slow.options, probeTimeoutMs: 300 })).resolves.toMatchObject({
      state: 'failed', reason: 'cli-timeout', modelCalls: 0,
    })
    const pid = Number(readFileSync(pidFile, 'utf8'))
    await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow())
  }, 20_000)

  it('on Windows finds codex as an npm .cmd shim on PATH or in %APPDATA%\\npm, an .exe first, and claude only as an .exe', async () => {
    const { root, options } = machine()
    const onPath = join(root, 'tools')
    const appData = join(root, 'AppData', 'Roaming')
    const windows = {
      ...options, platform: 'win32' as const,
      environment: { ...options.environment, Path: onPath, APPDATA: appData },
    }
    await expect(resolveCliBinary('codex', windows)).resolves.toBeNull()

    const npmShim = executable(join(appData, 'npm', 'codex.cmd'), '@ECHO off')
    await expect(resolveCliBinary('codex', windows)).resolves.toBe(npmShim)
    const pathShim = executable(join(onPath, 'codex.cmd'), '@ECHO off')
    await expect(resolveCliBinary('codex', windows)).resolves.toBe(pathShim)
    const pathExe = executable(join(onPath, 'codex.exe'), 'MZ')
    await expect(resolveCliBinary('codex', windows)).resolves.toBe(pathExe)

    executable(join(appData, 'npm', 'claude.cmd'), '@ECHO off')
    await expect(resolveCliBinary('claude', windows)).resolves.toBeNull()
    const claudeExe = executable(join(root, 'home', '.local', 'bin', 'claude.exe'), 'MZ')
    await expect(resolveCliBinary('claude', windows)).resolves.toBe(claudeExe)
  })
})
