import { describe, expect, it } from 'vitest'
import type { WikiData } from './model.js'
import { wikiAggregation, wikiCards, wikiHome, wikiPaper, wikiSearchIndex } from './model.js'

/** Two aggregation kinds, one internal node with a leaf, and three papers cover every view rule. */
const DATA: WikiData = {
  requireQuote: true,
  kinds: {
    topic: { dir: 'topics', label: '问题', describe: { section: '问题', hint: '' } },
    method: {
      dir: 'methods', label: '方法', describe: { section: '机制', hint: '' },
      derived_columns: [{ key: 'used_for', label: '用于', from_kind: 'topic' }],
    },
  },
  sections: [{ key: 'conclusions', label: '结论' }, { key: 'open', label: '未解决' }],
  pages: {
    'papers/a': {
      kind: 'paper',
      fm: {
        title: 'A: first', short: 'A', authors: ['Ann'], year: 2024, venue: 'X 2024',
        pdf: 'sources/a.pdf', updated: '2026-09-05',
        memberships: [
          { in: 'topics/leaf', cells: { bits: { value: 'W4', at: { page: 1, quote: '4-bit' } } } },
          { in: 'methods/m', cells: { how: { value: 'rotate', at: { page: 2, quote: 'we rotate' } } } },
        ],
      },
      body: '## 这篇说了什么\n第一段。(p.1)\n\n## 机制\n见 [[papers/b]]。',
    },
    'papers/b': {
      kind: 'paper',
      fm: { title: 'B: second', authors: [], updated: '2026-09-01', memberships: [{ in: 'topics/leaf' }] },
      body: '',
    },
    'papers/c': {
      kind: 'paper',
      fm: { title: 'C', updated: '2026-09-01', memberships: [{ in: 'methods/m' }] },
      body: '',
    },
    'topics/root': {
      kind: 'topic',
      fm: { title: 'Root', parents: [], columns: [], split_on: '按什么拆', updated: '2026-09-09' },
      body: '## 问题\n第一段。\n\n第二段。\n\n## 结论\n\n## 未解决',
    },
    'topics/leaf': {
      kind: 'topic',
      fm: {
        title: 'Leaf', parents: ['topics/root'],
        columns: [{ key: 'bits', label: '位宽' }, { key: 'calib', label: '校准' }], updated: '2026-09-09',
      },
      body: '## 问题\n叶子。\n\n## 结论\n- 2026-09-03 · 引用了 [[papers/a|甲]] 与 [[papers/b]]\n- 没日期的一条 [[nowhere]]\n\n## 未解决',
    },
    'methods/m': {
      kind: 'method',
      fm: { title: 'M', parents: [], columns: [{ key: 'how', label: '怎么做' }], updated: '2026-09-09' },
      body: '## 机制\n机制。',
    },
  },
}

