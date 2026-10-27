import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { createFixtureStore } from '../fixture-store.js'
import { minimalPdf } from '../net/minimal-pdf.js'
import type { Embeddings } from './embeddings.js'
import { FEED_GATE, GATE_PAPER_IDS, gateId } from './fixtures/feed-gate.js'
import { FROZEN_SPECTER2, stubVectors } from './fixtures/feed-gate-vectors.js'
import { ON_POLICY_DISTILLATION_SAMPLE } from './fixtures/on-policy-distillation.js'
import { ndcgAt, rankingGap } from './measures.js'
import { createScorer, type ScoreGap, type ScoreGroup } from './scorer.js'
import { SCORE_THRESHOLD } from './selection.js'
import { createRecommendationService } from './service.js'
import type { DiscoveryPaper } from './types.js'

/**
 * The offline gate's thresholds. The fixture holds 15 candidates: 7 the user added, 4 more on the
 * project's subjects that the user left, and 4 off-topic ones. A ranking that knows only which
 * candidates are on a project subject puts the 11 in random order above the other 4; on average that
 * reaches a precision@5 of 7/11 = 0.64 and an nDCG@10 of 0.79 (`topicOnly` below). Each path must at
 * least match that ranking: 3 of its top 5 added, and an nDCG@10 of 0.8. When the path switches, at
 * most 2 of the top 10 cards may change, so the fallback's top 10 must hold 8 of the API's, where a
 * random top 10 of 15 holds 6.7; its nDCG@10 against the API ranking must reach 0.8, past the middle
 * between a random order's 0.55 (`randomOrder` below) and 1; and Spearman's ρ over every candidate,
 * 0 for unrelated scores, must reach 0.5.
 */
const GATE = { precisionAt5: 0.6, ndcgAt10: 0.8, gapOverlap: 0.8, gapNdcg: 0.8, gapSpearman: 0.5 }

const vectors = FROZEN_SPECTER2?.vectors ?? stubVectors()
const everyPaper = [...FEED_GATE.seeds, ...FEED_GATE.candidates, ...FEED_GATE.background]
const papers = new Map(everyPaper.map((paper) => [gateId(paper.arxiv), { paperId: gateId(paper.arxiv), ...paper }]))
const background = FEED_GATE.background.map((paper) => ({ paperId: gateId(paper.arxiv), owner: paper.owner, positive: false }))
const added = new Set(FEED_GATE.added.map(gateId))

/** The project's group: each direction a scope fitted on its seeds, with the candidates `retrievedFor` gives it. */
const groupOf = (retrievedFor: (direction: string) => string[]): ScoreGroup => ({
  id: 'project:gate',
  scopes: FEED_GATE.directions.map((direction) => ({
    key: `direction:gate:${direction.id}`,
    examples: direction.seeds.map((arxiv) => ({ paperId: gateId(arxiv), weight: 1, positive: true })),
    prior: direction.seeds.map(gateId),
    retrieved: retrievedFor(direction.id).map(gateId),
  })),
  items: FEED_GATE.candidates.map((paper) => gateId(paper.arxiv)),
})
const retrievedBy = (direction: string) => FEED_GATE.candidates.filter((paper) => paper.retrievedBy === direction).map((paper) => paper.arxiv)

/** Embeddings that answer every gate paper from `vectors`, as a run on the API with a key. */
const keyed: Embeddings = {
  startRun: () => ({ path: 'api' }),
  vectorsFor: async (asked) => ({
    model: FROZEN_SPECTER2?.model ?? 'specter_v2', vectors: new Map(asked.map((paperId) => [paperId, vectors[paperId]!])),
    missing: [], path: 'api',
  }),
}
/** Embeddings with no key saved. */
const keyless: Embeddings = {
  startRun: () => ({ path: 'api' }),
  vectorsFor: async (asked) => ({ model: null, vectors: new Map(), missing: [...asked], path: 'unavailable' }),
}

const dir = mkdtempSync(join(tmpdir(), 'meridian-gate-'))
afterAll(() => { rmSync(dir, { recursive: true, force: true }) })
let runs = 0

