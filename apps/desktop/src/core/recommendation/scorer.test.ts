import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EmbeddingLookup, Embeddings } from './embeddings.js'
import {
  createScorer, FIXED_PRIOR, MIN_RANDOM_NEGATIVES, randomNegatives, type ScoredText, type ScoreGap, type ScoreGroup,
} from './scorer.js'

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
  ...ids('protein', 8, 14).map((paperId) => ({ paperId, owner: 'project:q', positive: false })),
  ...ids('drafter', 0, 14).map((paperId) => ({ paperId, owner: 'watch:w', positive: false })),
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

  it('key 被拒时这一轮全走回退,在 Core 日志里记一条错误', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const refused: Embeddings = {
      startRun: () => ({ path: 'api' }),
      vectorsFor: async (asked, run) => {
        if (run.path === 'api') Object.assign(run, { path: 'fallback', reason: 'auth' })
        return { model: null, vectors: new Map(), missing: [...asked], path: 'fallback', reason: 'auth' }
      },
    }
    const scores = await scoresOf(refused, calibrationFile())
    expect([...scores.values()].every((score) => score.path === 'fallback')).toBe(true)
    expect(scores.get('rotation-3')!.score).toBeGreaterThanOrEqual(0.5)
    expect(logged).toHaveBeenCalledOnce()
    expect(String(logged.mock.calls[0]![0])).toMatch(/refused the saved key/)
    expect(String(logged.mock.calls[0]![0])).toMatch(/^\[feed\] fallback reason=auth: /)
    logged.mockRestore()
  })

  it('一轮不得不改走回退时在 Core 日志里记一条 warn,写明原因;没有 key 的一轮不记', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const reason of ['rate-limit', 'quota', 'timeout', 'network', 'server'] as const) {
      const throttled: Embeddings = {
        startRun: () => ({ path: 'api' }),
        vectorsFor: async (asked, run) => {
          if (run.path === 'api') Object.assign(run, { path: 'fallback', reason })
          return { model: null, vectors: new Map(), missing: [...asked], path: 'fallback', reason }
        },
      }
      await scoresOf(throttled, calibrationFile())
    }
    expect(warned.mock.calls.map(([line]) => String(line))).toEqual(['rate-limit', 'quota', 'timeout', 'network', 'server'].map((reason) => (
      `[feed] fallback reason=${reason}: paper embeddings fell back to TF-IDF for this refresh`
    )))
    await scoresOf(embeddingsFrom('unavailable'), calibrationFile())
    await scoresOf(embeddingsFrom('api'), calibrationFile())
    expect(warned).toHaveBeenCalledTimes(5)
    warned.mockRestore()
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

  it('背景论文只从缓存里读向量,不为它们调 API', async () => {
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
    expect(calls.map((call) => call.path)).toEqual(['api', 'fallback'])
    expect(new Set(calls[0]!.asked)).toEqual(new Set([...group.items, ...seeds]))
    expect(new Set(calls[1]!.asked)).toEqual(new Set(background.map((held) => held.paperId)))
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

describe('random negatives', () => {
  /** Papers on a circle: their similarity is the cosine of the angle between them, in degrees. */
  const angle = (paperId: string): number => Number(paperId.split('@')[1])
  const similarity = (left: string, right: string): number => Math.cos((angle(left) - angle(right)) * Math.PI / 180)
  // Three seeds at 0, 10 and 20 degrees: the weakest, at 0 or 20, sits 10 degrees from their centroid.
  const scope = { key: 'direction:p:d', groupId: 'project:p', seeds: ['s@0', 's@10', 's@20'], taken: new Set(['s@0', 's@10', 's@20']), positiveWeight: 3 }
  const far = Array.from({ length: 40 }, (_, at) => [`far${at}@${90 + at}`, new Set(['watch:far'])] as const)
  const owned = (...extra: (readonly [string, Set<string>])[]) => new Map<string, ReadonlySet<string>>([...far, ...extra])

  it('不抽任何范围的正例,也不抽这个范围和它所在项目自己的论文', () => {
    const drawn = randomNegatives(scope, owned(
      ['seed-of-another@100', new Set(['direction:q:e'])], ['own-card@100', new Set(['project:p'])],
    ), new Set(['seed-of-another@100']), similarity).map((negative) => negative.paperId)
    expect(drawn).toHaveLength(30)
    expect(drawn).not.toContain('seed-of-another@100')
    expect(drawn).not.toContain('own-card@100')
  })

  it('不抽和种子质心的相似度达到最弱那篇种子的论文', () => {
    // Listed under the far watch, whose centroid stays far, so only its own similarity can keep it out.
    const negatives = (paper: string) => randomNegatives({ ...scope, positiveWeight: 10 }, owned([paper, new Set(['watch:far'])]), new Set(), similarity)
    expect(negatives('close@15').map((negative) => negative.paperId)).not.toContain('close@15')
    expect(negatives('beyond@31').map((negative) => negative.paperId)).toContain('beyond@31')
  })

  it('一个范围讲的是同一件事时,它的卡片一张都不抽,哪怕单看有的离得远', () => {
    // The watch's centroid sits within 4 degrees of the seeds'; its stray card, alone, is 15 degrees off.
    const sameSubject = ['on@9', 'on@10', 'on@11', 'stray@25'].map((paperId) => [paperId, new Set(['watch:same'])] as const)
    const drawn = randomNegatives({ ...scope, positiveWeight: 10 }, owned(...sameSubject), new Set(), similarity).map((negative) => negative.paperId)
    expect(drawn).toHaveLength(40)
    expect(drawn.some((paperId) => paperId.startsWith('on@') || paperId === 'stray@60')).toBe(false)
  })

  it('剩下的不够时改用固定先验,权重和它顶替的反例一样;够时按范围抽,每次一样', () => {
    const few = new Map<string, ReadonlySet<string>>(far.slice(0, MIN_RANDOM_NEGATIVES - 1))
    expect(randomNegatives(scope, few, new Set(), similarity)).toEqual([{ paperId: FIXED_PRIOR, weight: expect.closeTo(3), positive: false }])
    const once = randomNegatives(scope, owned(), new Set(), similarity)
    expect(once).toHaveLength(30)
    expect(once.every((negative) => negative.weight === 0.1 && !negative.positive)).toBe(true)
    expect(randomNegatives(scope, new Map([...owned()].reverse()), new Set(), similarity)).toEqual(once)
    expect(randomNegatives({ ...scope, key: 'direction:p:other' }, owned(), new Set(), similarity)).not.toEqual(once)
  })
})
