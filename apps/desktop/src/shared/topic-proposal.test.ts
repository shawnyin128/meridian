import { describe, expect, it } from 'vitest'
import type { WikiAggregationCard, WikiHome } from './contract.js'
import { topicDir, topicProposal, topicTitleKey } from './topic-proposal.js'

const card = (id: string, title: string, kind = 'topic'): WikiAggregationCard => ({
  id, kind, kindLabel: kind === 'topic' ? '主题' : '方法', title, summary: '',
  updated: '2026-09-15', childCount: 0, memberCount: 0, parentCount: 0,
})

describe('topicProposal', () => {
  it('主题身份忽略大小写与空白,沿用已有页及它的显示名', () => {
    const cards = [card('topics/speculative-decoding', 'Speculative  Decoding')]
    expect(topicTitleKey(' speculative\nDECODING ')).toBe('speculativedecoding')
    expect(topicProposal('p1', 'Paper', [], [' speculative\nDECODING '], cards, 'topics'))
      .toEqual({
        source: 'user', title: '把 Paper 加进 speculative\nDECODING',
        ops: [{ op: 'setMembership', paper: 'papers/p1', in: 'topics/speculative-decoding', cells: {} }],
      })
    expect(topicProposal('p1', 'Paper', ['Speculative Decoding'], [' speculative decoding '], cards, 'topics'))
      .toBeNull()
  })

  it('没有同名主题时创建,并避开其他种类已经占用的 id', () => {
    expect(topicProposal(
      'p1', 'Paper', [], ['Rotation'], [card('topics/rotation', 'Rotation method', 'method')], 'topics',
    )?.ops).toEqual([
      {
        op: 'createAggregation', kind: 'topic', id: 'topics/rotation-2', title: 'Rotation',
        parents: [], columns: [], describe: '',
      },
      { op: 'setMembership', paper: 'papers/p1', in: 'topics/rotation-2', cells: {} },
    ])
  })

  it('主题目录来自库的 schema,缺少主题种类时明确拒绝', () => {
    const home: WikiHome = {
      aggregationCount: 0,
      kinds: [{ key: 'topic', label: '主题', dir: 'questions', count: 0 }],
      roots: [],
    }
    expect(topicDir(home)).toBe('questions')
    expect(() => topicDir({ ...home, kinds: [] })).toThrow('这个库的 Wiki 没有主题这一种')
  })
})
