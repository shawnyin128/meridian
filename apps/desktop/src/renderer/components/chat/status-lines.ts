import { catalogFor, type Catalog } from '../../messages/catalog.js'

type Status = Catalog['chat']['status']
type Reasons = Status['reasons']

/** The Chinese words a chat's status lines are stored in, whatever the App's language. */
const STORED = catalogFor('zh').chat.status

/** The stored line a failed turn starts with, before its reason. */
const FAILED = STORED.failed('')

/** Each fixed reason as stored, and its key. */
const FIXED = new Map(Object.entries(STORED.reasons).flatMap(([key, text]) => (
  typeof text === 'string' ? [[text, key as keyof Reasons] as const] : []
)))

/** The reasons stored with an HTTP status in them: each key, and its stored text before and after the status. */
const WITH_STATUS = (['authRefused', 'httpStatus'] as const).map((key) => {
  const [before, after] = STORED.reasons[key]('\u0000').split('\u0000') as [string, string]
  return { key, before, after }
})

/** What stored reason `reason` says in `status`'s language: `reason` itself when no App ever wrote it. */
function reasonIn(status: Status, reason: string): string {
  const key = FIXED.get(reason)
  if (key !== undefined) return status.reasons[key] as string
  for (const { key: withStatus, before, after } of WITH_STATUS) {
    const code = reason.startsWith(before) && reason.endsWith(after) ? reason.slice(before.length, reason.length - after.length) : ''
    if (/^\d+$/.test(code)) return status.reasons[withStatus](code)
  }
  return reason
}

/** The reason of the failed turn whose status line is stored as `text`, in `m`'s language; null for any other line. */
export function failedReason(text: string, m: Catalog): string | null {
  return text.startsWith(FAILED) ? reasonIn(m.chat.status, text.slice(FAILED.length)) : null
}

/**
 * What the status line stored as `text` says in `m`'s language. A line an App wrote reads in that
 * language; a failed turn whose reason no App wrote keeps the reason as stored; any other text is
 * returned as stored.
 */
export function statusLine(text: string, m: Catalog): string {
  const status = m.chat.status
  if (text === STORED.setUpModel) return status.setUpModel
  if (!text.startsWith(FAILED)) return text
  return status.failed(reasonIn(status, text.slice(FAILED.length)))
}