/** One scorer run on `embeddings` over `group`: each candidate's score and path, and the gaps it reported. */
const scored = async (embeddings: Embeddings, group: ScoreGroup) => {
  const gaps: ScoreGap[] = []
  runs += 1
  const run = await createScorer({ embeddings, calibrationFile: join(dir, `${runs}.json`), onGap: (held) => { gaps.push(...held) } })
    .score({ groups: [group], papers, background })
  const scores = new Map(group.items.map((paperId) => [paperId, run.scoreOf(group.id, paperId)!]))
  const ranked = [...group.items].sort((left, right) => scores.get(right)!.score - scores.get(left)!.score)
  return { scores, ranked, gaps }
}

const precisionAt = (ranked: readonly string[], k: number) => ranked.slice(0, k).filter((paperId) => added.has(paperId)).length / k
const labels = new Map([...added].map((paperId) => [paperId, 1]))

/** Mean precision@5 and nDCG@10 of `trials` random orders of the on-topic candidates above the off-topic ones. */
const topicOnly = (trials: number) => {
  let seed = 1
  const next = () => { seed = (seed * 16_807) % 2_147_483_647; return seed / 2_147_483_647 }
  const offTopic = new Set([...FEED_GATE.offTopic, ...FEED_GATE.lexicalTwins].map(gateId))
  const onTopic = FEED_GATE.candidates.map((paper) => gateId(paper.arxiv)).filter((paperId) => !offTopic.has(paperId))
  let precision = 0
  let ndcg = 0
  for (let trial = 0; trial < trials; trial += 1) {
    const order = onTopic.map((paperId) => ({ paperId, key: next() })).sort((left, right) => left.key - right.key).map((held) => held.paperId)
    precision += precisionAt(order, 5)
    ndcg += ndcgAt(order, labels, 10)
  }
  return { precision: precision / trials, ndcg: ndcg / trials }
}

/** The mean nDCG@10 of `trials` random orders of `gap`'s papers under its API scores. */
const randomOrder = (gap: ScoreGap, trials: number) => {
  let seed = 7
  const next = () => { seed = (seed * 16_807) % 2_147_483_647; return seed / 2_147_483_647 }
  const gains = new Map([...gap.pairs].sort((left, right) => right.api - left.api).slice(0, 10).map((pair, at) => [pair.paperId, 10 - at]))
  let total = 0
  for (let trial = 0; trial < trials; trial += 1) {
    total += ndcgAt(gap.pairs.map((pair) => ({ paperId: pair.paperId, key: next() })).sort((left, right) => left.key - right.key)
      .map((held) => held.paperId), gains, 10)
  }
  return total / trials
}

