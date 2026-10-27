import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFixtureStore } from '../fixture-store.js'
import { fixedRanking } from '../fixtures/ranking.js'
import { minimalPdf } from '../net/minimal-pdf.js'
import type { VaultStore } from '../vault.js'
import { createVaultStore } from '../vault-store.js'
import { trainingExamples, type ExampleStore, type TrainingExample } from './examples.js'
import type { RecommendationIntent, CardSignal, ScopeSignals } from './types.js'

const direction = (id: string, label: string, core: boolean, seeds: string[]): RecommendationIntent => ({
  id, label, core, enabled: true, score: 0.5,
  seeds: seeds.map((paperId) => ({ paperId, title: paperId, abstract: '', source: 'project' })),
})

/** A card of the scope that left the feed for `left`, its paper known as `ARXIV:<arxiv>`. */
const card = (arxiv: string, fields: Partial<CardSignal> = {}): CardSignal => ({
  paperIds: [`ARXIV:${arxiv}`], gone: true, downloaded: false, reasons: [], ...fields,
})

/** A store whose project `p` holds `directions` and whose scopes hold `signals`. */
const storeOf = (directions: RecommendationIntent[], signals: ScopeSignals): ExampleStore => ({
  discoveryIntents: () => directions,
  scopeSignals: () => signals,
})

const sorted = (examples: TrainingExample[]) => [...examples].sort((left, right) => left.paperId.localeCompare(right.paperId))

