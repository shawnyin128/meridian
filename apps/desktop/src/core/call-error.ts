import { ZodError } from 'zod'
import type { CallFailure, CallRejection } from '../shared/contract.js'
import { HttpStatusError, netFailure } from './net/http.js'
import { isWriteFailure } from './vault/writer.js'

/** An error that fails a contract call for `reason`. Its message is Core's own text, for the log only. */
export class CallError extends Error {
  constructor(readonly reason: CallFailure, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CallError'
  }
}

/**
 * Why a contract call that threw `error` failed: the reason a CallError carries, `invalid` for a
 * failed schema parse, `write` for the file system refusing a write, the network reason of an HTTP
 * status, and `unknown` for anything else.
 */
export function callFailure(error: unknown): CallFailure {
  if (error instanceof CallError) return error.reason
  if (error instanceof ZodError) return 'invalid'
  if (isWriteFailure(error)) return 'write'
  if (error instanceof HttpStatusError) return netFailure(error)
  return 'unknown'
}

/**
 * Answers call `id` of `method` on `port` once `outcome` settles: with its data, or with the
 * CallRejection of the error it threw. The error's own text goes to the log only.
 */
export function answerCall(
  port: { postMessage(message: unknown): void }, id: number, method: string, outcome: Promise<unknown>,
): Promise<void> {
  return outcome.then(
    (data) => { port.postMessage({ id, ok: true, data }) },
    (error: unknown) => {
      console.error(`[core] ${method} 失败：${error instanceof Error ? error.message : String(error)}`)
      const rejection: CallRejection = { reason: callFailure(error) }
      port.postMessage({ id, ok: false, error: rejection })
    },
  )
}
