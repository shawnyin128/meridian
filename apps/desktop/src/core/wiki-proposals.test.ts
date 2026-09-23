import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProposalOp, WikiClaim } from '../shared/contract.js'
import { WikiProposalSchema } from '../shared/contract.js'
import { createFixtureStore } from './fixture-store.js'
import type { VaultStore } from './vault.js'
import { createVaultStore } from './vault-store.js'
import type { PdfPage, PdfPageText } from './wiki-proposals.js'
import { checkQuotes, createWikiProposals, pdfPageText } from './wiki-proposals.js'
import { namedPages } from './wiki/index.js'

const TODAY = '2026-09-22'
const NOW = Date.parse('2026-09-22T08:00:00Z')

/** A PDF whose every page holds `text` (null: no text layer) and that has `pages` pages. */
const fakePdf = (text: string | null, pages = 10): PdfPageText => async (_paper, page): Promise<PdfPage> => {
  if (page > pages) return { state: 'no-page', pages }
  return text === null ? { state: 'empty' } : { state: 'text', text }
}

/** An agent envelope for `ops` whose base is every named page's version in `store` now. */
function envelope(store: VaultStore, ops: ProposalOp[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    protocol: 1,
    key: `k-${JSON.stringify(ops).length}-${String(extra['key'] ?? '')}`,
    producer: { kind: 'ai', id: 'skill.meridian' },
    trigger: { kind: 'experiment', project: 'draft', node: 'knee' },
    title: '宽树实验的结论',
    base: Object.fromEntries(namedPages(ops).map((id) => [id, store.pageVersion(id)])),
    ops,
    ...extra,
  }
}

const addClaim = (id: string, page = 'topics/qat'): ProposalOp => ({
  op: 'addClaim', page, claim: { id, text: `结论 ${id}`, evidence: [{ kind: 'experiment', project: 'draft', node: 'knee' }] },
})

const claimOn = (store: VaultStore, page: string, id: string): WikiClaim | undefined =>
  store.wikiAggregation(page).claims.find((c) => c.id === id)