describe('wiki 视图', () => {
  it('首页:每种聚合的计数、根节点按种类再按 id', () => {
    const home = wikiHome(DATA)
    expect(home.aggregationCount).toBe(3)
    expect(home.kinds).toEqual([
      { key: 'topic', label: '问题', dir: 'topics', count: 2 },
      { key: 'method', label: '方法', dir: 'methods', count: 1 },
    ])
    expect(home.roots.map((c) => c.id)).toEqual(['topics/root', 'methods/m'])
    expect(home.roots[0]).toMatchObject({
      kindLabel: '问题', title: 'Root', summary: '第一段。', childCount: 1, memberCount: 0, parentCount: 0,
    })
  })

  it('聚合页:子聚合、对照表的行与格子、派生列、正文、关联', () => {
    const leaf = wikiAggregation(DATA, 'topics/leaf')
    expect(leaf.parents).toEqual([{ id: 'topics/root', title: 'Root' }])
    expect(leaf.splitOn).toBeUndefined()
    expect(leaf.columns).toEqual([{ key: 'bits', label: '位宽' }, { key: 'calib', label: '校准' }])
    expect(leaf.derivedColumns).toEqual([])
    expect(leaf.rows).toEqual([
      { paper: { id: 'papers/a', title: 'A', fullTitle: 'A: first' }, cells: { bits: { value: 'W4', page: 1, quote: '4-bit' } }, derived: {} },
      { paper: { id: 'papers/b', title: 'B: second' }, cells: {}, derived: {} },
    ])
    expect(leaf.body).toBe(DATA.pages['topics/leaf']!.body)
    // Pages linked from the body are included; missing `nowhere` is omitted and aliased `a` still uses its display name.
    expect(leaf.titles).toEqual({ 'papers/a': 'A: first', 'papers/b': 'B: second' })
    expect(leaf.related).toEqual([{ label: '方法', links: [{ id: 'methods/m', title: 'M' }] }])

    const root = wikiAggregation(DATA, 'topics/root')
    expect(root.summary).toBe('第一段。')
    expect(root.body).toBe(DATA.pages['topics/root']!.body)
    expect(root.splitOn).toBe('按什么拆')
    expect(root.children.map((c) => c.id)).toEqual(['topics/leaf'])
    expect(root.rows).toEqual([])

    const m = wikiAggregation(DATA, 'methods/m')
    expect(m.derivedColumns).toEqual([{ key: 'used_for', label: '用于' }])
    expect(m.rows.map((r) => r.derived)).toEqual([
      { used_for: [{ id: 'topics/leaf', title: 'Leaf' }] }, { used_for: [] },
    ])
    expect(m.related).toEqual([{ label: '问题', links: [{ id: 'topics/leaf', title: 'Leaf' }] }])
  })

  it('论文页:正文原样、按聚合分组的归属', () => {
    const a = wikiPaper(DATA, 'papers/a')
    expect(a).toMatchObject({
      id: 'papers/a', title: 'A: first', short: 'A', authors: ['Ann'], year: 2024, venue: 'X 2024',
      pdf: 'sources/a.pdf', updated: '2026-09-05',
    })
    expect(a.body).toBe(DATA.pages['papers/a']!.body)
    expect(a.titles).toEqual({ 'papers/b': 'B: second' })
    expect(a.memberships).toEqual([
      {
        aggregation: { id: 'topics/leaf', title: 'Leaf' }, kind: 'topic', kindLabel: '问题',
        cells: [{ label: '位宽', cell: { value: 'W4', page: 1, quote: '4-bit' } }],
      },
      {
        aggregation: { id: 'methods/m', title: 'M' }, kind: 'method', kindLabel: '方法',
        cells: [{ label: '怎么做', cell: { value: 'rotate', page: 2, quote: 'we rotate' } }],
      },
    ])
    // A page without short title, venue, or PDF uses its title as the short title and empty strings for the other fields.
    expect(wikiPaper(DATA, 'papers/c')).toMatchObject({ short: 'C', venue: '', pdf: '', body: '' })
  })

  it('搜索索引:每页聚合一条,种类按 schema 次序、种类内按 id', () => {
    expect(wikiSearchIndex(DATA)).toEqual([
      { kind: 'aggregation', target: 'topics/leaf', title: '问题:Leaf', meta: 'Wiki' },
      { kind: 'aggregation', target: 'topics/root', title: '问题:Root', meta: 'Wiki' },
      { kind: 'aggregation', target: 'methods/m', title: '方法:M', meta: 'Wiki' },
    ])
  })

  it('卡片列表:每页聚合一张,种类按 schema 次序、种类内按 id,与搜索索引同序', () => {
    expect(wikiCards(DATA).map((c) => c.id)).toEqual(['topics/leaf', 'topics/root', 'methods/m'])
    expect(wikiCards(DATA).map((c) => c.id)).toEqual(wikiSearchIndex(DATA).map((h) => h.target))
  })

  it('不存在的 id 抛出,论文 id 当聚合取也抛出', () => {
    expect(() => wikiAggregation(DATA, 'topics/nope')).toThrow(/topics\/nope/)
    expect(() => wikiAggregation(DATA, 'papers/a')).toThrow(/papers\/a/)
    expect(() => wikiPaper(DATA, 'papers/nope')).toThrow(/papers\/nope/)
    expect(() => wikiPaper(DATA, 'topics/leaf')).toThrow(/topics\/leaf/)
  })

  it('parents 里指向库里没有的页:那一条的名字就是它的 id,页照常打开', () => {
    const data: WikiData = {
      ...DATA,
      pages: {
        ...DATA.pages,
        'topics/orphan': {
          kind: 'topic',
          fm: { title: 'Orphan', parents: ['topics/gone'], columns: [], updated: '2026-09-09' },
          body: '## 问题\n没有父页的一页。',
        },
      },
    }
    expect(wikiAggregation(data, 'topics/orphan').parents).toEqual([{ id: 'topics/gone', title: 'topics/gone' }])
  })

  it('取回的视图是新对象,改它渗不回数据', () => {
    const before = JSON.stringify(wikiAggregation(DATA, 'topics/leaf'))
    const leaf = wikiAggregation(DATA, 'topics/leaf')
    leaf.rows[0]!.cells['bits']!.value = '篡改'
    leaf.columns[0]!.label = '篡改'
    leaf.parents.length = 0
    expect(JSON.stringify(wikiAggregation(DATA, 'topics/leaf'))).toBe(before)
    const a = wikiPaper(DATA, 'papers/a')
    a.authors.push('篡改')
    expect(wikiPaper(DATA, 'papers/a').authors).toEqual(['Ann'])
  })
})
