import { describe, expect, it } from 'vitest'
import type { Proposal } from '../../shared/contract.js'
import type { WikiAggregationRecord, WikiData } from './model.js'
import { applyProposal, describeOp, touchedPages } from './apply.js'

const TODAY = '2026-09-10'

/** A question aggregation with a leaf, a method family, and two papers gives every operation a target. */
const DATA: WikiData = {
  requireQuote: true,
  kinds: {
    topic: { dir: 'topics', label: '问题', describe: { section: '问题', hint: '' } },
    method: { dir: 'methods', label: '方法', describe: { section: '机制', hint: '' } },
  },
  sections: [{ key: 'conclusions', label: '结论' }, { key: 'open', label: '未解决' }],
  pages: {
    'papers/a': {
      kind: 'paper',
      fm: { title: 'A', updated: '2026-09-01', memberships: [
        { in: 'topics/leaf', cells: { bits: { value: 'W4', at: { page: 1, quote: '4-bit' } } } },
      ] },
      body: '',
    },
    'papers/b': { kind: 'paper', fm: { title: 'B', updated: '2026-09-01' }, body: '' },
    'topics/root': {
      kind: 'topic',
      fm: { title: 'Root', parents: [], columns: [], split_on: '按什么拆', updated: '2026-09-01' },
      body: '## 问题\n根。\n\n## 结论\n\n## 未解决',
    },
    'topics/leaf': {
      kind: 'topic',
      fm: { title: 'Leaf', parents: ['topics/root'], columns: [{ key: 'bits', label: '位宽' }], updated: '2026-09-01' },
      body: '## 问题\n叶。\n\n## 结论\n- 2026-09-01 · 旧的一条\n\n## 未解决',
    },
    'methods/m': {
      kind: 'method',
      fm: { title: 'M', parents: [], columns: [{ key: 'how', label: '怎么做' }], updated: '2026-09-01' },
      body: '## 机制\n机制。\n\n## 结论\n\n## 未解决',
    },
  },
}

const proposal = (ops: Proposal['ops']): Proposal => ({ source: 'ingest', title: '测试', ops })

