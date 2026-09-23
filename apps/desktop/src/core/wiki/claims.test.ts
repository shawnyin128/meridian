import { describe, expect, it } from 'vitest'
import type { Evidence, ProposalOp } from '../../shared/contract.js'
import type { ClaimWorld } from './apply.js'
import { applyProposal, describeOp, isClaimOp, namedPages, touchedPages } from './apply.js'
import type { WikiAggregationRecord, WikiClaimRecord, WikiData } from './model.js'
import { wikiClaims } from './model.js'
import { generatedClaims } from './generated.js'

const TODAY = '2026-09-22'

/** One claim with a conflict against a claim on another page, one plain claim, and a paper to cite. */
const DATA: WikiData = {
  requireQuote: true,
  kinds: { topic: { dir: 'topics', label: '主题', describe: { section: '问题', hint: '' } } },
  sections: [{ key: 'experiments', label: '实验' }],
  pages: {
    'papers/eagle': { kind: 'paper', fm: { title: 'EAGLE-2: Faster', short: 'EAGLE-2', updated: '2026-09-01' }, body: '' },
    'topics/sd': {
      kind: 'topic',
      fm: {
        title: 'Speculative decoding', updated: '2026-09-01', claims: [{
          id: 'knee', text: '树宽收益在宽度 6 出现拐点', version: 2, since: '2026-06-09', by: '我',
          evidence: [{ kind: 'experiment', project: 'draft', node: 'exp1', text: '单请求实测', added: '2026-06-09', by: '我' }],
          conflicts: [{ id: 'batch', against: { kind: 'claim', ref: 'topics/batch#wins' }, note: '批量下拐点后移', since: '2026-09-14', by: 'ai:harness.lint' }],
          history: [{ version: 1, text: '树宽收益递减', since: '2026-05-02', by: '我' }],
        }, {
          id: 'plain', text: '一条没有冲突的结论', version: 1, since: '2026-09-01', by: '我',
          evidence: [{ kind: 'personal', text: '直觉', added: '2026-09-01', by: '我' }],
        }],
      },
      body: '## 问题\n起草与核对。',
    },
    'topics/batch': {
      kind: 'topic',
      fm: {
        title: 'Batch serving', updated: '2026-09-01', claims: [{
          id: 'wins', text: '批量场景仍净赚', version: 1, since: '2026-09-14', by: 'ai:harness.lint',
          evidence: [{ kind: 'experiment', project: 'draft', node: 'wide', added: '2026-09-14', by: 'ai:harness.lint' }],
          conflicts: [{ id: 'batch', against: { kind: 'claim', ref: 'topics/sd#knee' }, note: '批量下拐点后移', since: '2026-09-14', by: 'ai:harness.lint' }],
        }],
      },
      body: '',
    },
  },
}

/** A world with project `draft` (nodes exp1 and wide, conclusion c1) and one highlight on EAGLE-2. */
const world = (by = '我'): ClaimWorld => ({
  by,
  project: (id) => (id === 'draft' ? { nodes: ['exp1', 'wide'], conclusions: ['c1'] } : undefined),
  reading: (paper) => (paper === 'papers/eagle' ? { highlights: ['h-1'], notes: ['n-1'] } : { highlights: [], notes: [] }),
})
const AGENT = 'ai:skill.meridian'

const run = (ops: ProposalOp[], by = '我', data = DATA): WikiData => applyProposal(data, { ops }, TODAY, world(by))
const claims = (data: WikiData, id: string): WikiClaimRecord[] => (data.pages[id] as WikiAggregationRecord).fm.claims ?? []
const experiment: Evidence = { kind: 'experiment', project: 'draft', conclusion: 'c1', text: '实测' }

