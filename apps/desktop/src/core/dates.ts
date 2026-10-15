import type { FeedEntry } from '../shared/contract.js'
import { localDayOf } from '../shared/dates.js'
import { DAY_SECTIONS } from '../shared/vocabulary.js'
/** Current system date in ISO format. This is the product clock when `vault.today` supplies no override. */
export function systemToday(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Demo bucket that classifies a date relative to the vault's current day. */
export function dayOf(date: string, today: string): string {
  const days = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000,
  )
  return days <= 0 ? DAY_SECTIONS.today
    : days === 1 ? DAY_SECTIONS.yesterday
      : days < 7 ? DAY_SECTIONS.week
        : DAY_SECTIONS.earlier
}

/**
 * Feed entries newest first, copied. An entry with `createdAt` is bucketed by the day it happened
 * relative to `today`; an older entry without one keeps the bucket it was written with.
 */
export function feedNewestFirst(entries: readonly FeedEntry[], today: string): FeedEntry[] {
  return entries.map((entry) => {
    const copy = structuredClone(entry)
    return entry.createdAt === undefined ? copy : { ...copy, day: dayOf(localDayOf(entry.createdAt), today) }
  }).reverse()
}
