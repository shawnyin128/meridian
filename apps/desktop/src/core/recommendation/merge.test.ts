import { describe, expect, it } from 'vitest'
import type { DiscoveryPaper, RecommendationIntent } from './types.js'
import { discoveryReasons, mergeIntentResults } from './merge.js'

const intent = (id: string, label: string, paperId: string): RecommendationIntent => ({
  id, label, seeds: [{ paperId, title: label, abstract: '', source: 'project' }],
  score: 1, core: id === 'intent-1', enabled: true,
})
const paper = (semanticId: string, id: string): DiscoveryPaper => ({
  semanticId, id, title: id, authors: [], abstract: '', submitted: '2026-09-17',
  journalRef: null, pdf: `https://arxiv.org/pdf/${id}`,
  ranking: {
    relevance: 1, published: false, citationCount: 0, influentialCitationCount: 0,
    submitted: '2026-09-17',
  },
})

describe('diversity-aware recommendation merge', () => {
  it('轮转保留每个方向并合并跨方向重复结果', () => {
    const first = intent('intent-1', 'on-policy · distillation', 'ARXIV:1')
    const second = intent('intent-2', 'knowledge · distillation', 'ARXIV:2')
    const merged = mergeIntentResults([
      { intent: first, papers: [paper('shared', '3'), paper('only-a', '4')] },
      { intent: second, papers: [paper('only-b', '5'), paper('shared', '3')] },
    ])
    expect(merged.map((item) => item.semanticId)).toEqual(['shared', 'only-b', 'only-a'])
    expect(merged[0]?.matches?.map((match) => match.intentId)).toEqual(['intent-1', 'intent-2'])
  })

  it('合并时留下候选的来源和命中的 Wiki 词', () => {
    const found = {
      ...paper('graph', '6'),
      origins: [{ source: 'citation' as const, seedPaperIds: ['ARXIV:1'] }],
      wikiTerms: ['speculative decoding'],
    }
    const [merged] = mergeIntentResults([{ intent: intent('intent-1', 'draft model', 'ARXIV:1'), papers: [found] }])
    expect(merged).toMatchObject({ origins: found.origins, wikiTerms: ['speculative decoding'] })
  })
})

describe('discovery reasons', () => {
  it('最多三条,由强到弱:方向、最近的正例、论文里真有的 Wiki 词', () => {
    expect(discoveryReasons({
      direction: 'Draft-OPD', near: { paperId: 'ARXIV:2605.29343', title: 'Draft-OPD' }, wikiTerm: 'speculative decoding',
    })).toEqual([
      { kind: 'intent', label: '方向「Draft-OPD」' },
      { kind: 'seed', label: '接近《Draft-OPD》', paperId: 'ARXIV:2605.29343' },
      { kind: 'wiki', label: 'Wiki「speculative decoding」' },
    ])
    expect(discoveryReasons({ direction: 'KV', near: undefined, wikiTerm: undefined }))
      .toEqual([{ kind: 'intent', label: '方向「KV」' }])
  })

  it('最近的正例是从推送里拿走的论文时,说明用户怎么处理过它', () => {
    const near = (taken: 'library' | 'later' | 'rated') => discoveryReasons({ direction: 'KV', near: { paperId: 's2', title: 'KIVI', taken } })[1]
    expect([near('library'), near('later'), near('rated')]).toEqual([
      { kind: 'feedback', label: '接近你入库的《KIVI》', paperId: 's2' },
      { kind: 'feedback', label: '接近你稍后阅读的《KIVI》', paperId: 's2' },
      { kind: 'feedback', label: '接近你评 5 星的《KIVI》', paperId: 's2' },
    ])
  })

  it('很长的标题截短,理由仍能存下', () => {
    const [, near] = discoveryReasons({ direction: 'KV', near: { paperId: 'p', title: 'x'.repeat(900) } })
    expect(near!.label.length).toBeLessThanOrEqual(500)
  })
})
