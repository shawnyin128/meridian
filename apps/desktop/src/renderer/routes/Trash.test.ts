import { describe, expect, it } from 'vitest'
import { TRASH_RETENTION_DAYS } from '../../shared/vocabulary.js'
import { daysLeft } from './Trash.js'

/** The vault's today in these tests; the deletion times below count from it. */
const TODAY = '2026-08-25'

/** Epoch milliseconds of the day `days` days before the vault's today: the deletion time recorded that day. */
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

  // The vault drops an entry past its retention period together with its content (see the
  // fixture-store test on an entry deleted 8 days ago), so an entry counting 0 never reaches this screen.
  it('删满保留期的算 0,那样的条目已经不在垃圾桶里了', () => {
    expect(daysLeft(deletedDaysAgo(TRASH_RETENTION_DAYS), TODAY)).toBe(0)
  })
})
