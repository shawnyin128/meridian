import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EmbeddingLookup, Embeddings } from './embeddings.js'
import { createScorer, type ScoredText, type ScoreGap, type ScoreGroup } from './scorer.js'

/** A deterministic generator of numbers in [0, 1). */
const generator = (seed: number) => () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
  return seed / 2_147_483_648
}

const TOPICS = {
  rotation: ['quantization', 'rotation', 'outlier', 'bit', 'kernel', 'weights', 'activation', 'hadamard'],
  protein: ['protein', 'folding', 'structure', 'residue', 'diffusion', 'sequence', 'binding', 'molecule'],
  drafter: ['speculative', 'draft', 'decoding', 'verification', 'acceptance', 'tree', 'drafter', 'token'],
} as const
const COMMON = ['model', 'method', 'results', 'efficient', 'large', 'study', 'approach', 'data']
type Topic = keyof typeof TOPICS
const DIMENSIONS = 24

const random = generator(7)
const centre: Record<Topic, number[]> = {
  rotation: Array.from({ length: DIMENSIONS }, () => random() - 0.5),
  protein: Array.from({ length: DIMENSIONS }, () => random() - 0.5),
  drafter: Array.from({ length: DIMENSIONS }, () => random() - 0.5),
}

/**
 * A corpus paper on `topic`: its text mostly that topic's words, and an embedding near the topic's
 * centre with a large offset all papers share, as SPECTER2 vectors have.
 */
const corpusPaper = (topic: Topic, at: number): { text: ScoredText; vector: number[] } => {
  const pick = generator(at * 31 + topic.length)
  const words = (count: number) => Array.from({ length: count }, () => (
    pick() < 0.75 ? TOPICS[topic][Math.floor(pick() * 8)]! : COMMON[Math.floor(pick() * 8)]!
  )).join(' ')
  return {
    text: { paperId: `${topic}-${at}`, title: words(6), abstract: words(30) },
    vector: centre[topic].map((value) => value + (pick() - 0.5) * 0.5 + 1.2),
  }
}

const corpus = [
  ...Array.from({ length: 14 }, (_, at) => corpusPaper('rotation', at)),
  ...Array.from({ length: 14 }, (_, at) => corpusPaper('protein', at)),
  ...Array.from({ length: 14 }, (_, at) => corpusPaper('drafter', at)),
]
const papers = new Map(corpus.map(({ text }) => [text.paperId, text]))
const vectors = new Map(corpus.map(({ text, vector }) => [text.paperId, vector]))
const ids = (topic: Topic, from: number, to: number) => Array.from({ length: to - from }, (_, at) => `${topic}-${from + at}`)

const seeds = ids('rotation', 0, 3)
const group: ScoreGroup = {
  id: 'project:p',
  scopes: [{
    key: 'direction:p:rotation',
    examples: seeds.map((paperId) => ({ paperId, weight: 1, positive: true })),
    prior: seeds,
    retrieved: [],
  }],
  items: [...ids('rotation', 3, 11), ...ids('protein', 0, 8)],
}
const background = [
  ...ids('protein', 8, 14).map((paperId) => ({ paperId, owner: 'project:q' })),
  ...ids('drafter', 0, 14).map((paperId) => ({ paperId, owner: 'watch:w' })),
]

/** Embeddings that answer from `vectors` for the ids `has` keeps, on `path`. */
const embeddingsFrom = (path: EmbeddingLookup['path'], has: (paperId: string) => boolean = () => true): Embeddings => ({
  startRun: () => ({ path: 'api' }),
  vectorsFor: async (asked, run) => {
    const answered = path === 'unavailable' ? [] : asked.filter(has)
    if (path === 'fallback') run.path = 'fallback'
    return {
      model: answered.length === 0 ? null : 'specter_v2',
      vectors: new Map(answered.map((paperId) => [paperId, vectors.get(paperId)!])),
      missing: asked.filter((paperId) => !answered.includes(paperId)),
      path: run.path === 'fallback' ? 'fallback' : path,
    }
  },
})

const dirs: string[] = []
const calibrationFile = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'meridian-calibration-'))
  dirs.push(dir)
  return join(dir, 'recommendation', 'calibration.json')
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

const scoresOf = async (embeddings: Embeddings, file: string, onGap?: (gaps: ScoreGap[]) => void) => {
  const scorer = createScorer({ embeddings, calibrationFile: file, ...(onGap === undefined ? {} : { onGap }) })
  const run = await scorer.score({ groups: [group], papers, background })
  return new Map(group.items.map((paperId) => [paperId, run.scoreOf(group.id, paperId)!]))
}
const meanGap = (left: Map<string, { score: number }>, right: Map<string, { score: number }>) => (
  [...left.keys()].reduce((sum, paperId) => sum + Math.abs(left.get(paperId)!.score - right.get(paperId)!.score), 0) / left.size
)

