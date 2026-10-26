import { ZodError } from 'zod'
import type { HarnessFailureDetail } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import { sanitizeModelConnectionDetail } from './chat.js'
import { CliRunError } from './cli/child.js'
import { HarnessRpcError } from './rpc.js'

/** The error `error` was made from: the end of its chain of causes through Core's own wrappers. */
function rootOf(error: unknown): unknown {
  let root = error
  while (root instanceof Error && !(root instanceof HarnessRpcError || root instanceof CliRunError || root instanceof ZodError)
    && root.cause !== undefined) root = root.cause
  return root
}

/**
 * Where a failed AI call `error` failed, what kind of failure it was and what it says, keys and
 * tokens redacted: the Harness step and error kind of a Harness error, with the text the Harness
 * sent along; the CLI failure kind of a CLI run, with its exit code; the issues of a result that did
 * not validate, by path and code only; and Core's own call failure for anything else.
 */
export function failureDetail(error: unknown): HarnessFailureDetail {
  const root = rootOf(error)
  if (root instanceof HarnessRpcError) {
    const sent = typeof root.detail === 'string' && root.detail.trim() !== '' ? ` (${root.detail.trim()})` : ''
    return { step: root.step, kind: root.kind, detail: sanitizeModelConnectionDetail(`${root.message}${sent}`) }
  }
  if (root instanceof CliRunError) {
    const exit = root.exitCode === undefined ? '' : ` (exit ${String(root.exitCode)})`
    return { step: 'cli', kind: root.kind, detail: sanitizeModelConnectionDetail(`${root.message}${exit}`) }
  }
  if (root instanceof ZodError) {
    const issues = root.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`).join('; ')
    return { step: 'core', kind: 'invalid', detail: sanitizeModelConnectionDetail(issues) }
  }
  const kind = error instanceof CallError ? error.reason : 'unknown'
  const text = root instanceof Error ? root.message : String(root)
  return { step: 'core', kind, detail: sanitizeModelConnectionDetail(text) || kind }
}

/** One log line saying that `what` failed, with where, the kind of failure and its detail. */
export function failureLine(what: string, failed: HarnessFailureDetail): string {
  return `${what} failed at ${failed.step} (${failed.kind}): ${failed.detail}`
}
