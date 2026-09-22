import { describe, expect, it } from 'vitest'
import type { FeedEntry } from '../shared/contract.js'
import { feedNewestFirst, localDayOf } from './dates.js'

const entry = (id: string, createdAt: string | undefined, day = '今天'): FeedEntry => ({
  id, source: 'steward', day, time: '刚刚',
  ...(createdAt === undefined ? {} : { createdAt }),
  body: { kind: 'runs', runs: [{ kind: 'text', text: id }] },
})

describe('feedNewestFirst', () => {
  it('最新写的排最前', () => {
    const rows = [entry('a', '2026-09-20T10:00:00.000Z'), entry('b', '2026-09-21T10:00:00.000Z')]
    expect(feedNewestFirst(rows, localDayOf('2026-09-21T10:00:00.000Z')).map((row) => row.id)).toEqual(['b', 'a'])
  })

  it('日期分段按条目发生的那天现算，不用写入时存下的「今天」', () => {
    const written = '2026-09-20T10:00:00.000Z'
    const today = localDayOf('2026-09-21T10:00:00.000Z')
    expect(feedNewestFirst([entry('a', written, '今天')], today)[0]!.day).toBe('昨天')
  })

  it('没有时刻的旧条目保留它写入时的分段', () => {
    expect(feedNewestFirst([entry('a', undefined, '本周')], '2026-09-21')[0]!.day).toBe('本周')
  })

  it('返回副本，改它不影响传入的条目', () => {
    const rows = [entry('a', '2026-09-21T10:00:00.000Z')]
    feedNewestFirst(rows, '2026-09-21')[0]!.time = '改过'
    expect(rows[0]!.time).toBe('刚刚')
  })
})
