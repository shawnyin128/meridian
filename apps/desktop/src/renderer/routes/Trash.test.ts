import { describe, expect, it } from 'vitest'
import { TRASH_RETENTION_DAYS } from '../../shared/vocabulary.js'
import { daysLeft } from './Trash.js'

/** This set of use cases uses this day as today in the library, and the following deletion times are counted according to it. */
const TODAY = '2026-08-25'

/** Curry's days forward are the epoch milliseconds of that day, that is, the deletion time recorded when deleting that day. */
const deletedDaysAgo = (days: number) =>
  Date.parse(`${TODAY}T00:00:00Z`) - days * 86_400_000

describe('daysLeft', () => {
  it('今天删的还剩整个保留期', () => {
    expect(daysLeft(deletedDaysAgo(0), TODAY)).toBe(TRASH_RETENTION_DAYS)
  })

  it('每过一天少一天', () => {
    expect(daysLeft(deletedDaysAgo(1), TODAY)).toBe(6)
    expect(daysLeft(deletedDaysAgo(3), TODAY)).toBe(4)
    expect(daysLeft(deletedDaysAgo(6), TODAY)).toBe(1)
  })

  // The library discards entries whose retention period has expired along with their contents (see fixture-store's "Items deleted for 8 days will no longer be listed"),
  // So the entry that counts as 0 will never make it to this screen.
  it('删满保留期的算 0,那样的条目已经不在垃圾桶里了', () => {
    expect(daysLeft(deletedDaysAgo(TRASH_RETENTION_DAYS), TODAY)).toBe(0)
  })
})
