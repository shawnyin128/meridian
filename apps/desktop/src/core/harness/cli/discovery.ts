import { accessSync, constants, existsSync, readdirSync, statSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import type { HarnessCli, HarnessModelConnectionCheckResult } from '../../../shared/contract.js'
import { type ChildOutcome, cliEnvironment, CliRunError, inTemporaryFolder, runChild } from './child.js'
import { chatTurnFlags } from './chat-turn.js'
import { CLI_CALL_FAILURES, readiness } from './failure.js'
import { runnerFlags } from './runner.js'

const SYSTEM_FOLDERS = ['/opt/homebrew/bin', '/usr/local/bin'] as const
const PROBE_TIMEOUT_MS = 10_000
/** A top-level key of a status output that may appear in the log: a plain field name. */
const SHAPE_KEY = /^[A-Za-z_][\w-]{0,40}$/
/**
 * The Windows files each CLI may be, best first. cmd.exe cannot carry the schema and the multi-line
 * system prompt Claude takes as arguments, so an npm `claude.cmd` shim cannot run a call.
 */
const WINDOWS_FILES: Readonly<Record<HarnessCli, readonly string[]>> = {
  claude: ['claude.exe'],
  codex: ['codex.exe', 'codex.cmd'],
}

/** How a CLI is signed in: with the user's subscription, some other way, not at all, or unreadably. */
export type CliSignIn = 'subscription' | 'other' | 'signed-out' | 'unknown'

export type CliDiscovery =
  | { cli: HarnessCli; installed: false }
  | {
    cli: HarnessCli
    installed: true
    binary: string
    version: string | null
    /** The flags the runner or a chat turn passes that the CLI's help does not list. */
    missingFlags: string[]
    signIn: CliSignIn
  }

export type DiscoveryOptions = {
  /** The environment the App runs in; a Dock-launched App's has no shell PATH. */
  environment?: NodeJS.ProcessEnv
  home?: string
  /** The user's login shell. */
  shell?: string
  /** System folders a package manager installs commands into. */
  systemFolders?: readonly string[]
  platform?: NodeJS.Platform
  /** How long each command discovery runs the CLI with (version, help, sign-in status) may take; 10 s by default. */
  probeTimeoutMs?: number
  /** Where a line about a CLI that discovery cannot fully read goes. */
  onLog?: (line: string) => void
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function isExecutable(path: string, windows = false): boolean {
  try {
    accessSync(path, windows ? constants.F_OK : constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}

const variable = (environment: NodeJS.ProcessEnv, name: string) =>
  Object.entries(environment).find(([key]) => key.toUpperCase() === name)?.[1]

async function fromLoginShell(cli: HarnessCli, shell: string, environment: NodeJS.ProcessEnv, home: string) {
  let stdout: string
  try {
    ({ stdout } = await runChild(shell, ['-l', '-i', '-c', `command -v ${cli}`], {
      cwd: home, env: environment, timeoutMs: PROBE_TIMEOUT_MS,
    }))
  } catch (cause) {
    // A shell that cannot start or hangs leaves the known folders to look in.
    if (cause instanceof CliRunError) return null
    throw cause
  }
  // Startup files may print lines of their own, and an alias prints its definition, not a path.
  return stdout.split(/\r?\n/).map((line) => line.trim())
    .filter((line) => isAbsolute(line) && basename(line) === cli)
    .findLast((path) => isExecutable(path)) ?? null
}

function nodeVersionFolders(home: string): string[] {
  const versions = join(home, '.nvm', 'versions', 'node')
  if (!existsSync(versions)) return []
  return readdirSync(versions)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .map((version) => join(versions, version, 'bin'))
}

/**
 * The absolute path of the `cli` command, or null when it is not installed. Asks the user's login
 * shell first, then looks in ~/.local/bin, the Homebrew folders and the npm global folders. On
 * Windows it looks on PATH, in ~/.local/bin and in npm's %APPDATA%\\npm instead.
 */
export async function resolveCliBinary(cli: HarnessCli, options: DiscoveryOptions = {}): Promise<string | null> {
  const environment = options.environment ?? process.env
  const home = options.home ?? homedir()
  if ((options.platform ?? process.platform) === 'win32') {
    const appData = variable(environment, 'APPDATA')
    const folders = [
      ...(variable(environment, 'PATH') ?? '').split(';').filter((folder) => folder !== ''),
      join(home, '.local', 'bin'),
      ...(appData === undefined ? [] : [join(appData, 'npm')]),
    ]
    return folders.flatMap((folder) => WINDOWS_FILES[cli].map((file) => join(folder, file)))
      .find((path) => isExecutable(path, true)) ?? null
  }
  const shell = options.shell ?? environment['SHELL'] ?? userInfo().shell ?? '/bin/zsh'
  const found = await fromLoginShell(cli, shell, environment, home)
  if (found !== null) return found
  const folders = [
    join(home, '.local', 'bin'),
    ...(options.systemFolders ?? SYSTEM_FOLDERS),
    join(home, '.npm-global', 'bin'),
    ...nodeVersionFolders(home),
  ]
  return folders.map((folder) => join(folder, cli)).find((path) => isExecutable(path)) ?? null
}

/** Whether `help` lists `flag` as an option of its own, not as part of a longer one. */
const listsFlag = (help: string, flag: string) =>
  new RegExp(`(?<![\\w-])${flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(help)

/**
 * `help` with each pair of options it names as `--name[-variant]`, the way Claude Code's help names
 * `--system-prompt-file`, also written out as `--name --name-variant`.
 */
const withVariants = (help: string) => help.replace(/(--[\w-]+)\[(-[\w-]+)\]/g, '$1 $1$2')

function claudeSignIn(stdout: string): CliSignIn {
  let status: unknown
  try {
    status = JSON.parse(stdout)
  } catch {
    return 'unknown'
  }
  if (!isRecord(status) || typeof status['loggedIn'] !== 'boolean') return 'unknown'
  if (!status['loggedIn']) return 'signed-out'
  if (typeof status['authMethod'] !== 'string') return 'unknown'
  return status['authMethod'] === 'claude.ai' ? 'subscription' : 'other'
}

const typeName = (value: unknown) => (Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value)

/**
 * The shape of the sign-in status output `status`, never its content: the kind of JSON its stdout
 * holds, with the value type of each top-level key that is a plain field name, or how many lines of
 * text it printed, then how many lines its stderr holds and its exit code.
 */
function statusShape(status: ChildOutcome): string {
  const lines = (text: string) => text.split(/\r?\n/).filter((line) => line.trim() !== '').length
  let stdout = `${lines(status.stdout)} lines of text`
  try {
    const json: unknown = JSON.parse(status.stdout)
    if (!isRecord(json)) {
      stdout = `JSON ${typeName(json)}`
    } else {
      const keys = Object.keys(json).sort()
      const named = keys.filter((key) => SHAPE_KEY.test(key)).map((key) => `${key}: ${typeName(json[key])}`)
      const others = keys.length - named.length
      stdout = `a JSON object of ${[...named, ...(others === 0 ? [] : [`${others} other keys`])].join(', ') || 'no keys'}`
    }
  } catch {
    // Text, not JSON: its line count is all the shape it has.
  }
  return `stdout ${stdout}, stderr ${lines(status.stderr)} lines, exit ${String(status.code)}`
}

function codexSignIn(text: string): CliSignIn {
  if (/not logged in/i.test(text)) return 'signed-out'
  if (/logged in using chatgpt/i.test(text)) return 'subscription'
  return /logged in/i.test(text) ? 'other' : 'unknown'
}

/**
 * Where `cli` is installed, its version, which of the flags the runner and a chat turn pass its help
 * lacks and how it is signed in, read from its own `--version`, help and status commands without a
 * model call. Keeps nothing else of their output, and logs a sign-in status it cannot read through
 * `onLog` by its shape alone. Rejects with a CliRunError when the installed CLI cannot start or does
 * not answer in time.
 */
export async function discoverCli(cli: HarnessCli, options: DiscoveryOptions = {}): Promise<CliDiscovery> {
  const binary = await resolveCliBinary(cli, options)
  if (binary === null) return { cli, installed: false }
  const env = cliEnvironment(options.environment ?? process.env, binary)
  return inTemporaryFolder(async (folder) => {
    const probe = (args: string[]) => runChild(binary, args, {
      cwd: folder, env, timeoutMs: options.probeTimeoutMs ?? PROBE_TIMEOUT_MS,
      ...(options.platform === undefined ? {} : { platform: options.platform }),
    })
    const version = /\b\d+\.\d+\.\d+\b/.exec((await probe(['--version'])).stdout)?.[0] ?? null
    const help = await probe(cli === 'claude' ? ['--help'] : ['exec', '--help'])
    const missingFlags = [...new Set([...runnerFlags(cli), ...chatTurnFlags(cli)])]
      .filter((flag) => !listsFlag(withVariants(`${help.stdout}\n${help.stderr}`), flag))
    const status = await probe(cli === 'claude' ? ['auth', 'status', '--json'] : ['login', 'status'])
    const signIn = cli === 'claude' ? claudeSignIn(status.stdout) : codexSignIn(`${status.stdout}\n${status.stderr}`)
    if (signIn === 'unknown') {
      options.onLog?.(`${cli} ${version ?? '(no version)'}: its sign-in status is in no form Meridian reads: ${statusShape(status)}`)
    }
    return { cli, installed: true, binary, version, missingFlags, signIn }
  })
}

/**
 * The connection check of a subscription CLI: connected when `cli` is installed, its help lists
 * every flag the runner and a chat turn pass, and it is signed in with the user's subscription;
 * otherwise failed for the CLI problem a call would fail with. Reports the CLI's version when it has
 * one, and logs through `onLog` which flags an unsupported CLI lacks. Makes no model call.
 */
export async function checkCliConnection(
  cli: HarnessCli,
  options: DiscoveryOptions = {},
): Promise<HarnessModelConnectionCheckResult> {
  let version: string | null = null
  const failed = (
    reason: 'cli-missing' | 'cli-unsupported' | 'cli-signed-out' | 'cli-sign-in-unknown' | 'cli-timeout', detail: string,
  ) => ({
    state: 'failed' as const, reason, detail, ...(version === null ? {} : { version }),
    modelCalls: 0 as const, maxOutputTokens: 1 as const,
  })
  let found: CliDiscovery
  try {
    found = await discoverCli(cli, options)
  } catch (cause) {
    if (!(cause instanceof CliRunError)) throw cause
    return failed(cause.kind === 'timeout' ? 'cli-timeout' : 'cli-missing', cause.message)
  }
  if (found.installed) version = found.version
  const ready = readiness(found)
  if ('binary' in ready) {
    return { state: 'connected', ...(version === null ? {} : { version }), modelCalls: 0, maxOutputTokens: 1 }
  }
  if (found.installed && ready.kind === 'unsupported') {
    options.onLog?.(`${cli} ${found.version ?? '(no version)'}: its help lists no ${found.missingFlags.join(', ')}`)
  }
  return failed(CLI_CALL_FAILURES[ready.kind], ready.message)
}
