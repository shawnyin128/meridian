import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FetchStatus } from '../../shared/contract.js'
import type { WatchFetcher } from './fetch.js'
import {
  armFetchSchedule, fetchDue, FETCH_EVERY_MS, FIRST_TICK_MS, RETRY_AFTER_MS, TICK_MS,
} from './schedule.js'

describe('fetchDue', () => {
  it('从没抓完过、这次会话也没试过时该抓', () => {
    expect(fetchDue(0, null, null)).toBe(true)
  })

  it('上次抓完不到六小时不抓,满六小时抓', () => {
    expect(fetchDue(FETCH_EVERY_MS - 1, 0, null)).toBe(false)
    expect(fetchDue(FETCH_EVERY_MS, 0, null)).toBe(true)
  })

  it('这次会话试过、未满三十分钟不抓,满了再抓', () => {
    expect(fetchDue(RETRY_AFTER_MS - 1, null, 0)).toBe(false)
    expect(fetchDue(RETRY_AFTER_MS, null, 0)).toBe(true)
  })
})

describe('armFetchSchedule', () => {
  afterEach(() => { vi.useRealTimers() })

  function fakeFetcher(initial: FetchStatus) {
    const runs: number[] = []
    const held = { status: initial }
    const fetcher: WatchFetcher = {
      run: async () => { runs.push(Date.now()) },
      status: () => held.status,
    }
    return { runs, held, fetcher }
  }

  it('开库十五秒后抓;失败半小时后重试;成功六小时后再抓;停下后不再抓', async () => {
    vi.useFakeTimers({ now: 0 })
    const { runs, held, fetcher } = fakeFetcher({ state: 'idle', checkedAt: null, error: null })
    const stop = armFetchSchedule(fetcher, () => Date.now())

    await vi.advanceTimersByTimeAsync(FIRST_TICK_MS)
    expect(runs).toEqual([FIRST_TICK_MS])

    held.status = { state: 'failed', checkedAt: null, error: '网络不可用' }
    await vi.advanceTimersByTimeAsync(3 * TICK_MS - FIRST_TICK_MS)
    expect(runs).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(TICK_MS)
    expect(runs).toEqual([FIRST_TICK_MS, 4 * TICK_MS])

    held.status = { state: 'idle', checkedAt: 4 * TICK_MS, error: null }
    await vi.advanceTimersByTimeAsync(FETCH_EVERY_MS - TICK_MS)
    expect(runs).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(TICK_MS)
    expect(runs).toHaveLength(3)

    stop()
    await vi.advanceTimersByTimeAsync(2 * FETCH_EVERY_MS)
    expect(runs).toHaveLength(3)
  })

  it('正在抓时到了点也不另起一轮', async () => {
    vi.useFakeTimers({ now: 0 })
    const { runs, fetcher } = fakeFetcher({ state: 'checking', checkedAt: null, error: null })
    const stop = armFetchSchedule(fetcher, () => Date.now())
    await vi.advanceTimersByTimeAsync(FIRST_TICK_MS + TICK_MS)
    expect(runs).toEqual([])
    stop()
  })
})
