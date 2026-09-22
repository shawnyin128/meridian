import { describe, expect, it } from 'vitest'
import type { InboxEntry } from '../../shared/contract.js'
import type { RemotePaper } from '../net/arxiv.js'
import { orderInbox, rankedPaper, recommendationScore, relevanceOf } from './scoring.js'

const paper: RemotePaper = {
  id: '2609.00001', title: 'Tree Width for Speculative Decoding', authors: ['Mei Lin'],
  abstract: 'Verification is shared across a batch.', submitted: '2026-09-01',
  journalRef: null, pdf: 'https://arxiv.org/pdf/2609.00001',
}

const item = (
  id: string, watch: string, ranking?: InboxEntry['ranking'],
): InboxEntry => ({
  id, kind: 'watch', watch, project: '', source: watch, title: id, authors: '', venue: '',
  abstract: '', rec: '', reasons: [], downloaded: false, paper: '', pdf: '',
  ...(ranking === undefined ? {} : { ranking }),
})

const rank = (
  relevance: number, published: boolean, citationCount: number, submitted: string,
): NonNullable<InboxEntry['ranking']> => ({
  relevance, published, citationCount,
  influentialCitationCount: Math.floor(citationCount / 10), submitted,
})

describe('recommendation scoring', () => {
  it('主题整句出现在标题时满相关,只覆盖部分词时降权', () => {
    expect(relevanceOf({ type: 'topic', name: 'speculative decoding' }, paper)).toBe(1)
    expect(relevanceOf({ type: 'topic', name: 'batched verification' }, paper)).toBeLessThan(1)
  })

  it('作者关注按规范化后的完整名字匹配', () => {
    expect(relevanceOf({ type: 'author', name: 'Mei Lin' }, paper)).toBe(1)
    expect(relevanceOf({ type: 'author', name: 'M. Lin' }, paper)).toBe(0.85)
  })

  it('影响力与已发表状态只进排名元数据,已确认的 venue 可补给卡片', () => {
    expect(rankedPaper({ type: 'topic', name: 'speculative decoding' }, paper, {
      citationCount: 40, influentialCitationCount: 4, venue: 'NeurIPS', published: true,
    })).toMatchObject({
      journalRef: 'NeurIPS',
      ranking: {
        relevance: 1, published: true, citationCount: 40, influentialCitationCount: 4,
        submitted: '2026-09-01',
      },
    })
  })

  it('keeps relevance dominant and does not flatten source groups', () => {
    const now = Date.parse('2026-09-15T00:00:00Z')
    const rows = [
      item('weak-famous', 'a', rank(0.1, true, 10_000, '2025-09-15')),
      item('strong-new', 'a', rank(1, false, 0, '2026-09-14')),
      item('published', 'a', rank(0.8, true, 20, '2026-08-15')),
      item('other-watch', 'b', rank(1, true, 999, '2026-09-15')),
    ]
    expect(recommendationScore(rows[1]!, now)).toBeGreaterThan(recommendationScore(rows[0]!, now))
    expect(orderInbox(rows, 'recommended', now).map((row) => row.id))
      .toEqual(['published', 'strong-new', 'weak-famous', 'other-watch'])
    expect(orderInbox(rows, 'latest', now).map((row) => row.id))
      .toEqual(['strong-new', 'published', 'weak-famous', 'other-watch'])
    expect(orderInbox(rows, 'published', now).map((row) => row.id).slice(0, 3))
      .toEqual(['published', 'weak-famous', 'strong-new'])
    expect(orderInbox(rows, 'impact', now).map((row) => row.id).slice(0, 3))
      .toEqual(['weak-famous', 'published', 'strong-new'])
  })
})
