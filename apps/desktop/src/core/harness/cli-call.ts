import type { HarnessCli } from '../../shared/contract.js'
import { CliRunError } from './cli/child.js'
import type { CliUsage } from './cli/runner.js'
import type { CoreLogLevel } from '../core-log.js'
import { HarnessRpcError } from './rpc.js'

export const CLI_CALL_TIMEOUT_MS = 10 * 60_000
/** A CLI run's request also covers the reads before its model call and the checks after it. */
export const CLI_REQUEST_TIMEOUT_MS = CLI_CALL_TIMEOUT_MS + 2 * 60_000

/** One log line saying how long a model call on `cli` took, in how many turns, and its tokens. */
export function cliUsageLine(cli: HarnessCli, result: { durationMs: number; turns?: number; usage?: CliUsage }): string {
  const parts = [`${(result.durationMs / 1_000).toFixed(1)} s`]
  if (result.turns !== undefined) parts.push(`${result.turns} turns`)
  if (result.usage !== undefined) {
    parts.push(
      `${result.usage.inputTokens} input tokens (${result.usage.cachedInputTokens} cached)`,
      `${result.usage.outputTokens} output tokens`,
    )
  }
  return `${cli}: ${parts.join(', ')}`
}

/**
 * `cause`, why a model call on `cli` failed, as the model error Harness reports in the CLI's words,
 * when it is a CliRunError; its exit code and the end of its stderr go to `onLog`. Any other error is
 * returned as it is.
 */
export function cliCallError(cli: HarnessCli, cause: unknown, onLog?: (level: CoreLogLevel, line: string) => void): unknown {
  if (!(cause instanceof CliRunError)) return cause
  if (cause.exitCode !== undefined || cause.stderr !== undefined) {
    const stderr = cause.stderr === undefined || cause.stderr === '' ? '' : `: ${cause.stderr.replace(/\n/g, ' | ')}`
    onLog?.('error', `${cli} failed, exit ${String(cause.exitCode ?? 'none')}${stderr}`)
  }
  return new HarnessRpcError({ kind: 'model_error', message: cause.message })
}
