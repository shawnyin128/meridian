import { ZodError } from 'zod'
import type { HarnessFailureDetail } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import { hasCjk } from '../core-log.js'
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

/** The parts of `parts` written in English, joined, keys and tokens redacted; `kind` when there are none. */
function englishDetail(kind: string, ...parts: Array<string | undefined>): string {
  const english = parts.filter((part): part is string => part !== undefined && part.trim() !== '' && !hasCjk(part))
  return sanitizeModelConnectionDetail(english.join(': ')) || kind
}

/**
 * Where a failed AI call `error` failed, what kind of failure it was and what it says in English,
 * keys and tokens redacted: the Harness step and error kind of a Harness error, with its English
 * message and the text the Harness sent along; the CLI failure kind of a CLI run, with its exit code
 * and the end of its stderr; the issues of a result that did not validate, by path and code only;
 * and Core's own call failure for anything else. Text in Chinese, which is what the App shows, is
 * left out; a failure with no English detail has its kind as its detail.
 */
export function failureDetail(error: unknown): HarnessFailureDetail {
  const root = rootOf(error)
  if (root instanceof HarnessRpcError) {
    return {
      step: root.step, kind: root.kind,
      detail: englishDetail(root.kind, root.message, typeof root.detail === 'string' ? root.detail : undefined),
    }
  }
  if (root instanceof CliRunError) {
    const exit = root.exitCode === undefined ? undefined : `exit ${String(root.exitCode)}`
    return {
      step: 'cli', kind: root.kind,
      detail: exit === undefined && root.stderr === undefined
        ? englishDetail(root.kind, root.message)
        : englishDetail(root.kind, exit, root.stderr),
    }
  }
  if (root instanceof ZodError) {
    const issues = root.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`).join('; ')
    return { step: 'core', kind: 'invalid', detail: englishDetail('invalid', issues) }
  }
  const kind = error instanceof CallError ? error.reason : 'unknown'
  return { step: 'core', kind, detail: englishDetail(kind, root instanceof Error ? root.message : String(root)) }
}

/** One log line saying that `what` failed, with where, the kind of failure and its detail. */
export function failureLine(what: string, failed: HarnessFailureDetail): string {
  return `${what} failed at ${failed.step} (${failed.kind}): ${failed.detail}`
}
