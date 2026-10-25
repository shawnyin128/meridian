import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'

/** Variables that make a CLI bill an API account instead of the user's subscription. */
const API_KEY_VARIABLES = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY'] as const

const KILL_GRACE_MS = 2_000

export type CliFailureKind = 'unavailable' | 'failed' | 'timeout' | 'cancelled'

/** A CLI call that did not complete, `kind` saying why and the message saying it in plain words. */
export class CliRunError extends Error {
  readonly kind: CliFailureKind

  constructor(kind: CliFailureKind, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CliRunError'
    this.kind = kind
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

/**
 * The environment a CLI at `binary` runs in: `environment` without the API-key variables, and with
 * the binary's folder first on PATH.
 */
export function cliEnvironment(environment: NodeJS.ProcessEnv, binary: string): NodeJS.ProcessEnv {
  const env = { ...environment }
  for (const name of API_KEY_VARIABLES) delete env[name]
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'
  // An npm-installed CLI is a `#!/usr/bin/env node` script; its node sits in the same folder.
  env[pathKey] = [dirname(binary), env[pathKey]].filter((part) => part !== undefined && part !== '')
    .join(delimiter)
  return env
}

/**
 * Run `command` with `args` without a shell, give it `input` on stdin and collect its output.
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
}): Promise<ChildOutcome> {
  const name = command.split(/[\\/]/).pop() ?? command
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted === true) {
      reject(new CliRunError('cancelled', `已停止 ${name}`))
      return
    }
    const posix = process.platform !== 'win32'
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      // Its own process group, so ending the child also ends anything it started.
      detached: posix,
    })
    let stdout = ''
    let stderr = ''
    let stopped: CliRunError | null = null
    let settled = false
    let killTimer: NodeJS.Timeout | undefined
    const signalChild = (signal: NodeJS.Signals) => {
      if (!posix || child.pid === undefined) {
        child.kill(signal)
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
      if (stopped !== null) reject(stopped)
      else resolve({ code, stdout, stderr })
    })
    // A child that exits before reading all of its input closes the pipe; its exit reports why.
    child.stdin.on('error', () => {})
    child.stdin.end(options.input ?? '')
  })
}
