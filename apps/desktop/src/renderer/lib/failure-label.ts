import type { InboxDownloadFailure } from '../../shared/contract.js'
import type { Catalog } from '../messages/catalog.js'

/** Labels a failed network call: `what` failed, followed by the reason unless the reason is unknown. */
export function failureLabel(m: Catalog, what: string, reason: InboxDownloadFailure): string {
  return reason === 'unknown' ? what : m.common.failure.label(what, m.common.failure.reasons[reason])
}
