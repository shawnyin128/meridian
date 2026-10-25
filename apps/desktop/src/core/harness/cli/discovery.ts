import { accessSync, constants, existsSync, readdirSync, statSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { basename, delimiter, isAbsolute, join } from 'node:path'
import type { HarnessCli, HarnessModelConnectionCheckResult } from '../../../shared/contract.js'
import { cliEnvironment, CliRunError, inTemporaryFolder, runChild } from './child.js'

/** The oldest versions known to take every flag the runner passes: the ones the demo of 2026-10-25 ran. */
export const MINIMUM_CLI_VERSIONS: Readonly<Record<HarnessCli, string>> = { claude: '2.1.280', codex: '0.163.0' }

const SYSTEM_FOLDERS = ['/opt/homebrew/bin', '/usr/local/bin'] as const
const PROBE_TIMEOUT_MS = 10_000

/** How a CLI is signed in: with the user's subscription, some other way, not at all, or unreadably. */
export type CliSignIn = 'subscription' | 'other' | 'signed-out' | 'unknown'

export type CliDiscovery =
  | { cli: HarnessCli; installed: false }
  | { cli: HarnessCli; installed: true; binary: string; version: string | null; signIn: CliSignIn }

export type DiscoveryOptions = {
  /** The environment the App runs in; a Dock-launched App's has no shell PATH. */
  environment?: NodeJS.ProcessEnv
  home?: string
  /** The user's login shell. */
  shell?: string
  /** System folders a package manager installs commands into. */
  systemFolders?: readonly string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}

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
    .findLast(isExecutable) ?? null
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
 * shell first, then looks in ~/.local/bin, the Homebrew folders and the npm global folders.
 */
export async function resolveCliBinary(cli: HarnessCli, options: DiscoveryOptions = {}): Promise<string | null> {
  const environment = options.environment ?? process.env
  const home = options.home ?? homedir()
  const windows = process.platform === 'win32'
  if (!windows) {
    const shell = options.shell ?? environment['SHELL'] ?? userInfo().shell ?? '/bin/zsh'
    const found = await fromLoginShell(cli, shell, environment, home)
    if (found !== null) return found
  }
  const folders = [
    ...(windows ? (environment['PATH'] ?? environment['Path'] ?? '').split(delimiter).filter((folder) => folder !== '') : []),
    join(home, '.local', 'bin'),
    ...(options.systemFolders ?? SYSTEM_FOLDERS),
    join(home, '.npm-global', 'bin'),
    ...nodeVersionFolders(home),
  ]
  return folders.map((folder) => join(folder, windows ? `${cli}.exe` : cli)).find(isExecutable) ?? null
}

function claudeSignIn(stdout: string): CliSignIn {
  let status: unknown
  try {
    status = JSON.parse(stdout)
  } catch {
    return 'unknown'
  }
  if (!isRecord(status)) return 'unknown'
  if (status['loggedIn'] !== true) return 'signed-out'
  return status['authMethod'] === 'claude.ai' ? 'subscription' : 'other'
}

function codexSignIn(text: string): CliSignIn {
  if (/not logged in/i.test(text)) return 'signed-out'
  if (/logged in using chatgpt/i.test(text)) return 'subscription'
  return /logged in/i.test(text) ? 'other' : 'unknown'
}

/**
 * Where `cli` is installed, its version and how it is signed in, read from its own `--version` and
 * status commands without a model call. Keeps nothing else of their output. Rejects with a
 * CliRunError when the installed CLI cannot start or does not answer in time.
 */
export async function discoverCli(cli: HarnessCli, options: DiscoveryOptions = {}): Promise<CliDiscovery> {
  const binary = await resolveCliBinary(cli, options)
  if (binary === null) return { cli, installed: false }
  const env = cliEnvironment(options.environment ?? process.env, binary)
  return inTemporaryFolder(async (folder) => {
    const probe = (args: string[]) => runChild(binary, args, { cwd: folder, env, timeoutMs: PROBE_TIMEOUT_MS })
    const version = /\b\d+\.\d+\.\d+\b/.exec((await probe(['--version'])).stdout)?.[0] ?? null
    const status = await probe(cli === 'claude' ? ['auth', 'status', '--json'] : ['login', 'status'])
    const signIn = cli === 'claude' ? claudeSignIn(status.stdout) : codexSignIn(`${status.stdout}\n${status.stderr}`)
    return { cli, installed: true, binary, version, signIn }
  })
}

function atLeast(version: string, minimum: string): boolean {
  const have = version.split('.').map(Number)
  const need = minimum.split('.').map(Number)
  for (let index = 0; index < need.length; index += 1) {
    if (have[index] !== need[index]) return (have[index] ?? 0) > need[index]!
  }
  return true
}

/**
 * The connection check of a subscription CLI: connected when `cli` is installed, at least
 * MINIMUM_CLI_VERSIONS, and signed in with the user's subscription. Makes no model call.
 */
export async function checkCliConnection(
  cli: HarnessCli,
  options: DiscoveryOptions = {},
): Promise<HarnessModelConnectionCheckResult> {
  const failed = (reason: 'unavailable' | 'timeout' | 'configuration' | 'authentication', detail: string) => ({
    state: 'failed' as const, reason, detail, modelCalls: 0 as const, maxOutputTokens: 1 as const,
  })
  let found: CliDiscovery
  try {
    found = await discoverCli(cli, options)
  } catch (cause) {
    if (!(cause instanceof CliRunError)) throw cause
    return failed(cause.kind === 'timeout' ? 'timeout' : 'unavailable', cause.message)
  }
  if (!found.installed) return failed('unavailable', `没有找到 ${cli} 命令`)
  const minimum = MINIMUM_CLI_VERSIONS[cli]
  if (found.version === null) return failed('configuration', `读不出 ${cli} 的版本`)
  if (!atLeast(found.version, minimum)) {
    return failed('configuration', `${cli} ${found.version} 版本过旧，需要 ${minimum} 或更新`)
  }
  switch (found.signIn) {
    case 'subscription':
      return { state: 'connected', modelCalls: 0, maxOutputTokens: 1 }
    case 'other':
      return failed('authentication', cli === 'claude' ? 'claude 没有用 Claude 订阅登录' : 'codex 没有用 ChatGPT 登录')
    case 'signed-out':
      return failed('authentication', `${cli} 还没有登录`)
    case 'unknown':
      return failed('authentication', `读不出 ${cli} 的登录状态`)
  }
}
