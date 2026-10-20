import { ZodError } from 'zod'
import type { CallFailure } from '../shared/contract.js'
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