describe('trainingExamples', () => {
  const core = direction('d-core', 'KV cache', true, ['ARXIV:0001'])
  const other = direction('d-other', 'Speculative decoding', false, ['ARXIV:0002'])
  const scope = { kind: 'direction', projectId: 'p', directionId: 'd-core' } as const

  it('每种动作按计划里的权重记成正例或负例:入库 1、稍后阅读 0.5、已经了解 0.3、忽略是 0.3 的负例', () => {
    const store = storeOf([core], {
      cards: [
        card('1001', { left: 'library' }),
        card('1002', { left: 'later' }),
        card('1003', { left: 'known', feedback: 'known' }),
        card('1004', { left: 'dismissed' }),
      ],
      ratings: {},
    })
    expect(sorted(trainingExamples(scope, store))).toEqual([
      { paperId: 'ARXIV:0001', weight: 1, positive: true },
      { paperId: 'ARXIV:1001', weight: 1, positive: true },
      { paperId: 'ARXIV:1002', weight: 0.5, positive: true },
      { paperId: 'ARXIV:1003', weight: 0.3, positive: true },
      { paperId: 'ARXIV:1004', weight: 0.3, positive: false },
    ])
  })

  it('入库后评 4 到 5 星是 1.5 的正例,评 1 到 2 星换成 0.5 的负例,评 3 星不改入库的 1', () => {
    const store = storeOf([core], {
      cards: [
        card('1001', { left: 'library', rating: 5 }),
        card('1002', { left: 'library', rating: 4 }),
        card('1003', { left: 'library', rating: 3 }),
        card('1004', { left: 'library', rating: 2 }),
        card('1005', { left: 'library', rating: 1 }),
      ],
      ratings: {},
    })
    expect(sorted(trainingExamples(scope, store)).slice(1)).toEqual([
      { paperId: 'ARXIV:1001', weight: 1.5, positive: true },
      { paperId: 'ARXIV:1002', weight: 1.5, positive: true },
      { paperId: 'ARXIV:1003', weight: 1, positive: true },
      { paperId: 'ARXIV:1004', weight: 0.5, positive: false },
      { paperId: 'ARXIV:1005', weight: 0.5, positive: false },
    ])
  })

  it('方向的种子是 1 的正例;种子论文在库里的评分同样算:5 星是 1.5,1 星换成 0.5 的负例', () => {
    const seeds = direction('d-core', 'KV cache', true, ['ARXIV:0001', 'ARXIV:0002', 'ARXIV:0003'])
    const store = storeOf([seeds], { cards: [], ratings: { 'ARXIV:0001': 5, 'ARXIV:0002': 1 } })
    expect(trainingExamples(scope, store)).toEqual([
      { paperId: 'ARXIV:0001', weight: 1.5, positive: true },
      { paperId: 'ARXIV:0002', weight: 0.5, positive: false },
      { paperId: 'ARXIV:0003', weight: 1, positive: true },
    ])
  })

  it('旧版本存下的更多类似是 0.5 的正例,卡片还在推送里或折叠了都算;旧的减少类似是 0.5 的负例,有没有离开原因都算;没记离开原因的已下载卡片算入库', () => {
    const store = storeOf([core], {
      cards: [
        card('1001', { gone: false, feedback: 'more' }),
        card('1002', { left: 'folded', feedback: 'more' }),
        card('1003', { left: 'less', feedback: 'less' }),
        card('1004', { feedback: 'less' }),
        card('1005', { feedback: 'known' }),
        card('1006', { downloaded: true }),
        card('1007', { gone: false, downloaded: true }),
        card('1008', { left: 'later', downloaded: true }),
      ],
      ratings: {},
    })
    expect(sorted(trainingExamples(scope, store)).slice(1)).toEqual([
      { paperId: 'ARXIV:1001', weight: 0.5, positive: true },
      { paperId: 'ARXIV:1002', weight: 0.5, positive: true },
      { paperId: 'ARXIV:1003', weight: 0.5, positive: false },
      { paperId: 'ARXIV:1004', weight: 0.5, positive: false },
      { paperId: 'ARXIV:1005', weight: 0.3, positive: true },
      { paperId: 'ARXIV:1006', weight: 1, positive: true },
      { paperId: 'ARXIV:1008', weight: 0.5, positive: true },
    ])
  })

  it('撤销或从垃圾桶恢复的卡片不再算数,旧版本恢复时留下的离开原因和反馈也不算;折叠和还在推送里的卡片不是信号', () => {
    const store = storeOf([core], {
      cards: [
        card('1001', { gone: false }),
        card('1002', { gone: false, left: 'dismissed' }),
        card('1003', { gone: false, left: 'known', feedback: 'known' }),
        card('1004', { gone: false, feedback: 'less' }),
        card('1005', { left: 'folded' }),
        card('1006', {}),
      ],
      ratings: {},
    })
    expect(trainingExamples(scope, store)).toEqual([{ paperId: 'ARXIV:0001', weight: 1, positive: true }])
  })

  it('卡片记在理由里写着的方向下,没写或写的方向不在了就记在核心方向下', () => {
    const named = (label: string) => [{ kind: 'project', label: '来自项目「P」' }, { kind: 'intent', label }]
    const store = storeOf([core, other], {
      cards: [
        card('1001', { left: 'later', reasons: named('匹配轮换方向「Speculative decoding」') }),
        card('1002', { left: 'later', reasons: named('方向「Speculative decoding」') }),
        card('1003', { left: 'later', reasons: named('匹配轮换方向「Gone direction」') }),
        card('1004', { left: 'later' }),
      ],
      ratings: {},
    })
    expect(trainingExamples({ ...scope, directionId: 'd-other' }, store).map((example) => example.paperId))
      .toEqual(['ARXIV:0002', 'ARXIV:1001', 'ARXIV:1002'])
    expect(trainingExamples(scope, store).map((example) => example.paperId))
      .toEqual(['ARXIV:0001', 'ARXIV:1003', 'ARXIV:1004'])
    expect(trainingExamples({ ...scope, directionId: 'd-missing' }, store)).toEqual([])
  })

  it('同一篇论文既是种子又是卡片,或卡片用别的编号指着种子,只算一个例子,取最强的那一条', () => {
    const store = storeOf([core], {
      cards: [
        card('0001', { left: 'later' }),
        { paperIds: ['ARXIV:2001', 'semantic-2001'], gone: true, downloaded: false, left: 'known', reasons: [] },
      ],
      ratings: {},
    })
    const seeded = direction('d-core', 'KV cache', true, ['ARXIV:0001', 'semantic-2001'])
    expect(trainingExamples(scope, { ...store, discoveryIntents: () => [seeded] })).toEqual([
      { paperId: 'ARXIV:0001', weight: 1, positive: true },
      { paperId: 'semantic-2001', weight: 1, positive: true },
    ])
  })

  it('关注没有种子,只从它的卡片学', () => {
    const store = storeOf([core], {
      cards: [card('1001', { left: 'library', rating: 5 }), card('1002', { left: 'dismissed' })],
      ratings: {},
    })
    expect(trainingExamples({ kind: 'watch', watchId: 'w' }, store)).toEqual([
      { paperId: 'ARXIV:1001', weight: 1.5, positive: true },
      { paperId: 'ARXIV:1002', weight: 0.3, positive: false },
    ])
  })
})

