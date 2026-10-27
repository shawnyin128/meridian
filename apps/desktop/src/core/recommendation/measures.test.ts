import { afterEach, describe, expect, it, vi } from 'vitest'
import { feedMeasures, logFeedMeasures, logGaps, ndcgAt, rankingGap, spearman } from './measures.js'
import type { CardSignal, RecommendationIntent } from './types.js'

afterEach(() => { vi.restoreAllMocks() })

const direction = (id: string, label: string, core: boolean): RecommendationIntent => ({
  id, label, core, enabled: true, score: 0.5, seeds: [],
})

/** A card of the scope scored on `path`, still in the feed unless `fields` say otherwise. */
const card = (path: string | undefined, fields: Partial<CardSignal> = {}): CardSignal => ({
  paperIds: ['ARXIV:0001'], gone: false, downloaded: false, reasons: [], shown: true, owned: false,
  ...(path === undefined ? {} : { path }), ...fields,
})

describe('the gap between the two paths', () => {
  it('同样的排序:overlap、nDCG、Spearman 都是 1;完全倒过来:Spearman 是 -1', () => {
    const pairs = Array.from({ length: 12 }, (_, at) => ({ paperId: `p${at}`, api: 1 - at / 12, fallback: 0.9 - at / 20 }))
    expect(rankingGap({ scope: 's', pairs })).toEqual({ scope: 's', papers: 12, overlap: 1, ndcg: 1, spearman: 1 })
    const reversed = rankingGap({ scope: 's', pairs: pairs.map((pair, at) => ({ ...pair, fallback: at })) })
    expect(reversed.spearman).toBeCloseTo(-1)
    expect(reversed.overlap).toBeCloseTo(8 / 10)
    expect(reversed.ndcg).toBeLessThan(0.7)
  })

  it('overlap 数 API 前十里有几篇也在回退前十里;nDCG 按 API 的名次给增益,第一名 10、第二名 9,给回退的排序打分', () => {
    // API ranks a > b > c; the fallback swaps the first two.
    const gap = rankingGap({ scope: 's', pairs: [
      { paperId: 'a', api: 0.9, fallback: 0.5 }, { paperId: 'b', api: 0.6, fallback: 0.7 }, { paperId: 'c', api: 0.1, fallback: 0.2 },
    ] })
    const ideal = 10 + 9 / Math.log2(3) + 8 / 2
    expect(gap.ndcg).toBeCloseTo((9 + 10 / Math.log2(3) + 8 / 2) / ideal)
    expect(gap.overlap).toBe(1)
    expect(gap.spearman).toBeCloseTo(0.5)
    expect(ndcgAt(['x'], new Map([['a', 1]]), 1)).toBe(0)
    expect(spearman([1, 1, 1], [1, 2, 3])).toBe(0)
  })

  it('每个范围一条 info 日志,写出论文数和三个量', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    logGaps([
      { scope: 'direction:p:d1', pairs: [{ paperId: 'a', api: 0.9, fallback: 0.8 }, { paperId: 'b', api: 0.2, fallback: 0.1 }] },
      { scope: 'watch:w', pairs: [{ paperId: 'a', api: 0.9, fallback: 0.1 }, { paperId: 'b', api: 0.2, fallback: 0.8 }] },
    ])
    expect(info.mock.calls).toEqual([
      ['[feed] gap direction:p:d1 papers=2 overlap@10=1.000 ndcg@10=1.000 spearman=1.000'],
      [expect.stringMatching(/^\[feed\] gap watch:w papers=2 overlap@10=1\.000 ndcg@10=0\.\d{3} spearman=-1\.000$/)],
    ])
  })
})

describe('live feed measures', () => {
  const core = direction('d-core', 'KV cache', true)
  const other = direction('d-other', 'Speculative decoding', false)
  const named = (label: string) => [{ kind: 'intent', label: `方向「${label}」` }]

  it('按路径分开数:送过的、还在显示的、入库、忽略、已经了解,各方向占显示的份额', () => {
    const cards = [
      card('api', { reasons: named('KV cache') }),
      card('api', { reasons: named('KV cache') }),
      card('api', { reasons: named('Speculative decoding') }),
      card('api', { gone: true, shown: false, left: 'library' }),
      card('api', { gone: true, shown: false, left: 'dismissed' }),
      card('api', { gone: true, shown: false, left: 'folded' }),
      card('fallback', { gone: true, shown: false, left: 'known', feedback: 'known' }),
      card('fallback', { gone: true, shown: false, downloaded: true }),
      card('fallback', { reasons: named('Speculative decoding') }),
      card(undefined),
    ]
    expect(feedMeasures(cards, [core, other])).toEqual([
      { path: 'api', delivered: 6, shown: 3, added: 1, dismissed: 1, known: 0, ownedShown: 0, directions: { 'd-core': 2 / 3, 'd-other': 1 / 3 } },
      { path: 'fallback', delivered: 3, shown: 1, added: 1, dismissed: 0, known: 1, ownedShown: 0, directions: { 'd-other': 1 } },
      { path: 'none', delivered: 1, shown: 1, added: 0, dismissed: 0, known: 0, ownedShown: 0, directions: { 'd-core': 1 } },
    ])
  })

  it('每条路径一条 info 日志写出比率;库里已有的论文还在显示时那条记成 error', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    logFeedMeasures('project:p', [
      card('api', { reasons: named('KV cache') }),
      card('api', { gone: true, shown: false, left: 'library' }),
      card('api', { gone: true, shown: false, left: 'dismissed' }),
      card('api', { gone: true, shown: false, left: 'known' }),
      card('fallback', { owned: true }),
      card('fallback', { owned: true, shown: false, gone: true, left: 'library' }),
    ], [core])
    expect(info.mock.calls).toEqual([[
      '[feed] measures project:p path=api delivered=4 shown=1 added=1 dismissed=1 known=1 owned-shown=0 '
      + 'added-rate=0.250 dismiss-rate=0.250 known-share=0.250 directions=d-core:1.000',
    ]])
    expect(error.mock.calls).toEqual([[
      '[feed] measures project:p path=fallback delivered=2 shown=1 added=1 dismissed=0 known=0 owned-shown=1 '
      + 'added-rate=0.500 dismiss-rate=0.000 known-share=0.000 directions=d-core:1.000',
    ]])
  })

  it('一张卡都没有的范围不记日志', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    logFeedMeasures('watch:w', [], [])
    expect(info).not.toHaveBeenCalled()
  })
})
