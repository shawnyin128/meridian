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
    expect(discoveryReasons('项目', 9, merged[0]!)).toEqual([
      { kind: 'project', label: '来自项目「项目」' },
      { kind: 'intent', label: '匹配核心方向「on-policy · distillation」' },
      { kind: 'intent', label: '匹配轮换方向「knowledge · distillation」' },
      { kind: 'seed', label: '基于 2 篇相关论文' },
    ])
  })

  it('把候选来源与真正命中的 Wiki 词作为结构化解释保存', () => {
    const found = {
      ...paper('graph', '6'),
      origins: [{ source: 'citation' as const, seedPaperIds: ['ARXIV:1'] }],
      wikiTerms: ['speculative decoding'],
    }
    const merged = mergeIntentResults([{ intent: intent('intent-1', 'draft model', 'ARXIV:1'), papers: [found] }])
    expect(discoveryReasons('项目', 1, merged[0]!)).toEqual([
      { kind: 'project', label: '来自项目「项目」' },
      { kind: 'intent', label: '匹配核心方向「draft model」' },
      { kind: 'source', label: '由后续引用召回' },
      { kind: 'wiki', label: '匹配 Wiki 主题/方法「speculative decoding」' },
      { kind: 'seed', label: '基于 1 篇相关论文' },
    ])
  })
})