describe('applyProposal', () => {
  it('新建聚合:一页新的聚合页,描述节与追加区齐全,updated 是今天', () => {
    const next = applyProposal(DATA, proposal([{
      op: 'createAggregation', kind: 'topic', id: 'topics/new', title: 'New', parents: ['topics/root'],
      columns: [{ key: 'bits', label: '位宽' }], describe: '新的。', splitOn: '沿这个拆',
    }]), TODAY)
    expect(next.pages['topics/new']).toEqual({
      kind: 'topic',
      fm: { title: 'New', aliases: [], parents: ['topics/root'], columns: [{ key: 'bits', label: '位宽' }], split_on: '沿这个拆', updated: TODAY },
      body: '## 问题\n新的。\n\n## 结论\n\n## 未解决',
    })
    // The input remains unchanged.
    expect(DATA.pages['topics/new']).toBeUndefined()
  })

  it('加归属:格子按目标聚合的列键存,论文页的 updated 推到今天;再加同一聚合就是换', () => {
    const once = applyProposal(DATA, proposal([{
      op: 'setMembership', paper: 'papers/b', in: 'topics/leaf',
      cells: { bits: { value: 'W8', page: 2, quote: '8-bit' } },
    }]), TODAY)
    const b = once.pages['papers/b']
    expect(b?.kind).toBe('paper')
    expect(b?.fm).toEqual({ title: 'B', updated: TODAY, memberships: [
      { in: 'topics/leaf', cells: { bits: { value: 'W8', at: { page: 2, quote: '8-bit' } } } },
    ] })
    const twice = applyProposal(once, proposal([{
      op: 'setMembership', paper: 'papers/b', in: 'topics/leaf',
      cells: { bits: { value: 'W2', page: 3, quote: '2-bit' } },
    }]), TODAY)
    expect((twice.pages['papers/b'] as { fm: { memberships: unknown[] } }).fm.memberships).toEqual([
      { in: 'topics/leaf', cells: { bits: { value: 'W2', at: { page: 3, quote: '2-bit' } } } },
    ])
  })

  it('去掉归属;追一条;换列', () => {
    const next = applyProposal(DATA, proposal([
      { op: 'removeMembership', paper: 'papers/a', in: 'topics/leaf' },
      { op: 'appendEntry', page: 'topics/leaf', section: '结论', date: TODAY, text: '新的一条 [[papers/a]]' },
      { op: 'setColumns', page: 'methods/m', columns: [{ key: 'how', label: '怎么做' }, { key: 'cost', label: '代价' }] },
    ]), TODAY)
    expect((next.pages['papers/a'] as { fm: { memberships: unknown[] } }).fm.memberships).toEqual([])
    expect(next.pages['topics/leaf']!.body)
      .toBe('## 问题\n叶。\n\n## 结论\n- 2026-09-01 · 旧的一条\n- 2026-09-10 · 新的一条 [[papers/a]]\n\n## 未解决')
    expect(next.pages['topics/leaf']!.fm.updated).toBe(TODAY)
    expect((next.pages['methods/m'] as { fm: { columns: unknown[] } }).fm.columns).toEqual([
      { key: 'how', label: '怎么做' }, { key: 'cost', label: '代价' },
    ])
  })

  it('追到空节:落在标题下一行;页上没有那一节就拒绝', () => {
    const next = applyProposal(DATA, proposal([
      { op: 'appendEntry', page: 'topics/root', section: '未解决', date: TODAY, text: '尾上一条' },
    ]), TODAY)
    expect(next.pages['topics/root']!.body).toBe('## 问题\n根。\n\n## 结论\n\n## 未解决\n- 2026-09-10 · 尾上一条')
    expect(() => applyProposal({
      ...DATA, pages: { ...DATA.pages, 'topics/root': { ...DATA.pages['topics/root']!, body: '## 问题\n根。' } },
    }, proposal([{ op: 'appendEntry', page: 'topics/root', section: '结论', date: TODAY, text: 'x' }]), TODAY))
      .toThrow(/没有「结论」这一节/)
  })

  it('同一条提案里后面的 op 看得见前面的:先建聚合再往里加归属', () => {
    const next = applyProposal(DATA, proposal([
      { op: 'createAggregation', kind: 'method', id: 'methods/n', title: 'N', parents: [], columns: [{ key: 'how', label: '怎么做' }], describe: '。' },
      { op: 'setMembership', paper: 'papers/b', in: 'methods/n', cells: { how: { value: 'x', page: 1, quote: 'q' } } },
    ]), TODAY)
    expect((next.pages['papers/b'] as { fm: { memberships: { in: string }[] } }).fm.memberships.map((m) => m.in)).toEqual(['methods/n'])
  })

  it.each<[string, Proposal['ops'][number], RegExp]>([
    ['schema 里没有这种聚合', { op: 'createAggregation', kind: 'dataset', id: 'datasets/x', title: 'X', parents: [], columns: [], describe: '' }, /dataset/],
    ['id 不在这种聚合的目录下', { op: 'createAggregation', kind: 'topic', id: 'methods/x', title: 'X', parents: [], columns: [], describe: '' }, /topics\//],
    ['id 带路径', { op: 'createAggregation', kind: 'topic', id: 'topics/../evil', title: 'X', parents: [], columns: [], describe: '' }, /文件名/],
    ['id 带斜杠', { op: 'createAggregation', kind: 'topic', id: 'topics/a/b', title: 'X', parents: [], columns: [], describe: '' }, /文件名/],
    ['id 已经存在', { op: 'createAggregation', kind: 'topic', id: 'topics/leaf', title: 'X', parents: [], columns: [], describe: '' }, /topics\/leaf/],
    ['父聚合不存在', { op: 'createAggregation', kind: 'topic', id: 'topics/x', title: 'X', parents: ['topics/nope'], columns: [], describe: '' }, /topics\/nope/],
    ['父聚合不是同一种', { op: 'createAggregation', kind: 'topic', id: 'topics/x', title: 'X', parents: ['methods/m'], columns: [], describe: '' }, /methods\/m/],
    ['列键重复', { op: 'createAggregation', kind: 'topic', id: 'topics/x', title: 'X', parents: [], columns: [{ key: 'a', label: '1' }, { key: 'a', label: '2' }], describe: '' }, /a/],
    ['论文不存在', { op: 'setMembership', paper: 'papers/nope', in: 'topics/leaf', cells: {} }, /papers\/nope/],
    ['目标不是聚合', { op: 'setMembership', paper: 'papers/b', in: 'papers/a', cells: {} }, /papers\/a/],
    ['格子的键不在列里', { op: 'setMembership', paper: 'papers/b', in: 'topics/leaf', cells: { nope: { value: 'x', page: 1, quote: 'q' } } }, /nope/],
    ['格子没有原文引句', { op: 'setMembership', paper: 'papers/b', in: 'topics/leaf', cells: { bits: { value: 'x', page: 1, quote: '' } } }, /引句/],
    ['去掉一条不存在的归属', { op: 'removeMembership', paper: 'papers/b', in: 'topics/leaf' }, /topics\/leaf/],
    ['追加区不在 schema 里', { op: 'appendEntry', page: 'topics/leaf', section: '实验', date: TODAY, text: 'x' }, /实验/],
    ['往论文页追条目', { op: 'appendEntry', page: 'papers/a', section: '结论', date: TODAY, text: 'x' }, /papers\/a/],
    ['条目带换行', { op: 'appendEntry', page: 'topics/leaf', section: '结论', date: TODAY, text: 'a\nb' }, /换行/],
    ['换列丢了成员已经填的格子', { op: 'setColumns', page: 'topics/leaf', columns: [{ key: 'other', label: 'x' }] }, /bits/],
  ])('拒绝:%s', (_, op, message) => {
    expect(() => applyProposal(DATA, proposal([op]), TODAY)).toThrow(message)
  })

  it('不要求引句的库收得下空引句', () => {
    const lax = { ...DATA, requireQuote: false }
    expect(() => applyProposal(lax, proposal([{
      op: 'setMembership', paper: 'papers/b', in: 'topics/leaf', cells: { bits: { value: 'x', page: 1, quote: '' } },
    }]), TODAY)).not.toThrow()
  })

  it('碰到的页:每条 op 碰的那一页,去重,按提案里的次序', () => {
    expect(touchedPages(proposal([
      { op: 'setMembership', paper: 'papers/b', in: 'topics/leaf', cells: {} },
      { op: 'appendEntry', page: 'topics/leaf', section: '结论', date: TODAY, text: 'x' },
      { op: 'setMembership', paper: 'papers/b', in: 'methods/m', cells: {} },
      { op: 'createAggregation', kind: 'topic', id: 'topics/x', title: 'X', parents: [], columns: [], describe: '' },
    ]))).toEqual(['papers/b', 'topics/leaf', 'topics/x'])
  })

  it('setParents:挂到同类的页下、拿掉;不同种类、自己、重复、成环都拒绝;updated 推到今天', () => {
    const next = applyProposal(DATA, proposal([
      { op: 'setParents', page: 'topics/leaf', parents: [] },
    ]), TODAY)
    expect((next.pages['topics/leaf'] as { fm: { parents: string[]; updated: string } }).fm)
      .toMatchObject({ parents: [], updated: TODAY })
    const back = applyProposal(next, proposal([{ op: 'setParents', page: 'topics/leaf', parents: ['topics/root'] }]), TODAY)
    expect((back.pages['topics/leaf'] as { fm: { parents: string[] } }).fm.parents).toEqual(['topics/root'])

    const bad = (ops: Proposal['ops']) => () => applyProposal(DATA, proposal(ops), TODAY)
    expect(bad([{ op: 'setParents', page: 'topics/leaf', parents: ['methods/m'] }])).toThrow(/不是同一种/)
    expect(bad([{ op: 'setParents', page: 'topics/leaf', parents: ['topics/leaf'] }])).toThrow(/自己/)
    expect(bad([{ op: 'setParents', page: 'topics/leaf', parents: ['topics/root', 'topics/root'] }])).toThrow(/重复/)
    // Making `leaf` the parent of `root` creates a cycle because `leaf` already belongs to `root`.
    expect(bad([{ op: 'setParents', page: 'topics/root', parents: ['topics/leaf'] }])).toThrow(/成环/)
    expect(bad([{ op: 'setParents', page: 'papers/a', parents: [] }])).toThrow(/papers\/a/)
    expect(bad([{ op: 'setParents', page: 'topics/leaf', parents: ['topics/nope'] }])).toThrow(/topics\/nope/)
  })

  it('setParents:隔着一级的环也拒,只是跳一级挂不成环的收', () => {
    // A three-level chain: root <- leaf <- twig.
    const deep: WikiData = {
      ...DATA,
      pages: {
        ...DATA.pages,
        'topics/twig': {
          kind: 'topic',
          fm: { title: 'Twig', parents: ['topics/leaf'], columns: [], updated: '2026-09-01' },
          body: '## 问题\n枝。\n\n## 结论\n\n## 未解决',
        },
      },
    }
    expect(() => applyProposal(deep, proposal([{ op: 'setParents', page: 'topics/root', parents: ['topics/twig'] }]), TODAY))
      .toThrow(/成环/)
    const next = applyProposal(deep, proposal([{ op: 'setParents', page: 'topics/twig', parents: ['topics/root'] }]), TODAY)
    expect((next.pages['topics/twig'] as { fm: { parents: string[] } }).fm.parents).toEqual(['topics/root'])
  })

  it('setAggregationMetadata:只改用户字段并推进 updated,论文页拒绝', () => {
    const next = applyProposal(DATA, proposal([{
      op: 'setAggregationMetadata', page: 'topics/leaf', title: 'Leaf renamed', splitOn: '模型规模',
    }]), TODAY)
    expect((next.pages['topics/leaf'] as WikiAggregationRecord).fm)
      .toMatchObject({ title: 'Leaf renamed', split_on: '模型规模', updated: TODAY })
    expect(() => applyProposal(DATA, proposal([{
      op: 'setAggregationMetadata', page: 'papers/a', title: 'A', splitOn: null,
    }]), TODAY)).toThrow(/papers\/a/)
  })

  it('聚合的 id 可以是任何文字的字母数字:中文文件名收,路径穿越拒', () => {
    const ok = applyProposal(DATA, proposal([{
      op: 'createAggregation', kind: 'topic', id: 'topics/量化', title: '量化', parents: [], columns: [], describe: '',
    }]), TODAY)
    expect(ok.pages['topics/量化']).toBeDefined()
    for (const id of ['topics/../x', 'topics/a/b', 'topics/.', 'topics/..', 'topics/']) {
      expect(() => applyProposal(DATA, proposal([{
        op: 'createAggregation', kind: 'topic', id, title: 'x', parents: [], columns: [], describe: '',
      }]), TODAY)).toThrow()
    }
  })

  it('每条 op 一行 diff', () => {
    expect([
      { op: 'createAggregation', kind: 'topic', id: 'topics/x', title: 'X', parents: [], columns: [], describe: '' },
      { op: 'setMembership', paper: 'papers/b', in: 'topics/leaf', cells: { bits: { value: 'x', page: 1, quote: 'q' } } },
      { op: 'removeMembership', paper: 'papers/a', in: 'topics/leaf' },
      { op: 'appendEntry', page: 'topics/leaf', section: '结论', date: TODAY, text: '一条' },
      { op: 'setColumns', page: 'methods/m', columns: [{ key: 'a', label: '1' }] },
      { op: 'setAggregationMetadata', page: 'topics/leaf', title: 'Leaf', splitOn: null },
    ].map((op) => describeOp(op as Proposal['ops'][number]))).toEqual([
      '+ topics/x 新建(topic)',
      '+ papers/b ∈ topics/leaf(1 格)',
      '- papers/a ∈ topics/leaf',
      '+ topics/leaf § 结论:一条',
      '~ methods/m 列:a',
      '~ topics/leaf 元数据:Leaf',
    ])
    expect(describeOp({ op: 'setParents', page: 'topics/leaf', parents: ['topics/root', 'topics/x'] })).toBe('~ topics/leaf 属于:topics/root,topics/x')
  })
})
