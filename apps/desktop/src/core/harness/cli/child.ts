import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { sanitizeModelConnectionDetail } from '../chat.js'

/**
 * What could make a CLI bill another account than the user's own signed-in subscription: API keys
 * and tokens, API endpoints, third-party provider switches and those providers' cloud credentials.
 * Names match without regard to case, as Windows reads them.
 */
const BILLING_VARIABLE_PREFIXES = [
  'ANTHROPIC_', 'OPENAI_', 'CLAUDE_CODE_USE_', 'CLAUDE_CODE_OAUTH_', 'AWS_', 'AZURE_', 'GOOGLE_', 'VERTEX_REGION_',
] as const
const BILLING_VARIABLES: ReadonlySet<string> = new Set([
  'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST', 'CLOUD_ML_REGION', 'GCLOUD_PROJECT', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN',
])

const KILL_GRACE_MS = 2_000
const MAX_STDERR_EXCERPT = 500
const JWT = /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g
const EMAIL = /[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/g
/** Characters cmd.exe gives a meaning unless a caret escapes them. */
const CMD_SPECIAL = /([()\][%!^"`<>&|;, *?])/g
/** The longest command line cmd.exe accepts. */
const CMD_LINE_LIMIT = 8_191

export type CliFailureKind = 'unavailable' | 'failed' | 'timeout' | 'cancelled'

/** A CLI call that did not complete, `kind` saying why and the message saying it in plain words. */
export class CliRunError extends Error {
  readonly kind: CliFailureKind
  /** The CLI's exit code, when it started and exited. */
  readonly exitCode?: number | null
  /** The end of what the CLI wrote to stderr, with credentials and email addresses replaced. */
  readonly stderr?: string

  constructor(
    kind: CliFailureKind,
    message: string,
    options?: ErrorOptions & { exitCode?: number | null; stderr?: string },
  ) {
    super(message, options)
    this.name = 'CliRunError'
    this.kind = kind
    if (options?.exitCode !== undefined) this.exitCode = options.exitCode
    if (options?.stderr !== undefined) this.stderr = options.stderr
  }
}

export type ChildOutcome = { code: number | null; stdout: string; stderr: string }

/** Run `use` in a fresh empty folder under the system's temporary folder, removed once `use` settles. */
export async function inTemporaryFolder<T>(use: (folder: string) => Promise<T>): Promise<T> {
  const folder = mkdtempSync(join(tmpdir(), 'meridian-cli-'))
  try {
    return await use(folder)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

const billsAnotherAccount = (name: string) => {
  const upper = name.toUpperCase()
  return BILLING_VARIABLES.has(upper) || BILLING_VARIABLE_PREFIXES.some((prefix) => upper.startsWith(prefix))
}

/**
 * The environment a CLI at `binary` runs in: `environment` without any variable that could bill
 * another account, and with the binary's folder first on PATH.
 */
export function cliEnvironment(environment: NodeJS.ProcessEnv, binary: string): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(environment).filter(([name]) => !billsAnotherAccount(name)))
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'
  // An npm-installed CLI is a `#!/usr/bin/env node` script; its node sits in the same folder.
  env[pathKey] = [dirname(binary), env[pathKey]].filter((part) => part !== undefined && part !== '')
    .join(delimiter)
  return env
}

/** The end of a CLI's `stderr`, at most 500 characters, with credentials and email addresses replaced. */
export function stderrExcerpt(stderr: string): string {
  const text = stderr.split(/\r?\n/)
    .map((line) => sanitizeModelConnectionDetail(line.replace(JWT, '[redacted]').replace(EMAIL, '[redacted]')))
    .filter((line) => line !== '')
    .join('\n')
  return text.length <= MAX_STDERR_EXCERPT ? text : `…${text.slice(-(MAX_STDERR_EXCERPT - 1))}`
}

const escapeForCmd = (text: string) => text.replace(CMD_SPECIAL, '^$1')

/**
 * `arg` quoted for a Windows program's C runtime, then escaped for cmd.exe twice: once for the /c
 * line and once more for the batch file's `%*`, which cmd.exe parses again.
 */
const shimArgument = (arg: string) =>
  escapeForCmd(escapeForCmd(`"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`))

/**
 * How to start the batch file `command` with `args` through cmd.exe so that its program receives
 * `args` unchanged. Throws a CliRunError when an argument holds a line break or the command line
 * is longer than cmd.exe accepts.
 */
function batchInvocation(command: string, args: readonly string[], env: NodeJS.ProcessEnv, name: string) {
  if (args.some((arg) => /[\r\n]/.test(arg))) {
    throw new CliRunError('unavailable', `${name} 的参数含有换行，cmd.exe 无法传递`)
  }
  const line = [escapeForCmd(command), ...args.map(shimArgument)].join(' ')
  if (line.length + 2 > CMD_LINE_LIMIT) {
    throw new CliRunError('unavailable', `${name} 的命令行超出 cmd.exe 的长度上限`)
  }
  const comspec = Object.entries(env).find(([key]) => key.toUpperCase() === 'COMSPEC')?.[1]
  return { file: comspec ?? 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`] }
}

/**
 * Run `command` with `args` without a shell, give it `input` on stdin and collect its output; a
 * Windows batch file, such as an npm shim, runs through cmd.exe with every argument quoted.
 * Resolves with its exit code and output once it has exited. Rejects with a CliRunError:
 * `unavailable` when it cannot start, `timeout` after `timeoutMs`, `cancelled` when `signal` aborts.
 * In the last two cases it ends the child and everything the child started before it rejects.
 */
export function runChild(command: string, args: readonly string[], options: {
  cwd: string
  env: NodeJS.ProcessEnv
  input?: string
  timeoutMs: number
  signal?: AbortSignal
  platform?: NodeJS.Platform
}): Promise<ChildOutcome> {
  const name = command.split(/[\\/]/).pop() ?? command
  const windows = (options.platform ?? process.platform) === 'win32'
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted === true) {
      reject(new CliRunError('cancelled', `已停止 ${name}`))
      return
    }
    let invocation = { file: command, args: [...args] }
    const throughCmd = windows && /\.(cmd|bat)$/i.test(command)
    if (throughCmd) {
      try {
        invocation = batchInvocation(command, args, options.env, name)
      } catch (cause) {
        reject(cause)
        return
      }
    }
    const child = spawn(invocation.file, invocation.args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      windowsVerbatimArguments: throughCmd,
      // Its own process group, so ending the child also ends anything it started.
      detached: !windows,
    })
    let stdout = ''
    let stderr = ''
    let stopped: CliRunError | null = null
    let settled = false
    let killTimer: NodeJS.Timeout | undefined
    const signalChild = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return
      if (windows) {
        // Ending cmd.exe or a launcher alone would leave the program it started running.
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
          .on('error', () => child.kill(signal))
        return
      }
      try {
        process.kill(-child.pid, signal)
      } catch {
        // The whole group has already exited.
      }
    }
    const stop = (failure: CliRunError) => {
      if (stopped !== null || settled) return
      stopped = failure
      signalChild('SIGTERM')
      killTimer = setTimeout(() => signalChild('SIGKILL'), KILL_GRACE_MS)
    }
    const timer = setTimeout(() => stop(new CliRunError('timeout', `${name} 运行超时，已停止`)), options.timeoutMs)
    const onAbort = () => stop(new CliRunError('cancelled', `已停止 ${name}`))
    options.signal?.addEventListener('abort', onAbort, { once: true })
    const settle = () => {
      settled = true
      clearTimeout(timer)
      clearTimeout(killTimer)
      options.signal?.removeEventListener('abort', onAbort)
    }
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.on('error', (cause) => {
      if (settled) return
      settle()
      reject(new CliRunError('unavailable', `无法启动 ${name}`, { cause }))
    })
    child.on('close', (code) => {
      if (settled) return
      settle()
      if (stopped === null) resolve({ code, stdout, stderr })
      else reject(new CliRunError(stopped.kind, stopped.message, { exitCode: code, stderr: stderrExcerpt(stderr) }))
    })
    // A child that exits before reading all of its input closes the pipe; its exit reports why.
    child.stdin.on('error', () => {})
    child.stdin.end(options.input ?? '')
  })
}