describe('review queue on the fixture library', () => {
  let store: VaultStore
  let queue: ReturnType<typeof createWikiProposals>

  beforeEach(() => {
    store = createFixtureStore(() => TODAY, () => new Date(NOW))
    queue = createWikiProposals({ store, pdf: fakePdf(null), now: () => NOW })
  })

  it('fixture 队列:一条能用、一条已过期排队,一条已拒绝;读出来带要写的页、现在是否过期、页名项目名节点名与结论原文', () => {
    const list = queue.list()
    for (const item of list) WikiProposalSchema.parse(item)
    expect(list.map((p) => [p.status, p.staleNow])).toEqual([['queued', false], ['queued', true], ['rejected', false]])
    expect(list[0]!.titles).toEqual({ 'topics/kv-cache-quantization': 'KV cache quantization', 'projects/draft': 'draft 效率', 'projects/draft#knee': '树宽收益拐点' })
    expect(list[0]!.claimTexts).toEqual({ 'topics/kv-cache-quantization#prefix-schedule': 'KV cache 量化之后,前缀读取与验证可以共调度,吞吐与基线持平' })
    expect(list[0]!.pages).toEqual(['topics/kv-cache-quantization'])
    expect(queue.list('rejected').map((p) => p.reason?.kind)).toEqual(['declined'])
  })

  it('base 里的页 id 带 . 或 .. 的提案进不了队列', async () => {
    const before = store.proposalRecords().length
    await expect(queue.propose(envelope(store, [addClaim('dots')], { base: { '../x': null } }))).rejects.toThrow('提案的格式不对')
    expect(store.proposalRecords()).toHaveLength(before)
  })

  it('一条记录读不出来时单独报出,其余照常列出', () => {
    const broken: VaultStore = {
      ...store,
      pageVersion: (id) => {
        if (id === 'topics/kv-cache-quantization') throw new Error('这一页读不了')
        return store.pageVersion(id)
      },
    }
    const list = createWikiProposals({ store: broken, pdf: fakePdf(null), now: () => NOW }).list()
    expect(list.map((p) => [p.status, p.proposal === null, p.notice])).toEqual([
      ['queued', true, '这一页读不了'], ['queued', false, null], ['rejected', false, null],
    ])
  })

  it('应用:按提出者写入并记一条「实验」来源的变动,记录变成 applied 并指向那条变动;撤销还原', async () => {
    const [valid] = queue.list('queued')
    const before = store.wikiAggregation('topics/kv-cache-quantization').claims
    const receipt = await queue.decide(valid!.id, 'apply')
    expect(receipt).toEqual({ id: valid!.id, status: 'applied', reason: null })
    expect(claimOn(store, 'topics/kv-cache-quantization', 'prefix-schedule')).toMatchObject({
      version: 3, by: 'ai:skill.meridian', since: TODAY,
      history: [{ version: 1 }, { version: 2, by: '我' }],
    })
    const change = store.listChanges()[0]!
    expect(change).toMatchObject({ source: '实验', title: `Wiki · ${valid!.proposal!.title}` })
    expect(change.diff[0]).toMatch(/^~ topics\/kv-cache-quantization#prefix-schedule v2→v3:/)
    const record = queue.list().find((p) => p.id === valid!.id)!
    expect(record).toMatchObject({ status: 'applied', change: change.id, decided: { at: NOW, by: '我' } })
    await expect(queue.decide(valid!.id, 'apply')).rejects.toThrow('这条提案已经处理过了')
    store.undoChange(change.id)
    expect(store.wikiAggregation('topics/kv-cache-quantization').claims).toEqual(before)
  })

  it('应用一条过期的提案:拒收为 stale,Wiki 一个字不动;拒绝时记下理由', async () => {
    const [, stale] = queue.list('queued')
    const before = store.wikiAggregation('topics/ptq-weight-only')
    const receipt = await queue.decide(stale!.id, 'apply')
    expect(receipt.status).toBe('rejected')
    expect(receipt.reason).toMatchObject({ kind: 'stale', message: expect.stringContaining('提案过期:topics/ptq-weight-only') })
    expect(store.wikiAggregation('topics/ptq-weight-only')).toEqual(before)
    const [valid] = queue.list('queued')
    expect(await queue.decide(valid!.id, 'decline', '证据不够')).toEqual({
      id: valid!.id, status: 'rejected', reason: { kind: 'declined', message: '证据不够' },
    })
    await expect(queue.decide('proposal-404', 'apply')).rejects.toThrow('没有这条提案')
  })

  it('提交:合格的进队列;同一个 key 同样内容给回原收据,内容不同就拒', async () => {
    const proposal = envelope(store, [addClaim('fresh')])
    const receipt = await queue.propose(proposal)
    expect(receipt).toMatchObject({ status: 'queued', reason: null })
    expect(queue.list()[0]).toMatchObject({ id: receipt.id, received: NOW, path: 'review', decided: null })
    expect(claimOn(store, 'topics/qat', 'fresh')).toBeUndefined()
    const count = queue.list().length
    expect(await queue.propose(structuredClone(proposal))).toEqual(receipt)
    expect(queue.list()).toHaveLength(count)
    await expect(queue.propose({ ...proposal, title: '换了标题' })).rejects.toThrow(/同一个 key 已经提交过内容不同的提案/)
    expect(queue.list()).toHaveLength(count)
  })

  it('提交:agent 只能提结论;要给出点名的每一页的版本;过期的拒收;人工的走 wiki.apply', async () => {
    const outcome = async (proposal: Record<string, unknown>) => (await queue.propose(proposal)).reason
    expect(await outcome(envelope(store, [addClaim('m'), { op: 'setParents', page: 'topics/qat', parents: [] }], { key: 'parents' })))
      .toEqual({ kind: 'invalid', message: 'agent 只能提交结论相关的提案' })
    expect(await outcome({ ...envelope(store, [addClaim('a')], { key: 'a' }), base: {} }))
      .toEqual({ kind: 'invalid', message: '提案没有给出它依据的页的版本:topics/qat' })
    expect(await outcome({ ...envelope(store, [addClaim('b')], { key: 'b' }), base: { 'topics/qat': { fm: '0000000000000000', body: '0000000000000000' } } }))
      .toMatchObject({ kind: 'stale', message: expect.stringContaining('没有落盘。按现在的页重新生成。') })
    expect(await outcome({ ...envelope(store, [addClaim('c')], { key: 'c' }), producer: { kind: 'human' } }))
      .toEqual({ kind: 'invalid', message: '人工的改动走 wiki.apply' })
    const rejected = queue.list('rejected')[0]!
    expect(rejected.decided).toEqual({ at: NOW, by: 'policy' })
  })

  it('提交:没有实验证据、带个人判断、实验证据指错项目的结论被拒为 invalid', async () => {
    const reason = async (evidence: unknown[]) => (await queue.propose(envelope(store, [
      { op: 'addClaim', page: 'topics/qat', claim: { id: 'x', text: 'x', evidence } } as ProposalOp,
    ], { key: JSON.stringify(evidence) }))).reason
    expect(await reason([{ kind: 'wiki', ref: 'topics/ptq' }])).toMatchObject({ kind: 'invalid', message: expect.stringContaining('实验证据') })
    expect(await reason([{ kind: 'experiment', project: 'draft', node: 'knee' }, { kind: 'personal', text: '我觉得' }]))
      .toEqual({ kind: 'invalid', message: '只有「我」能写个人判断' })
    expect(await reason([{ kind: 'experiment', project: 'nope', node: 'wide' }])).toEqual({ kind: 'invalid', message: '项目不存在:nope' })
    expect(await reason([{ kind: 'experiment', project: 'draft', node: 'wide' }]))
      .toEqual({ kind: 'invalid', message: '节点 wide 还没有结论:先用 record_conclusion 记下它的结论,再拿它当证据' })
  })

  it('提交:协议版本不对或不是信封的形状就抛错,说清原因', async () => {
    await expect(queue.propose({ ...envelope(store, [addClaim('p')]), protocol: 2 })).rejects.toThrow('提案协议版本 2 不认识,Core 只认 1;请更新 App')
    await expect(queue.propose({ protocol: 1, ops: [] })).rejects.toThrow(/提案的格式不对/)
  })

  it('新版本多写的字段不拒收,记录里原样留着', async () => {
    const op = { ...addClaim('future'), confidence: 0.9 } as ProposalOp
    const receipt = await queue.propose({ ...envelope(store, [op]), priority: 'high' })
    expect(receipt.status).toBe('queued')
    const record = queue.list().find((p) => p.id === receipt.id)!
    expect(record.proposal).toMatchObject({ priority: 'high', ops: [{ confidence: 0.9 }] })
    await queue.decide(receipt.id, 'apply')
    expect(claimOn(store, 'topics/qat', 'future')).toMatchObject({ text: '结论 future' })
  })

  it('没有文字层的引句照样排队,记录里标出来;有文字层却找不到的拒收', async () => {
    const source = { kind: 'source', paper: 'papers/2305.17888', page: 1, quote: 'data-free distillation of the model' }
    const op = { op: 'addClaim', page: 'topics/qat', claim: { id: 'q', text: 'x', evidence: [{ kind: 'experiment', project: 'draft', node: 'knee' }, source] } } as ProposalOp
    const receipt = await queue.propose(envelope(store, [op]))
    expect(receipt.status).toBe('queued')
    expect(queue.list()[0]!.notice).toBe('这些引句没有文字层可核对:papers/2305.17888 p.1')
    const strict = createWikiProposals({ store, pdf: fakePdf('Nothing about that here.'), now: () => NOW })
    expect((await strict.propose(envelope(store, [op], { key: 'strict' }))).reason)
      .toEqual({ kind: 'invalid', message: '引句在原文第 1 页找不到:papers/2305.17888' })
  })
})

describe('quote verification', () => {
  const source = (quote: string, page = 1): ProposalOp => ({
    op: 'addEvidence', page: 'topics/qat', claim: 'x', evidence: [{ kind: 'source', paper: 'papers/p', page, quote }],
  })

  it('两边都归一化后比:NFKC、软连字符、行尾连字符、空白与大小写', async () => {
    const pdf = fakePdf('The verifi­cation cost of wide draft trees is amor- tized  across the BATCH.')
    expect(await checkQuotes([source('the verification cost of wide draft trees is amortized across the batch')], 'ai:x', pdf))
      .toEqual({ invalid: null, unverifiable: [] })
  })

  it('页码超出原文页数、找不到引句的拒收;agent 的引句太短拒收,人工的不管长短', async () => {
    expect((await checkQuotes([source('anything at all here', 12)], '我', fakePdf('x', 11))).invalid)
      .toBe('papers/p 的原文只有 11 页,没有第 12 页')
    expect((await checkQuotes([source('not in the text at all')], '我', fakePdf('other words'))).invalid)
      .toBe('引句在原文第 1 页找不到:papers/p')
    expect((await checkQuotes([source('short')], 'ai:x', fakePdf('short'))).invalid).toBe('引句太短,至少要 12 个字符才能核对:papers/p')
    expect((await checkQuotes([source('short')], '我', fakePdf('short'))).invalid).toBeNull()
    expect(await checkQuotes([source('whatever is quoted here')], '我', fakePdf(null))).toEqual({ invalid: null, unverifiable: ['papers/p p.1'] })
  })
})

describe('review queue on a vault', () => {
  let vault: string
  let store: VaultStore
  const meridian = () => join(vault, '.meridian')
  const inbox = () => join(meridian(), 'proposal-inbox')

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-queue-'))
    cpSync(resolve(import.meta.dirname, 'fixtures/vault'), vault, { recursive: true })
    vi.stubEnv('MERIDIAN_LIBRARY_ROOT', vault)
    store = createVaultStore(vault, () => TODAY, () => new Date(NOW))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(vault, { recursive: true, force: true })
  })

  /**
   * A project bound to a workspace whose Lab graph has one supported node holding a conclusion, and
   * one verified legacy conclusion, for experiment evidence.
   */
  const project = (): { id: string; node: string; conclusion: string } => {
    store.createProject('写回')
    const id = store.listProjects().find((p) => p.name === '写回')!.id
    const root = join(vault, 'repo')
    const node = 'wide.n1'
    mkdirSync(join(root, '.meridian', 'graph'), { recursive: true })
    writeFileSync(join(root, '.meridian', 'graph', 'graph.json'), JSON.stringify({
      schema: 'meridian.lab.graph.v1', nodes: [{ id: node, title: '宽树', state: 'supported' }], edges: [],
      node_details: { [node]: { conclusion: { text: '宽树在 B≥8 时净赚', date: '2026-09-20', evidence: ['exp-1'] } } },
    }))
    store.bindProjectWorkspace(id, { kind: 'local', root })
    const conclusion = store.createConclusion(id, '宽树在 B≥8 时净赚', {}).conclusionList[0]!.id
    store.setConclusionState(id, conclusion, 'verified')
    return { id, node, conclusion }
  }

  it('真实跨进程:Python 提交的结论带 wiki 证据,base 里有那一页,App 收下排队', async () => {
    const { id, node } = project()
    const ops = [{ op: 'addClaim', page: 'topics/speculative-decoding', claim: {
      id: 'cross', text: '跨进程的一条', evidence: [
        { kind: 'experiment', project: id, node }, { kind: 'wiki', ref: 'topics/draft-acceptance#batch-wins' },
      ],
    } }]
    const script = [
      'import json, sys',
      'from pathlib import Path',
      'from meridian.wiki.propose import submit_wiki_proposal',
      `submit_wiki_proposal(wiki_root=Path(${JSON.stringify(join(vault, 'wiki'))}), ops=json.loads(sys.argv[1]), title="跨进程", project=${JSON.stringify(id)})`,
    ].join('\n')
    execFileSync('python', ['-c', script, JSON.stringify(ops)], {
      env: { ...process.env, PYTHONPATH: resolve(import.meta.dirname, '../../../../src'), PYTHONIOENCODING: 'utf-8' },
    })
    const queue = createWikiProposals({ store, pdf: fakePdf(null), now: () => NOW })
    await queue.scanInbox()
    expect(queue.list().map((p) => [p.status, p.reason])).toEqual([['queued', null]])
  })

  it('收件箱:合格、坏 JSON、过期三份各记一条,文件都删掉;临时文件不碰', async () => {
    const { id, node } = project()
    const queue = createWikiProposals({ store, pdf: fakePdf(null), now: () => NOW })
    const op: ProposalOp = { op: 'addClaim', page: 'topics/speculative-decoding', claim: {
      id: 'wide', text: '宽树结论', evidence: [{ kind: 'experiment', project: id, node }],
    } }
    mkdirSync(inbox(), { recursive: true })
    writeFileSync(join(inbox(), 'a-valid.json'), JSON.stringify({ ...envelope(store, [op]), trigger: { kind: 'experiment', project: id } }))
    writeFileSync(join(inbox(), 'b-broken.json'), '{ "protocol": 1, ')
    writeFileSync(join(inbox(), 'c-stale.json'), JSON.stringify({ ...envelope(store, [op], { key: 'stale' }), base: { 'topics/speculative-decoding': { fm: '0000000000000000', body: '0000000000000000' } } }))
    writeFileSync(join(inbox(), 'd-writing.json.tmp'), '{')
    await queue.scanInbox()
    expect(readdirSync(inbox())).toEqual(['d-writing.json.tmp'])
    const records = queue.list()
    expect(records.map((r) => [r.status, r.reason?.kind ?? null])).toEqual([['rejected', 'stale'], ['rejected', 'invalid'], ['queued', null]])
    expect(records[1]).toMatchObject({ proposal: null, reason: { message: expect.stringMatching(/^b-broken\.json:/) } })
    expect(records[2]!.titles[`projects/${id}#${node}`]).toBe('宽树')
    const onDisk = JSON.parse(readFileSync(join(meridian(), 'proposals.json'), 'utf8')) as { id: string }[]
    expect(onDisk.map((r) => r.id)).toEqual(records.map((r) => r.id))
    await queue.decide(records[2]!.id, 'apply')
    expect(createVaultStore(vault).wikiAggregation('topics/speculative-decoding').claims.map((c) => c.id)).toContain('wide')
  })

  it('另一个版本写的队列:多出来的字段留着,读不了的那一条原样保留,其余照常', async () => {
    const queue = createWikiProposals({ store, pdf: fakePdf(null), now: () => NOW })
    const { id, node } = project()
    const receipt = await queue.propose(envelope(store, [{ op: 'addClaim', page: 'topics/draft-acceptance', claim: {
      id: 'n', text: 'x', evidence: [{ kind: 'experiment', project: id, node }],
    } }]))
    const file = join(meridian(), 'proposals.json')
    const [record] = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>[]
    const future = { ...record, id: 'proposal-900', status: 'withdrawn' }
    writeFileSync(file, JSON.stringify([{ ...record, reviewer: 'someone' }, future]))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reopened = createVaultStore(vault, () => TODAY, () => new Date(NOW))
    const again = createWikiProposals({ store: reopened, pdf: fakePdf(null), now: () => NOW })
    expect(again.list().map((r) => r.id)).toEqual([receipt.id])
    await again.decide(receipt.id, 'decline', '先不写')
    const saved = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>[]
    expect(saved).toHaveLength(2)
    expect(saved[0]).toMatchObject({ reviewer: 'someone', status: 'rejected' })
    expect(saved[1]).toEqual(future)
  })

  it('信号文件:打开时写一次;处理完冲突再写一次,冲突信号没了', () => {
    const file = join(meridian(), 'wiki-signals.json')
    const first = JSON.parse(readFileSync(file, 'utf8')) as { generated_at: string; signals: { kind: string; page: string }[] }
    expect(first.generated_at).toBe(new Date(NOW).toISOString())
    expect(first.signals.filter((s) => s.kind === 'open-conflict').map((s) => s.page))
      .toEqual(['topics/draft-acceptance', 'topics/speculative-decoding'])
    expect(first.signals).toEqual(store.wikiSignals())
    store.applyProposal({ source: 'user', title: '处理冲突', ops: [
      { op: 'resolveConflict', page: 'topics/speculative-decoding', claim: 'draft-knee', conflict: 'batch', outcome: 'dismissed', note: '场景不同' },
    ] })
    const second = JSON.parse(readFileSync(file, 'utf8')) as { signals: { kind: string }[] }
    expect(second.signals.some((s) => s.kind === 'open-conflict')).toBe(false)
  })

  it('人工的结论写到页上:块与生成区都更新,另一页的冲突一起去掉;撤销逐字节还原', () => {
    const pages = ['topics/speculative-decoding', 'topics/draft-acceptance'].map((id) => join(vault, 'wiki', `${id}.md`))
    const before = pages.map((f) => readFileSync(f, 'utf8'))
    store.applyProposal({ source: 'user', title: '拆成两条', ops: [
      { op: 'addClaim', page: 'topics/speculative-decoding', claim: { id: 'knee-batch', text: '批量下另说', evidence: [{ kind: 'personal', text: '' }] } },
      { op: 'resolveConflict', page: 'topics/speculative-decoding', claim: 'draft-knee', conflict: 'batch', outcome: 'split', note: '场景属性' },
    ] })
    const [sd, da] = pages.map((f) => readFileSync(f, 'utf8'))
    expect(sd).toContain('  - id: "knee-batch"\n    text: "批量下另说"\n    version: 1\n    since: "2026-09-22"\n    by: "我"')
    expect(sd).toContain('- 批量下另说 · v1 · 2026-09-22 ^knee-batch\n  - 个人判断\n<!-- /generated -->')
    expect(sd).not.toContain('id: "batch"')
    expect(da).not.toContain('conflicts:')
    expect(da).not.toContain('  - 冲突 ·')
    expect(sd!.match(/^updated: .*$/m)![0]).toBe('updated: "2026-09-22"')
    const change = store.listChanges()[0]!
    expect(change).toMatchObject({ source: '我', undoable: true })
    store.undoChange(change.id)
    expect(pages.map((f) => readFileSync(f, 'utf8'))).toEqual(before)
  })

  it('项目结论写回 Wiki:experiment 证据指向结论,项目详情看得到它写到了哪条', () => {
    const { id, conclusion } = project()
    expect(store.getProject(id).conclusionClaims).toBeUndefined()
    store.applyProposal({ source: 'user', title: '写入 Wiki', ops: [
      { op: 'addClaim', page: 'topics/draft-acceptance', claim: { id: 'b8', text: '宽树在 B≥8 时净赚', evidence: [{ kind: 'experiment', project: id, conclusion }] } },
    ] })
    expect(store.getProject(id).conclusionClaims).toEqual({ [conclusion]: ['topics/draft-acceptance#b8'] })
    expect(claimOn(store, 'topics/draft-acceptance', 'b8')!.evidence[0]).toMatchObject({ title: '写回', evidence: { conclusion } })
  })

  it('旧格式的库照常读写:schema 还有「结论」、页上没有结论块与结论生成区', () => {
    const page = join(vault, 'wiki', 'topics', 'speculative-decoding.md')
    const old = [
      '---', 'kind: "topic"', 'title: "Speculative decoding"', 'aliases: []', 'parents: []', 'columns: []', 'updated: "2026-05-20"', '---',
      '<!-- generated:children -->', '## 子聚合', '(无)', '<!-- /generated -->',
      '<!-- generated:table -->', '## 对照表', '(此节点不直接收论文)', '<!-- /generated -->', '',
      '## 问题', '起草与核对。', '', '## 结论', '- 2026-05-01 · 旧版写下的一条结论', '', '## 实验', '', '## 未解决', '',
    ].join('\n')
    writeFileSync(page, old)
    const schema = join(vault, 'wiki', 'schema.yaml')
    writeFileSync(schema, readFileSync(schema, 'utf8').replace('sections:\n', 'sections:\n  - {key: conclusions, label: 结论}\n'))
    writeFileSync(join(vault, 'wiki', 'topics', 'draft-acceptance.md'), readFileSync(join(vault, 'wiki', 'topics', 'draft-acceptance.md'), 'utf8')
      .replace(/ {4}conflicts:\n(?: {6,}.*\n)+/, ''))
    const reopened = createVaultStore(vault, () => TODAY, () => new Date(NOW))
    const view = reopened.wikiAggregation('topics/speculative-decoding')
    expect(view.claims).toEqual([])
    expect(view.body).toContain('- 2026-05-01 · 旧版写下的一条结论')
    reopened.applyProposal({ source: 'user', title: '旧的追加区', ops: [
      { op: 'appendEntry', page: 'topics/speculative-decoding', section: '结论', date: TODAY, text: '还能追' },
    ] })
    reopened.applyProposal({ source: 'user', title: '第一条结论', ops: [
      { op: 'addClaim', page: 'topics/speculative-decoding', claim: { id: 'first', text: '第一条', evidence: [{ kind: 'personal', text: '' }] } },
    ] })
    const text = readFileSync(page, 'utf8')
    expect(text).toContain('## 结论\n- 2026-05-01 · 旧版写下的一条结论\n- 2026-09-22 · 还能追\n')
    expect(text).toContain('<!-- /generated -->\n<!-- generated:claims -->\n## 结论\n- 第一条 · v1 · 2026-09-22 ^first\n  - 个人判断\n<!-- /generated -->')
    expect(reopened.wikiAggregation('topics/speculative-decoding').claims.map((c) => c.id)).toEqual(['first'])
  })

  it('引句按真实 PDF 的文字层核对', async () => {
    const pdf = pdfPageText(store)
    expect(await pdf('papers/13979-STAR-Speculative-Decodin', 1)).toEqual({ state: 'text', text: 'Reader fixture page 1' })
    const op = (q: string, page = 1): ProposalOp => ({ op: 'addEvidence', page: 'topics/speculative-decoding', claim: 'draft-knee', evidence: [
      { kind: 'source', paper: 'papers/13979-STAR-Speculative-Decodin', page, quote: q },
    ] })
    expect(await checkQuotes([op('READER  fixture\npage 1')], 'ai:x', pdf)).toEqual({ invalid: null, unverifiable: [] })
    expect((await checkQuotes([op('Reader fixture page 1', 3)], 'ai:x', pdf)).invalid)
      .toBe('papers/13979-STAR-Speculative-Decodin 的原文只有 2 页,没有第 3 页')
    expect((await checkQuotes([op('this sentence is certainly not on the first page')], 'ai:x', pdf)).invalid)
      .toBe('引句在原文第 1 页找不到:papers/13979-STAR-Speculative-Decodin')
    expect(await pdf('papers/no-such-paper', 1)).toEqual({ state: 'no-pdf' })
    expect(existsSync(inbox())).toBe(false)
  })
})
