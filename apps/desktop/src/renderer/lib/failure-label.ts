import type { AuthorSearchFailure, CallFailure, InboxDownloadFailure } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import type { Catalog } from '../messages/catalog.js'

/** Why a caught error failed: its rejected call's reason, or `unknown`, logged, for any other error. */
export function failureOf(error: unknown): CallFailure {
  if (error instanceof CallError) return error.reason
  console.error(`[renderer] ${error instanceof Error ? error.message : String(error)}`)
  return 'unknown'
}

/** Labels a failed call: `what` failed, followed by the reason unless the reason is unknown. */
export function failureLabel(
  m: Catalog, what: string, reason: CallFailure | InboxDownloadFailure | AuthorSearchFailure,
): string {
  return reason === 'unknown' ? what : m.common.failure.label(what, m.common.failure.reasons[reason])
}

/** Labels a caught error by its reason alone, or with the generic label when the reason is unknown. */
export function errorLabel(m: Catalog, error: unknown): string {
  const reason = failureOf(error)
  return reason === 'unknown' ? m.common.failure.unknown : m.common.failure.reasons[reason]
}
