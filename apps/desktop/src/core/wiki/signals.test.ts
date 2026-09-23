import { describe, expect, it } from 'vitest'
import type { WikiData } from './model.js'
import { nameKey, wikiSignals } from './signals.js'

/** Every §6.2 signal kind fires at least once on this small Wiki. */
const DATA: WikiData = {
  requireQuote: true,
  kinds: {
    topic: { dir: 'topics', label: '主题', describe: { section: '问题', hint: '' } },
    method: { dir: 'methods', label: '方法', describe: { section: '机制', hint: '' } },
  },
  sections: [],
  pages: {
    'papers/a': {
      kind: 'paper',
      fm: { title: 'A', updated: '2026-09-01', memberships: [
        { in: 'topics/leaf', cells: { ok: { value: 'x', at: { page: 1, quote: 'q' } }, bad: { value: 'y', at: { page: 0, quote: ' ' } } } },
        { in: 'topics/gone', cells: {} },
      ] },
      body: '见 [[papers/b]] 与 [[papers/trashed]],以及 [[topics/leaf#^nope]]。',
    },
    'papers/b': { kind: 'paper', fm: { title: 'B', updated: '2026-09-01' }, body: '' },
    'topics/root': { kind: 'topic', fm: { title: 'KV Cache', aliases: [], updated: '2026-09-01' }, body: '' },
    'topics/leaf': {
      kind: 'topic',
      fm: { title: 'Leaf', parents: ['topics/root'], updated: '2026-09-01', claims: [
        {
          id: 'c1', text: '一条', version: 1, since: '2026-09-01', by: 'ai:skill.meridian',
          evidence: [{ kind: 'personal', text: '', added: '2026-09-01', by: '我' }],
          conflicts: [{ id: 'k', against: { kind: 'claim', ref: 'topics/root#missing' }, note: 'x', since: '2026-09-01', by: '我' }],
        },
        {
          id: 'c2', text: '另一条', version: 1, since: '2026-09-01', by: '我',
          evidence: [{ kind: 'wiki', ref: 'topics/none', added: '2026-09-01', by: '我' }],
        },
      ] },
      body: '',
    },
    'topics/kv-cache': { kind: 'topic', fm: { title: 'kv-cache', updated: '2026-09-01' }, body: '' },
    'methods/rotations': { kind: 'method', fm: { title: 'Rotations', updated: '2026-09-01' }, body: '' },
    'methods/rotation': { kind: 'method', fm: { title: 'Rotation', updated: '2026-09-01' }, body: '' },
  },
}

describe('wiki signals', () => {
  const signals = wikiSignals(DATA, {
    projects: [{ id: 'draft', pages: ['topics/leaf', 'topics/old'] }],
    trashed: new Set(['papers/trashed']),
    missingRegions: ['topics/root'],
  })
  const of = (kind: string) => signals.filter((s) => s.kind === kind).map(({ page, related }) => ({ page, related }))

  it('按 §6.2 的次序列出,次序内按页再按相关项', () => {
    const kinds = signals.map((s) => s.kind)
    expect([...new Set(kinds)]).toEqual([
      'unfiled-paper', 'thin-aggregation', 'single-child', 'duplicate-name', 'broken-link', 'broken-membership',
      'broken-claim-ref', 'cell-missing-anchor', 'claim-without-evidence', 'open-conflict', 'missing-generated-region',
    ])
    expect(signals.every((s) => s.detail.length > 0)).toBe(true)
  })

  it('每一种的规则', () => {
    expect(of('unfiled-paper')).toEqual([{ page: 'papers/b', related: [] }])
    expect(of('thin-aggregation')).toEqual([
      { page: 'methods/rotation', related: [] }, { page: 'methods/rotations', related: [] },
      { page: 'topics/kv-cache', related: [] }, { page: 'topics/leaf', related: ['papers/a'] },
    ])
    expect(of('single-child')).toEqual([{ page: 'topics/root', related: ['topics/leaf'] }])
    expect(of('duplicate-name')).toEqual([
      { page: 'methods/rotation', related: ['methods/rotations'] }, { page: 'topics/kv-cache', related: ['topics/root'] },
    ])
    expect(signals.find((s) => s.kind === 'duplicate-name' && s.page === 'topics/kv-cache')!.detail).toContain('同名')
    expect(of('broken-link')).toEqual([
      { page: 'papers/a', related: ['papers/trashed'] },
      { page: 'projects/draft', related: ['topics/old'] },
      { page: 'topics/leaf', related: ['topics/none'] },
    ])
    expect(signals.find((s) => s.kind === 'broken-link' && s.page === 'papers/a')!.detail).toContain('在垃圾桶里')
    expect(of('broken-membership')).toEqual([{ page: 'papers/a', related: ['topics/gone'] }])
    expect(of('broken-claim-ref')).toEqual([
      { page: 'papers/a', related: ['topics/leaf#nope'] }, { page: 'topics/leaf', related: ['topics/root#missing'] },
    ])
    expect(of('cell-missing-anchor')).toEqual([{ page: 'papers/a', related: ['topics/leaf.bad'] }])
    expect(of('claim-without-evidence')).toEqual([{ page: 'topics/leaf', related: ['topics/leaf#c1'] }])
    expect(of('open-conflict')).toEqual([{ page: 'topics/leaf', related: ['topics/leaf#c1', 'topics/root#missing'] }])
    expect(of('missing-generated-region')).toEqual([{ page: 'topics/root', related: [] }])
  })

  it('名字键去掉空白、标点与符号并小写', () => {
    expect(nameKey(' KV-Cache ')).toBe('kvcache')
    expect(nameKey('Ｗｅｉｇｈｔ·Only')).toBe('weightonly')
  })
})
