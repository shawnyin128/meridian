import { describe, expect, it } from 'vitest'
import { poolFirst, shareCap, type SharedScope } from './pool.js'

/** A scope over `candidates` whose feed delivers every candidate not in `seen`, logging what it was offered. */
const scope = (
  candidates: string[], favouredAt: number | null = null, seen: string[] = [],
): SharedScope<string> & { offered: string[][] } => {
  const offered: string[][] = []
  return {
    favouredAt,
    offered,
    candidates: async () => [...candidates],
    deliver: (batch) => {
      offered.push(batch)
      return batch.filter((candidate) => !seen.includes(candidate)).length
    },
  }
}

describe('shareCap', () => {
  it('把上限平分给各个范围,不按列表顺序让前面的范围用光', async () => {
    const scopes = [scope(['a1', 'a2', 'a3', 'a4']), scope(['b1', 'b2', 'b3']), scope(['c1', 'c2'])]
    const shares = await shareCap(scopes, 6)
    expect(shares).toEqual([
      { delivered: 2, rest: ['a3', 'a4'], favoured: false },
      { delivered: 2, rest: ['b3'], favoured: false },
      { delivered: 2, rest: [], favoured: false },
    ])
  })

  it('除不尽的那几篇先给最久没多分到过的范围,从没多分到过的排最前,多分到的记下', async () => {
    const scopes = [scope(['a1', 'a2', 'a3'], 300), scope(['b1', 'b2', 'b3'], 100), scope(['c1', 'c2', 'c3'], null)]
    const shares = await shareCap(scopes, 5)
    expect(shares.map(({ delivered, favoured }) => [delivered, favoured])).toEqual([[1, false], [2, true], [2, true]])
    expect(scopes[0]!.offered).toEqual([['a1']])
  })

  it('一个范围候选不够或被判作已送过,它剩下的份额下一轮分给还有候选的范围', async () => {
    const scopes = [scope(['a1'], null), scope(['b1', 'b2', 'b3'], null, ['b1']), scope(['c1', 'c2', 'c3', 'c4'], null)]
    const shares = await shareCap(scopes, 6)
    expect(shares).toEqual([
      { delivered: 1, rest: [], favoured: false },
      { delivered: 2, rest: [], favoured: false },
      { delivered: 3, rest: ['c4'], favoured: true },
    ])
    expect(scopes[1]!.offered.flat()).toEqual(['b1', 'b2', 'b3'])
  })

  it('上限比范围少时轮不到的范围一篇也不推,候选原样留下', async () => {
    const late = scope(['b1', 'b2'], 200)
    const shares = await shareCap([scope(['a1', 'a2'], 100), late], 1)
    expect(shares).toEqual([
      { delivered: 1, rest: ['a2'], favoured: true }, { delivered: 0, rest: ['b1', 'b2'], favoured: false },
    ])
    expect(late.offered).toEqual([])
  })
})

describe('poolFirst', () => {
  it('候选池里的排在这一轮新抓的前面,同一篇只留候选池里那一份', () => {
    const pooled = [{ id: '2609.00001', from: 'pool' }, { id: '2609.00002', from: 'pool' }]
    const fresh = [{ id: '2609.00003', from: 'fresh' }, { id: '2609.00001', from: 'fresh' }]
    expect(poolFirst(pooled, fresh)).toEqual([
      { id: '2609.00001', from: 'pool' }, { id: '2609.00002', from: 'pool' }, { id: '2609.00003', from: 'fresh' },
    ])
  })
})