/** Test vault the store opens. */
const VAULT = resolve(import.meta.dirname, '../fixtures/vault')

describe('trainingExamples 读库里真实的动作和评分', () => {
  let vault: string
  let store: VaultStore

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-examples-'))
    cpSync(VAULT, vault, { recursive: true })
    vi.stubEnv('MERIDIAN_LIBRARY_ROOT', vault)
    store = createVaultStore(vault)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(vault, { recursive: true, force: true })
  })

  /** A provider result project discovery brings in. */
  const discovered = (arxiv: string) => ({
    id: arxiv, semanticId: `semantic-${arxiv}`, title: `Found ${arxiv}`, authors: ['Ada'], abstract: 'A',
    submitted: '2026-09-08', journalRef: null, pdf: `https://arxiv.org/pdf/${arxiv}`,
  })

  /** A project in `s` seeded from one library paper given arXiv id 2501.00001, rated `rating`, and its core direction. */
  const seededProject = async (s: VaultStore, rating: number) => {
    const paper = s.listPapers({ page: 1, size: 1 }).rows[0]!.id
    s.updatePaper(paper, { identifier: 'arXiv:2501.00001', rating })
    const project = s.createProject('学习信号')
    await s.addPaper(project, paper)
    for (const found of s.scanDiscoveryDirections(project)) {
      s.setDiscoveryDirection({ projectId: project, directionId: found.id, action: 'add' })
    }
    const core = s.discoveryIntents(project).find((intent) => intent.core)!
    return { project, scope: { kind: 'direction', projectId: project, directionId: core.id } as const }
  }

  for (const [name, make] of [['真实实现', () => store], ['fixture', () => createFixtureStore()]] as const) {
    it(`${name}:忽略、稍后阅读、已经了解、入库和入库后的评分都进项目核心方向的例子;恢复的卡片和还在推送里的卡片不算`, async () => {
      const s = make()
      const { project, scope } = await seededProject(s, 5)
      const arxivs = ['2609.40001', '2609.40002', '2609.40003', '2609.40004', '2609.40005', '2609.40006', '2609.40007']
      expect(s.addDiscoveryEntries(project, arxivs.map(discovered), undefined, fixedRanking())).toBe(7)
      const idOf = (arxiv: string) => s.listInbox({ kind: 'discovery', project }).find((entry) => entry.title === `Found ${arxiv}`)!.id
      s.dismissInbox(idOf('2609.40001'))
      s.readLater(idOf('2609.40002'))
      s.feedbackDiscovery(idOf('2609.40003'), 'known')
      const disliked = s.completeInboxDownload(idOf('2609.40004'), minimalPdf({ lines: ['Found 2609.40004'] })).paper
      s.updatePaper(disliked, { rating: 2 })
      s.completeInboxDownload(idOf('2609.40005'), minimalPdf({ lines: ['Found 2609.40005'] }))
      s.dismissInbox(idOf('2609.40006'))
      s.restoreTrash(s.listTrash().find((item) => item.title === 'Found 2609.40006')!.id)

      expect(sorted(trainingExamples(scope, s))).toEqual([
        { paperId: 'ARXIV:2501.00001', weight: 1.5, positive: true },
        { paperId: 'semantic-2609.40001', weight: 0.3, positive: false },
        { paperId: 'semantic-2609.40002', weight: 0.5, positive: true },
        { paperId: 'semantic-2609.40003', weight: 0.3, positive: true },
        { paperId: 'semantic-2609.40004', weight: 0.5, positive: false },
        { paperId: 'semantic-2609.40005', weight: 1, positive: true },
      ])
    })

    it(`${name}:关注的例子来自它自己的卡片,别的关注的卡片不算`, () => {
      const s = make()
      s.createWatch({ type: 'topic', name: 'learned' })
      s.createWatch({ type: 'topic', name: 'elsewhere' })
      const watchOf = (watchName: string) => s.listWatches().find((watch) => watch.name === watchName)!.id
      s.addInboxEntries(watchOf('learned'), [discovered('2609.41001'), discovered('2609.41002')])
      s.addInboxEntries(watchOf('elsewhere'), [discovered('2609.41003')])
      const idOf = (arxiv: string) => s.listInbox().find((entry) => entry.title === `Found ${arxiv}`)!.id
      s.dismissInbox(idOf('2609.41001'))
      s.readLater(idOf('2609.41002'))
      s.readLater(idOf('2609.41003'))
      expect(sorted(trainingExamples({ kind: 'watch', watchId: watchOf('learned') }, s))).toEqual([
        { paperId: 'ARXIV:2609.41001', weight: 0.3, positive: false },
        { paperId: 'ARXIV:2609.41002', weight: 0.5, positive: true },
      ])
    })
  }

  it('真实实现:旧版本存下的更多类似和减少类似照样读成正例和负例,没记离开原因的已下载卡片算入库,旧版本恢复时留下的离开原因不算', async () => {
    const { project, scope } = await seededProject(store, 3)
    const record = (arxiv: string, fields: Record<string, unknown>) => ({
      id: `inbox-${arxiv}`, kind: 'discovery', watch: '', project, source: '项目 · 学习信号', title: `Found ${arxiv}`,
      authors: 'Ada', venue: `arXiv:${arxiv}`, abstract: 'A', rec: '',
      reasons: [{ kind: 'project', label: '来自项目「学习信号」' }, { kind: 'intent', label: '匹配核心方向「x」' }],
      downloaded: false, paper: '', pdf: `https://arxiv.org/pdf/${arxiv}`, topic: '', gone: false,
      arxiv, semanticId: `semantic-${arxiv}`, meta: { authors: ['Ada'], submitted: '2026-09-08', journalRef: null },
      ...fields,
    })
    writeFileSync(join(vault, '.meridian', 'inbox.json'), JSON.stringify([
      record('2609.42001', { feedback: 'more' }),
      record('2609.42002', { feedback: 'more', gone: true, left: 'folded' }),
      record('2609.42003', { feedback: 'less', gone: true }),
      record('2609.42004', { feedback: 'less', gone: true, left: 'less' }),
      record('2609.42005', { left: 'dismissed' }),
      record('2609.42006', { gone: true, downloaded: true, paper: 'sources/papers/gone-source' }),
    ]), 'utf8')
    const reported = vi.spyOn(console, 'error')
    const reopened = createVaultStore(vault)
    expect(reported).not.toHaveBeenCalled()
    expect(sorted(trainingExamples(scope, reopened))).toEqual([
      { paperId: 'ARXIV:2501.00001', weight: 1, positive: true },
      { paperId: 'semantic-2609.42001', weight: 0.5, positive: true },
      { paperId: 'semantic-2609.42002', weight: 0.5, positive: true },
      { paperId: 'semantic-2609.42003', weight: 0.5, positive: false },
      { paperId: 'semantic-2609.42004', weight: 0.5, positive: false },
      { paperId: 'semantic-2609.42006', weight: 1, positive: true },
    ])
  })
})
