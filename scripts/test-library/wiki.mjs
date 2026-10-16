import { onDay } from './app.mjs'
import { quoteOf } from './papers.mjs'

const SPEC = 'topics/speculative-decoding'
const KV = 'topics/kv-cache-compression'
const KV_METHOD = 'methods/kv-quantization'

/**
 * Seeds the Wiki through `wiki.apply` and `wiki.update` as the user writes it: topics with a child
 * topic, methods with a derived column, comparison tables whose cells quote page 1, page bodies
 * linking papers by id, claims with source and personal evidence, an open conflict and appended
 * entries. Unfiled papers, thin pages and a link to a trashed paper raise Wiki signals.
 */
export async function seedWiki(seed, call, files) {
  const paper = (key) => `papers/${seed.papers[key]}`
  const quote = (key, pattern) => quoteOf(files, key, pattern)
  const cell = async (key, pattern, value) => ({ value, page: 1, quote: await quote(key, pattern) })
  const apply = (title, ops) => call('wiki.apply', { proposal: { source: 'user', title, ops } })
  const aggregation = (kind, id, title, columns, describe, parents = []) =>
    ({ op: 'createAggregation', kind, id, title, parents, columns, describe })

  await onDay(seed, -12, () => apply('建立推测解码、KV cache 和混合专家的页', [
    aggregation('topic', SPEC, '推测解码', [{ key: 'speedup', label: '加速比' }, { key: 'draft', label: '草稿来源' }],
      '先用便宜的草稿猜出几个 token，再让目标模型一次并行验证。难点是草稿既要猜得准，又不能太贵。'),
    aggregation('topic', 'topics/draft-trees', '树形草稿', [], '一次验证多条候选路径，用树形注意力掩码共享前缀。', [SPEC]),
    aggregation('topic', KV, 'KV cache 压缩', [{ key: 'bits', label: '位宽' }],
      '长上下文推理里 KV cache 占满显存，要在精度几乎不掉的前提下把它压小。'),
    aggregation('topic', 'topics/mixture-of-experts', '混合专家', [], '每个 token 只激活少数专家，参数量和计算量解耦。'),
    aggregation('method', 'methods/draft-heads', '草稿头', [{ key: 'heads', label: '头的结构' }],
      '在目标模型上加轻量的头来出草稿，不需要单独的小模型。'),
    aggregation('method', KV_METHOD, 'KV 量化', [{ key: 'granularity', label: '量化粒度' }],
      '把 K 和 V 量化到低位宽，按通道或按 token 分组。'),
  ]))
  const member = async (key, page, cells) => ({ op: 'setMembership', paper: paper(key), in: page, cells })
  await onDay(seed, -10, async () => apply('把论文归到推测解码和 KV cache 下', [
    await member('specdec', SPEC, { speedup: await cell('specdec', null, '2–3×'), draft: await cell('specdec', null, '独立小模型') }),
    await member('eagle', SPEC, { speedup: await cell('eagle', /latency speedup ratio/, '2.7–3.5×'), draft: await cell('eagle', /straightforward/, '特征层草稿头') }),
    await member('medusa', SPEC, { draft: await cell('medusa', /decoding heads to predict/, '多个解码头') }),
    await member('trees', SPEC, { speedup: await cell('trees', null, '2–3×') }),
    await member('trees', 'topics/draft-trees', {}),
    await member('kivi', KV, { bits: await cell('kivi', /Asymmetric 2bit Quantization/, '2') }),
    await member('h2o', KV, { bits: await cell('h2o', null, '16，只淘汰不量化') }),
    await member('quip', KV, { bits: await cell('quip', null, '2') }),
    await member('switch', 'topics/mixture-of-experts', {}),
    await member('eagle', 'methods/draft-heads', { heads: await cell('eagle', /straightforward/, '单层 decoder') }),
    await member('medusa', 'methods/draft-heads', { heads: await cell('medusa', /decoding heads to predict/, '多个前馈头') }),
    await member('kivi', KV_METHOD, { granularity: await cell('kivi', /value cache should/, 'K 按通道，V 按 token') }),
  ]))

  await onDay(seed, -4, async () => {
    const guide = [
      '## 怎么读这一页', '',
      `从 [[${paper('specdec')}]] 开始，它给出了接受准则。[[${paper('eagle')}]] 和 [[${paper('medusa')}]] 把草稿换成目标模型上的头，[[${paper('trees')}]] 再按接受率调整树宽。`,
      '', '树形验证单独放在 [[topics/draft-trees]]。', '', '',
    ].join('\n')
    const { body } = await call('wiki.aggregation', { id: SPEC })
    await call('wiki.update', { id: SPEC, body: body.replace('## 实验', `${guide}## 实验`) })
    await call('wiki.update', { id: paper('h2o'), body: [
      '## 要点', '', '- 注意力分数集中在少数重击者 token 上。',
      `- 和 [[${KV_METHOD}]] 里的量化方法正交，可以叠加。`,
      `- 长上下文评测原本用 [[${paper('infbench')}]]。`, '',
    ].join('\n') })
  })
  await onDay(seed, -2, async () => {
    await apply('记下推测解码与 KV 量化的结论', [
      { op: 'addClaim', page: SPEC, claim: { id: 'acceptance-rate', text: '加速比主要取决于草稿的接受率，而不是草稿模型有多大。', evidence: [
        { kind: 'source', paper: paper('eagle'), page: 1, quote: await quote('eagle', /latency speedup ratio/) },
        { kind: 'personal', text: '我们在 13B 上的复现也是这个趋势。' },
      ] } },
      { op: 'addClaim', page: KV, claim: { id: 'kv-2bit', text: 'KV cache 量化到 2bit 时，K 必须按通道分组，否则精度明显下降。', evidence: [
        { kind: 'source', paper: paper('kivi'), page: 1, quote: await quote('kivi', /value cache should/) },
      ] } },
      { op: 'addClaim', page: KV_METHOD, claim: { id: 'token-eviction', text: '只保留重击者 token 的淘汰方法比 2bit 量化更省显存。', evidence: [
        { kind: 'source', paper: paper('h2o'), page: 1, quote: await quote('h2o') },
      ] } },
    ])
    await apply('标出两条 KV 结论的冲突', [{
      op: 'markConflict', page: KV_METHOD, claim: 'token-eviction', conflict: {
        id: 'memory-budget', against: { kind: 'claim', ref: `${KV}#kv-2bit` },
        note: '两条结论对哪种方法更省显存的判断相反，需要同一显存预算下的对比实验。',
      },
    }])
  })
  await apply('记下推测解码的实验和未解决问题', [
    { op: 'appendEntry', page: SPEC, section: '实验', date: seed.today, text: '13B 上复现 EAGLE，加速比 2.8×。' },
    { op: 'appendEntry', page: SPEC, section: '未解决', date: seed.today, text: '树宽固定为 4 时，长回答的接受率掉得很快，原因还不清楚。' },
  ])
}