describe('paper scorer', () => {
  it('API 与回退两条路径把同一批候选校准到同一把尺子上:同一侧过线,分数相差不大', async () => {
    const api = await scoresOf(embeddingsFrom('api'), calibrationFile())
    const fallback = await scoresOf(embeddingsFrom('unavailable'), calibrationFile())
    for (const [paperId, score] of api) {
      expect(score.path).toBe('api')
      expect(fallback.get(paperId)!.path).toBe('fallback')
      const relevant = paperId.startsWith('rotation')
      expect([paperId, score.score >= 0.5, fallback.get(paperId)!.score >= 0.5]).toEqual([paperId, relevant, relevant])
      expect(score.score).toBeGreaterThanOrEqual(0)
      expect(score.score).toBeLessThanOrEqual(1)
    }
    expect(meanGap(api, fallback)).toBeLessThan(0.25)
  })

  it('跑 API 时拟合回退到 API 的单调映射并存进缓存,之后只有回退时按它校准,离 API 的分数更近', async () => {
    const file = calibrationFile()
    const raw = await scoresOf(embeddingsFrom('unavailable'), calibrationFile())
    const api = await scoresOf(embeddingsFrom('api'), file)
    const maps = (JSON.parse(readFileSync(file, 'utf8')) as { maps: Record<string, [number, number][]> }).maps
    expect(Object.keys(maps)).toEqual(['direction:p:rotation'])
    const mapped = await scoresOf(embeddingsFrom('unavailable'), file)
    expect(meanGap(api, mapped)).toBeLessThan(meanGap(api, raw))
    expect(meanGap(api, mapped)).toBeLessThan(0.1)
  })

  it('只有 API 那一轮把两条路径的分数交给差距记录,回退的一轮不交也不改映射', async () => {
    const onGap = vi.fn<(gaps: ScoreGap[]) => void>()
    const file = calibrationFile()
    await scoresOf(embeddingsFrom('api'), file, onGap)
    expect(onGap).toHaveBeenCalledOnce()
    const [gaps] = onGap.mock.calls[0]!
    expect(gaps.map((gap) => [gap.scope, gap.pairs.length])).toEqual([['direction:p:rotation', group.items.length]])
    const before = readFileSync(file, 'utf8')
    await scoresOf(embeddingsFrom('unavailable'), file, onGap)
    expect(onGap).toHaveBeenCalledOnce()
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('一轮中途被限流:有向量的照样走 API,没向量的走回退,不改映射也不记差距', async () => {
    const onGap = vi.fn()
    const file = calibrationFile()
    const scores = await scoresOf(embeddingsFrom('fallback', (paperId) => !paperId.endsWith('-4')), file, onGap)
    expect(scores.get('rotation-4')!.path).toBe('fallback')
    expect(scores.get('rotation-5')!.path).toBe('api')
    expect(onGap).not.toHaveBeenCalled()
    expect(existsSync(file)).toBe(false)
  })

  it('随机反例只从别的范围的论文里按范围抽,同样的输入抽出同样的反例,背景只读缓存', async () => {
    const calls: { asked: string[]; path: string }[] = []
    const embeddings = embeddingsFrom('api')
    const recording: Embeddings = {
      startRun: embeddings.startRun,
      vectorsFor: async (asked, run) => {
        calls.push({ asked: [...asked], path: run.path })
        return embeddings.vectorsFor(asked, run)
      },
    }
    await scoresOf(recording, calibrationFile())
    await scoresOf(recording, calibrationFile())
    const [fetched, cached] = [calls[0]!, calls[1]!]
    expect(fetched.path).toBe('api')
    expect(new Set(fetched.asked)).toEqual(new Set([...group.items, ...seeds]))
    expect(cached.path).toBe('fallback')
    // Three seeds ask for thirty negatives; the background holds twenty, so every one of them is drawn.
    expect(new Set(cached.asked)).toEqual(new Set(background.map((held) => held.paperId)))
    expect(calls[3]!.asked).toEqual(cached.asked)

    // One seed asks for ten of the twenty, the same ten on every run.
    const one: ScoreGroup = { ...group, scopes: [{ ...group.scopes[0]!, examples: [group.scopes[0]!.examples[0]!], prior: [seeds[0]!] }] }
    calls.length = 0
    for (let run = 0; run < 2; run += 1) {
      await createScorer({ embeddings: recording, calibrationFile: calibrationFile() }).score({ groups: [one], papers, background })
    }
    expect(calls[1]!.asked).toHaveLength(10)
    expect(calls[1]!.asked.every((paperId) => background.some((held) => held.paperId === paperId))).toBe(true)
    expect(calls[3]!.asked).toEqual(calls[1]!.asked)
  })

  it('一篇种子的方向用这次召回的论文作锚点:召回的里面贴近种子的过线,离题的不过', async () => {
    const lone: ScoreGroup = {
      id: 'project:lone',
      scopes: [{
        key: 'direction:lone:rotation', examples: [{ paperId: 'rotation-0', weight: 1, positive: true }], prior: ['rotation-0'],
        retrieved: [...ids('rotation', 3, 7), ...ids('protein', 0, 2)],
      }],
      items: [...ids('rotation', 3, 7), ...ids('protein', 0, 2)],
    }
    for (const embeddings of [embeddingsFrom('api'), embeddingsFrom('unavailable')]) {
      const run = await createScorer({ embeddings, calibrationFile: calibrationFile() }).score({ groups: [lone], papers, background })
      expect(lone.items.map((paperId) => [paperId, run.scoreOf(lone.id, paperId)!.score >= 0.5]))
        .toEqual(lone.items.map((paperId) => [paperId, paperId.startsWith('rotation')]))
    }
  })
})