describe('claim ops', () => {
  it('addClaim:追加一条 v1,since / added / by 由 Core 盖,页的 updated 推到今天', () => {
    const next = run([{ op: 'addClaim', page: 'topics/sd', claim: {
      id: 'new', text: '新结论', evidence: [{ kind: 'source', paper: 'papers/eagle', page: 7, quote: 'wide trees', highlight: 'h-1' }, experiment],
    } }])
    expect(claims(next, 'topics/sd').at(-1)).toEqual({
      id: 'new', text: '新结论', version: 1, since: TODAY, by: '我',
      evidence: [
        { kind: 'source', paper: 'papers/eagle', page: 7, quote: 'wide trees', highlight: 'h-1', added: TODAY, by: '我' },
        { kind: 'experiment', project: 'draft', conclusion: 'c1', text: '实测', added: TODAY, by: '我' },
      ],
    })
    expect((next.pages['topics/sd'] as WikiAggregationRecord).fm.updated).toBe(TODAY)
    expect(claims(DATA, 'topics/sd')).toHaveLength(2)
  })

  it('addClaim 的拒收:id 已用、换行、证据重复、证据指向不存在的东西', () => {
    const add = (claim: { id: string; text: string; evidence: Evidence[] }, by = '我') =>
      () => run([{ op: 'addClaim', page: 'topics/sd', claim }], by)
    expect(add({ id: 'knee', text: 'x', evidence: [experiment] })).toThrow(/已经有这个结论 id/)
    expect(add({ id: 'n', text: 'a\nb', evidence: [experiment] })).toThrow(/换行/)
    expect(add({ id: 'n', text: 'x', evidence: [experiment, { ...experiment, text: '另一种说法' }] })).toThrow(/证据已经在/)
    expect(add({ id: 'n', text: 'x', evidence: [{ kind: 'source', paper: 'papers/eagle', page: 1, quote: 'A  B' }, { kind: 'source', paper: 'papers/eagle', page: 1, quote: 'a b' }] })).toThrow(/证据已经在/)
    expect(add({ id: 'n', text: 'x', evidence: [{ kind: 'source', paper: 'papers/nope', page: 1, quote: 'q' }] })).toThrow(/papers\/nope/)
    expect(add({ id: 'n', text: 'x', evidence: [{ kind: 'wiki', ref: 'topics/sd#gone' }] })).toThrow(/topics\/sd#gone/)
    expect(add({ id: 'n', text: 'x', evidence: [{ kind: 'experiment', project: 'nope', node: 'exp1' }] })).toThrow(/项目不存在:nope/)
    expect(add({ id: 'n', text: 'x', evidence: [{ kind: 'experiment', project: 'draft', node: 'gone' }] })).toThrow(/没有节点:gone/)
    expect(add({ id: 'n', text: 'x', evidence: [{ kind: 'experiment', project: 'draft', conclusion: 'c9' }] })).toThrow(/没有结论:c9/)
    expect(add({ id: 'n', text: 'x', evidence: [{ kind: 'experiment', project: 'draft' }] })).toThrow(/节点或结论/)
    expect(add({ id: 'n', text: 'x', evidence: [{ kind: 'note', paper: 'papers/eagle' }] })).toThrow(/只能指一个/)
    expect(add({ id: 'n', text: 'x', evidence: [{ kind: 'note', paper: 'papers/eagle', highlight: 'h-9' }] })).toThrow(/h-9/)
    expect(() => run([{ op: 'addClaim', page: 'papers/eagle', claim: { id: 'n', text: 'x', evidence: [experiment] } }])).toThrow(/聚合不存在/)
    expect(add({ id: 'n', text: 'x', evidence: [{ kind: 'note', paper: 'papers/eagle', highlight: 'h-1' }, { kind: 'wiki', ref: 'topics/batch' }] })).not.toThrow()
  })

  it('agent:个人判断只有「我」能写;addClaim 与 reviseClaim 要带实验证据', () => {
    const personal: Evidence = { kind: 'personal', text: '我觉得' }
    expect(() => run([{ op: 'addClaim', page: 'topics/sd', claim: { id: 'n', text: 'x', evidence: [experiment, personal] } }], AGENT))
      .toThrow('只有「我」能写个人判断')
    expect(() => run([{ op: 'addClaim', page: 'topics/sd', claim: { id: 'n', text: 'x', evidence: [{ kind: 'wiki', ref: 'topics/batch#wins' }] } }], AGENT))
      .toThrow(/要带实验证据/)
    expect(() => run([{ op: 'reviseClaim', page: 'topics/sd', claim: 'plain', text: '改过' }], AGENT)).toThrow(/要带实验证据/)
    const next = run([{ op: 'addClaim', page: 'topics/sd', claim: { id: 'n', text: 'x', evidence: [experiment, { kind: 'wiki', ref: 'topics/batch#wins' }] } }], AGENT)
    expect(claims(next, 'topics/sd').at(-1)).toMatchObject({ by: AGENT, evidence: [{ by: AGENT }, { by: AGENT }] })
    expect(() => run([{ op: 'reviseClaim', page: 'topics/sd', claim: 'plain', text: '改过' }])).not.toThrow()
  })

  it('reviseClaim:旧版本进 history,版本 +1,text / since / by 换掉,给的证据追加,冲突留着', () => {
    const next = run([{ op: 'reviseClaim', page: 'topics/sd', claim: 'knee', text: '单请求下拐点在 6', evidence: [{ kind: 'experiment', project: 'draft', node: 'wide' }] }], AGENT)
    expect(claims(next, 'topics/sd')[0]).toEqual({
      id: 'knee', text: '单请求下拐点在 6', version: 3, since: TODAY, by: AGENT,
      evidence: [
        claims(DATA, 'topics/sd')[0]!.evidence[0],
        { kind: 'experiment', project: 'draft', node: 'wide', added: TODAY, by: AGENT },
      ],
      conflicts: claims(DATA, 'topics/sd')[0]!.conflicts,
      history: [
        { version: 1, text: '树宽收益递减', since: '2026-05-02', by: '我' },
        { version: 2, text: '树宽收益在宽度 6 出现拐点', since: '2026-06-09', by: '我' },
      ],
    })
    expect(() => run([{ op: 'reviseClaim', page: 'topics/sd', claim: 'knee', text: '树宽收益在宽度 6 出现拐点' }])).toThrow(/一样/)
    expect(() => run([{ op: 'reviseClaim', page: 'topics/sd', claim: 'gone', text: 'x' }])).toThrow(/结论不存在:topics\/sd#gone/)
    expect(() => run([{ op: 'reviseClaim', page: 'topics/sd', claim: 'knee', text: 'x', evidence: [{ kind: 'experiment', project: 'draft', node: 'exp1', text: '同一个节点' }] }]))
      .toThrow(/证据已经在/)
  })

  it('addEvidence:只追加证据,不升版本;重复的证据拒收', () => {
    const next = run([{ op: 'addEvidence', page: 'topics/sd', claim: 'plain', evidence: [experiment] }])
    expect(claims(next, 'topics/sd')[1]).toMatchObject({ version: 1, evidence: [{ kind: 'personal' }, { kind: 'experiment', added: TODAY }] })
    expect(() => run([{ op: 'addEvidence', page: 'topics/sd', claim: 'plain', evidence: [{ kind: 'personal', text: '直觉' }] }])).toThrow('证据已经在这条结论上了')
    expect(() => run([{ op: 'addEvidence', page: 'topics/sd', claim: 'gone', evidence: [experiment] }])).toThrow(/结论不存在/)
  })

  it('markConflict:两边都记上冲突;不能冲突自己,同一个 id 不能开两次,目标结论要在', () => {
    const next = run([{ op: 'markConflict', page: 'topics/sd', claim: 'plain', conflict: {
      id: 'scope', against: { kind: 'claim', ref: 'topics/batch#wins' }, note: '适用范围不同',
    } }])
    expect(claims(next, 'topics/sd')[1]!.conflicts).toEqual([
      { id: 'scope', against: { kind: 'claim', ref: 'topics/batch#wins' }, note: '适用范围不同', since: TODAY, by: '我' },
    ])
    expect(claims(next, 'topics/batch')[0]!.conflicts!.at(-1)).toEqual(
      { id: 'scope', against: { kind: 'claim', ref: 'topics/sd#plain' }, note: '适用范围不同', since: TODAY, by: '我' },
    )
    const mark = (claim: string, id: string, ref: string) => () => run([{ op: 'markConflict', page: 'topics/sd', claim, conflict: { id, against: { kind: 'claim', ref }, note: 'x' } }])
    expect(mark('plain', 'self', 'topics/sd#plain')).toThrow(/不能与自己冲突/)
    expect(mark('knee', 'batch', 'topics/sd#plain')).toThrow(/已经有冲突 batch/)
    expect(mark('plain', 'batch', 'topics/batch#wins')).toThrow(/topics\/batch#wins 上已经有冲突 batch/)
    expect(mark('plain', 'x', 'topics/batch#gone')).toThrow(/冲突指向的结论不存在/)
    expect(() => run([{ op: 'markConflict', page: 'topics/sd', claim: 'plain', conflict: { id: 'src', against: { kind: 'source', paper: 'papers/eagle', page: 2, quote: 'q' }, note: '原文说法相反' } }])).not.toThrow()
  })

  it('resolveConflict:两边的冲突一起去掉;结果要有同一提案里对应的那一步', () => {
    const resolve = (outcome: 'revised' | 'split' | 'retracted' | 'dismissed', extra: ProposalOp[] = []) =>
      run([...extra, { op: 'resolveConflict', page: 'topics/sd', claim: 'knee', conflict: 'batch', outcome, note: '处理了' }])
    const dismissed = resolve('dismissed')
    expect(claims(dismissed, 'topics/sd')[0]!.conflicts).toBeUndefined()
    expect(claims(dismissed, 'topics/batch')[0]!.conflicts).toBeUndefined()
    expect(() => resolve('revised')).toThrow(/已修订/)
    expect(() => resolve('split')).toThrow(/已拆分/)
    expect(() => resolve('retracted')).toThrow(/已撤回/)
    expect(() => resolve('revised', [{ op: 'reviseClaim', page: 'topics/batch', claim: 'wins', text: '批量 ≥8 时仍净赚' }])).not.toThrow()
    expect(() => resolve('split', [{ op: 'addClaim', page: 'topics/sd', claim: { id: 'knee-batch', text: '批量另说', evidence: [experiment] } }])).not.toThrow()
    const retracted = run([
      { op: 'resolveConflict', page: 'topics/sd', claim: 'knee', conflict: 'batch', outcome: 'retracted', note: '撤回批量那条' },
      { op: 'retractClaim', page: 'topics/batch', claim: 'wins', reason: '只跑了一次' },
    ])
    expect(claims(retracted, 'topics/batch')).toEqual([])
    expect(() => run([{ op: 'resolveConflict', page: 'topics/sd', claim: 'plain', conflict: 'batch', outcome: 'dismissed', note: 'x' }])).toThrow(/没有冲突 batch/)
  })

  it('retractClaim:删掉这一条;有未处理的冲突时拒收', () => {
    expect(claims(run([{ op: 'retractClaim', page: 'topics/sd', claim: 'plain', reason: '不成立' }]), 'topics/sd').map((c) => c.id)).toEqual(['knee'])
    expect(() => run([{ op: 'retractClaim', page: 'topics/sd', claim: 'knee', reason: 'x' }])).toThrow(/先处理/)
    expect(() => run([{ op: 'retractClaim', page: 'topics/sd', claim: 'plain', reason: 'a\nb' }])).toThrow(/换行/)
  })

  it('读不懂的结论(手改坏了)不出现在视图与生成区里,其他结论照常', () => {
    const broken: WikiData = { ...DATA, pages: { ...DATA.pages, 'topics/batch': {
      ...DATA.pages['topics/batch']!, fm: { title: 'Batch serving', updated: '2026-09-01', claims: [{ id: 'x' } as unknown as WikiClaimRecord, ...claims(DATA, 'topics/batch')] },
    } } }
    expect(wikiClaims(broken, 'topics/batch', {}).map((c) => c.id)).toEqual(['wins'])
    expect(generatedClaims(broken, 'topics/batch', {})).toContain('^wins')
  })
})

describe('claim op lines and pages', () => {
  it('describeOp 的结论几行照协议 §2.6', () => {
    const ops: ProposalOp[] = [
      { op: 'addClaim', page: 'topics/sd', claim: { id: 'n', text: '新结论', evidence: [experiment] } },
      { op: 'reviseClaim', page: 'topics/sd', claim: 'knee', text: '改过' },
      { op: 'addEvidence', page: 'topics/sd', claim: 'plain', evidence: [experiment, { kind: 'personal', text: '' }] },
      { op: 'markConflict', page: 'topics/sd', claim: 'plain', conflict: { id: 'c', against: { kind: 'claim', ref: 'topics/batch#wins' }, note: 'x' } },
      { op: 'resolveConflict', page: 'topics/sd', claim: 'knee', conflict: 'batch', outcome: 'dismissed', note: 'x' },
      { op: 'retractClaim', page: 'topics/sd', claim: 'plain', reason: '不成立' },
    ]
    expect(ops.map((op) => describeOp(op, DATA))).toEqual([
      '+ topics/sd#n:新结论',
      '~ topics/sd#knee v2→v3:改过',
      '+ topics/sd#plain 证据 ×2',
      '~ topics/sd#plain 冲突 topics/batch#wins',
      '~ topics/sd#knee 冲突 batch 已处理(dismissed)',
      '- topics/sd#plain:一条没有冲突的结论',
    ])
    expect(ops.every(isClaimOp)).toBe(true)
    expect(isClaimOp({ op: 'setParents', page: 'topics/sd', parents: [] })).toBe(false)
  })

  it('点名的页含冲突目标与 wiki 证据的页;写到的页含 resolveConflict 另一边', () => {
    expect(namedPages([
      { op: 'addClaim', page: 'topics/sd', claim: { id: 'n', text: 'x', evidence: [experiment, { kind: 'wiki', ref: 'topics/batch#wins' }] } },
      { op: 'markConflict', page: 'topics/sd', claim: 'plain', conflict: { id: 'c', against: { kind: 'claim', ref: 'topics/other#y' }, note: 'x' } },
    ])).toEqual(['topics/sd', 'topics/batch', 'topics/other'])
    expect(touchedPages({ ops: [
      { op: 'resolveConflict', page: 'topics/sd', claim: 'knee', conflict: 'batch', outcome: 'dismissed', note: 'x' },
    ] }, DATA)).toEqual(['topics/sd', 'topics/batch'])
  })
})

describe('claims region', () => {
  it('照协议 §2.4 的例子渲染:版本、日期、块 id、各种证据与冲突一行一条', () => {
    const data: WikiData = { ...DATA, pages: { ...DATA.pages, 'topics/sd': { ...DATA.pages['topics/sd']!, fm: {
      title: 'Speculative decoding', updated: '2026-09-01', claims: [{
        ...claims(DATA, 'topics/sd')[0]!,
        text: '单请求场景下,draft 树加宽的收益在宽度约 6 处出现拐点',
        evidence: [
          { kind: 'experiment', project: 'draft', node: 'exp1', text: '单请求实测,拐点在宽度 6', added: '2026-06-09', by: '我' },
          { kind: 'source', paper: 'papers/eagle', page: 7, quote: '…the verification cost of wide\ndraft trees is amortized…', highlight: 'h-31', added: '2026-09-14', by: 'ai:harness.ingest' },
          { kind: 'wiki', ref: 'topics/batch#wins', added: '2026-09-14', by: '我' },
          { kind: 'note', paper: 'papers/eagle', highlight: 'h-1', added: '2026-09-14', by: '我' },
          { kind: 'personal', text: '直觉', added: '2026-09-14', by: '我' },
        ],
      }],
    } } } }
    expect(generatedClaims(data, 'topics/sd', { draft: 'draft 效率' })).toBe([
      '## 结论',
      '- 单请求场景下,draft 树加宽的收益在宽度约 6 处出现拐点 · v2 · 2026-06-09 ^knee',
      '  - 证据 · 实验 [[projects/draft|draft 效率]] exp1:单请求实测,拐点在宽度 6',
      '  - 证据 · [[papers/eagle|EAGLE-2]] (p.7)「…the verification cost of wide draft trees is amortized…」',
      '  - 证据 · [[topics/batch#^wins|Batch serving]]',
      '  - 你的笔记 · [[papers/eagle|EAGLE-2]]',
      '  - 个人判断 · 直觉',
      '  - 冲突 · [[topics/batch#^wins|批量场景仍净赚]]:批量下拐点后移',
    ].join('\n'))
    expect(generatedClaims(DATA, 'topics/sd', {}).split('\n')).toContain('  - 证据 · 实验 [[projects/draft|draft]] exp1:单请求实测')
  })

  it('没有结论的页写(暂无结论)', () => {
    const empty: WikiData = { ...DATA, pages: { ...DATA.pages, 'topics/batch': { ...DATA.pages['topics/batch']!, fm: { title: 'B', updated: '2026-09-01' } } } }
    expect(generatedClaims(empty, 'topics/batch', {})).toBe('## 结论\n(暂无结论)')
  })

  it('视图把证据与冲突的名字解析出来', () => {
    const [knee] = wikiClaims(DATA, 'topics/sd', { draft: 'draft 效率' })
    expect(knee!.evidence[0]).toEqual({
      evidence: { kind: 'experiment', project: 'draft', node: 'exp1', text: '单请求实测' }, added: '2026-06-09', by: '我', title: 'draft 效率',
    })
    expect(knee!.conflicts[0]).toMatchObject({ id: 'batch', title: '批量场景仍净赚' })
    expect(knee!.history).toEqual([{ version: 1, text: '树宽收益递减', since: '2026-05-02', by: '我' }])
    expect(wikiClaims(DATA, 'topics/sd', {})[1]!.evidence[0]).toEqual({
      evidence: { kind: 'personal', text: '直觉' }, added: '2026-09-01', by: '我',
    })
  })
})