describe('offline gate of the feed', () => {
  it('冻结的真实向量一旦填上,就得覆盖门槛里的每一篇论文', () => {
    if (FROZEN_SPECTER2 !== null) expect(GATE_PAPER_IDS.filter((paperId) => vectors[paperId] === undefined)).toEqual([])
    expect(Object.keys(vectors).sort()).toEqual([...GATE_PAPER_IDS].sort())
  })

  it('门槛本身:只知道主题的随机排序平均 precision@5 约 0.64、nDCG@10 约 0.79,随机顺序对 API 排序的 nDCG@10 约 0.55', async () => {
    const baseline = topicOnly(4_000)
    expect(baseline.precision).toBeCloseTo(7 / 11, 1)
    expect(baseline.ndcg).toBeCloseTo(0.79, 1)
    const { gaps } = await scored(keyed, groupOf(retrievedBy))
    for (const gap of gaps) expect(randomOrder(gap, 4_000)).toBeCloseTo(0.55, 1)
  })

  it('两条路径都把用户后来入库的论文排在前面:precision@5 和 nDCG@10 不低于只知道主题的排序', async () => {
    for (const embeddings of [keyed, keyless]) {
      const { ranked, scores } = await scored(embeddings, groupOf(retrievedBy))
      const path = scores.get(ranked[0]!)!.path
      expect(precisionAt(ranked, 5), `${path} precision@5`).toBeGreaterThanOrEqual(GATE.precisionAt5)
      expect(ndcgAt(ranked, labels, 10), `${path} nDCG@10`).toBeGreaterThanOrEqual(GATE.ndcgAt10)
    }
  })

  it('回退和 API 给同一批候选的排序差距在门槛内:每个方向的 overlap@10、nDCG@10 和 Spearman', async () => {
    const { gaps } = await scored(keyed, groupOf(retrievedBy))
    expect(gaps.map((gap) => gap.scope)).toEqual(FEED_GATE.directions.map((direction) => `direction:gate:${direction.id}`))
    for (const gap of gaps.map(rankingGap)) {
      expect(gap.papers).toBe(FEED_GATE.candidates.length)
      expect(gap.overlap, `${gap.scope} overlap@10`).toBeGreaterThanOrEqual(GATE.gapOverlap)
      expect(gap.ndcg, `${gap.scope} nDCG@10`).toBeGreaterThanOrEqual(GATE.gapNdcg)
      expect(gap.spearman, `${gap.scope} Spearman`).toBeGreaterThanOrEqual(GATE.gapSpearman)
    }
  })

  it('召回里离题的论文两条路径都低于 0.5,哪怕一个方向这一轮召回的大多离题', async () => {
    const mostlyOffTopic = (direction: string) => (direction === FEED_GATE.noisyRetrieval.direction
      ? FEED_GATE.noisyRetrieval.retrieved
      : retrievedBy(direction).filter((arxiv) => !FEED_GATE.offTopic.includes(arxiv) && !FEED_GATE.lexicalTwins.includes(arxiv)))
    for (const retrieved of [retrievedBy, mostlyOffTopic]) {
      for (const embeddings of [keyed, keyless]) {
        const { scores } = await scored(embeddings, groupOf(retrieved))
        const checked = embeddings === keyed ? [...FEED_GATE.offTopic, ...FEED_GATE.lexicalTwins] : FEED_GATE.offTopic
        expect(checked.map((arxiv) => [arxiv, scores.get(gateId(arxiv))!.path, scores.get(gateId(arxiv))!.score < SCORE_THRESHOLD]))
          .toEqual(checked.map((arxiv) => [arxiv, embeddings === keyed ? 'api' : 'fallback', true]))
        expect(FEED_GATE.added.map((arxiv) => [arxiv, scores.get(gateId(arxiv))!.score >= SCORE_THRESHOLD]))
          .toEqual(FEED_GATE.added.map((arxiv) => [arxiv, true]))
      }
    }
  })

  it('没有 key 时 Osprey 照样送进项目的发现,召回里离题的不送', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const store = createFixtureStore(() => '2026-09-17')
    const project = store.createProject('OPD 与 speculative drafter')
    for (const seed of ON_POLICY_DISTILLATION_SAMPLE.seeds) {
      const imported = store.importPaper(`${seed.arxiv}.pdf`, minimalPdf({ lines: [seed.arxiv, seed.title] })).paper
      store.fillPaperMetadata(imported.id, {
        title: seed.title, authors: seed.authors, abstract: seed.abstract, identifier: `arXiv:${seed.arxiv}`,
      }, imported.title)
      await store.addPaper(project, imported.id)
    }
    for (const found of store.scanDiscoveryDirections(project)) {
      store.setDiscoveryDirection({ projectId: project, directionId: found.id, action: 'add' })
    }
    const asDiscovered = (paper: (typeof FEED_GATE.candidates)[number]): DiscoveryPaper => ({
      semanticId: gateId(paper.arxiv), id: paper.arxiv, title: paper.title, authors: ['Ada'], abstract: paper.abstract,
      submitted: '2026-09-01', journalRef: null, pdf: `https://arxiv.org/pdf/${paper.arxiv}`,
    })
    const service = createRecommendationService({
      scorer: createScorer({ embeddings: keyless, calibrationFile: join(dir, 'keyless.json') }), store, onWrite: () => {}, now: () => 1,
      provider: {
        recommend: async (positive) => FEED_GATE.candidates.filter((paper) => paper.retrievedBy === (
          FEED_GATE.directions.find((direction) => direction.seeds.some((arxiv) => positive.some((seed) => seed.paperId === gateId(arxiv))))!.id
        )).map(asDiscovered),
      },
    })
    await service.discover(project)
    const delivered = store.listInbox({ kind: 'discovery', project }).map((card) => card.title)
    const titleOf = (arxiv: string) => FEED_GATE.candidates.find((paper) => paper.arxiv === arxiv)!.title
    expect(delivered).toContain(ON_POLICY_DISTILLATION_SAMPLE.expected.title)
    expect(delivered.filter((title) => FEED_GATE.offTopic.map(titleOf).includes(title))).toEqual([])
    vi.restoreAllMocks()
  })
})
