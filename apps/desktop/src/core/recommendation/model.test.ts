import { describe, expect, it } from 'vitest'
import {
  calibrated, fitMonotone, fitPlatt, fitScopeModel, mapped, marginOf, scopeAnchors, seededSample, type ModelExample,
} from './model.js'

const unit = (vector: number[]): number[] => {
  const norm = Math.hypot(...vector)
  return vector.map((value) => value / norm)
}
const dot = (left: number[], right: number[]): number => left.reduce((sum, value, at) => sum + value * right[at]!, 0)
const gramOf = (vectors: number[][]): number[][] => vectors.map((left) => vectors.map((right) => dot(left, right)))

/** A deterministic unit vector in `size` dimensions. */
const pseudoRandom = (seed: number, size: number): number[] => unit(Array.from({ length: size }, (_, at) => (
  Math.sin(seed * 12.9898 + at * 78.233) * 43_758.5453 % 1
)))

describe('scope model', () => {
  it('一篇种子的方向按与这篇种子的相似度排序', () => {
    const size = 16
    const seed = pseudoRandom(1, size)
    const negatives = Array.from({ length: 10 }, (_, at) => pseudoRandom(100 + at, size))
    const examples: ModelExample[] = [
      { weight: 1, positive: true, prior: true },
      ...negatives.map(() => ({ weight: 0.1, positive: false, prior: false })),
    ]
    const vectors = [seed, ...negatives]
    const model = fitScopeModel(examples, gramOf(vectors), vectors.map((_, at) => at))!
    // Candidates that blend the seed with noise in falling proportion, so their similarity to the seed falls.
    const candidates = Array.from({ length: 12 }, (_, at) => unit(seed.map((value, index) => (
      value * (12 - at) / 12 + pseudoRandom(200 + at, size)[index]! * at / 12
    ))))
    const margins = candidates.map((candidate) => marginOf(model, vectors.map((vector) => dot(vector, candidate))))
    const bySimilarity = candidates.map((_, at) => at)
      .sort((left, right) => dot(seed, candidates[right]!) - dot(seed, candidates[left]!))
    const byModel = candidates.map((_, at) => at).sort((left, right) => margins[right]! - margins[left]!)
    expect(byModel).toEqual(bySimilarity)
  })

  it('有足够的例子时学到种子质心以外的东西', () => {
    // The prior centroid points along axis 0; the positives lean towards axis 1, the negatives towards axis 2.
    const seed = unit([1, 0, 0])
    const positives = Array.from({ length: 12 }, (_, at) => unit([0.6, 1, (at % 3) * 0.1]))
    const negatives = Array.from({ length: 12 }, (_, at) => unit([0.9, (at % 3) * 0.1, 1]))
    const vectors = [seed, ...positives, ...negatives]
    const examples: ModelExample[] = [
      { weight: 1, positive: true, prior: true },
      ...positives.map(() => ({ weight: 1, positive: true, prior: false })),
      ...negatives.map(() => ({ weight: 1, positive: false, prior: false })),
    ]
    const model = fitScopeModel(examples, gramOf(vectors), vectors.map((_, at) => at))!
    const marginFor = (candidate: number[]) => marginOf(model, vectors.map((vector) => dot(vector, candidate)))
    // Pure similarity to the seed prefers the negative-like paper; the fitted model prefers the positive-like one.
    const positiveLike = unit([0.5, 1, 0])
    const negativeLike = unit([0.8, 0, 1])
    expect(dot(seed, negativeLike)).toBeGreaterThan(dot(seed, positiveLike))
    expect(marginFor(positiveLike)).toBeGreaterThan(marginFor(negativeLike))
  })

  it('没有先验例子时不拟合', () => {
    const examples: ModelExample[] = [{ weight: 1, positive: true, prior: false }]
    expect(fitScopeModel(examples, [[1]], [0])).toBeNull()
  })

  it('锚点用去掉自己后重拟的模型给正例打分,只有一篇先验例子时没有锚点', () => {
    const vectors = [unit([1, 0.1]), unit([1, 0.2]), unit([0, 1])]
    const examples: ModelExample[] = [
      { weight: 1, positive: true, prior: true },
      { weight: 1, positive: true, prior: true },
      { weight: 0.1, positive: false, prior: false },
    ]
    const gram = gramOf(vectors)
    const model = fitScopeModel(examples, gram, [0, 1, 2])!
    const anchors = scopeAnchors(examples, gram, model)
    expect(anchors.map((anchor) => [anchor.positive, anchor.weight])).toEqual([[true, 1], [true, 1], [false, 0.1]])
    // Scored without itself, a seed is less sure than the full model makes it.
    expect(anchors[0]!.margin).toBeLessThan(marginOf(model, gram[0]!))
    const lone = fitScopeModel(examples, gram, [0, 2])!
    expect(scopeAnchors(examples, gram, lone)).toEqual([])
  })
})

describe('Platt calibration', () => {
  it('把边距映射到 [0, 1],正例一侧高于一半,反例一侧低于一半', () => {
    const anchors = [
      ...[4, 5, 6].map((margin) => ({ margin, positive: true, weight: 1 })),
      ...[0, 1, 2].map((margin) => ({ margin, positive: false, weight: 1 })),
    ]
    const platt = fitPlatt(anchors)
    expect(platt.a).toBeGreaterThan(0)
    expect(calibrated(platt, 6)).toBeGreaterThan(0.5)
    expect(calibrated(platt, 0)).toBeLessThan(0.5)
    expect(calibrated(platt, 3)).toBeCloseTo(0.5, 1)
    expect(calibrated(platt, 1e6)).toBeLessThanOrEqual(1)
    expect(calibrated(platt, -1e6)).toBeGreaterThanOrEqual(0)
  })

  it('平移和缩放边距不改变校准后的分数', () => {
    const anchors = [
      ...[4, 5, 6, 3.5].map((margin) => ({ margin, positive: true, weight: 1 })),
      ...[0, 1, 2, 4.2].map((margin) => ({ margin, positive: false, weight: 0.5 })),
    ]
    const scaled = anchors.map((anchor) => ({ ...anchor, margin: anchor.margin * 0.03 + 0.7 }))
    const one = fitPlatt(anchors)
    const other = fitPlatt(scaled)
    for (const margin of [0, 2.5, 3.7, 5]) {
      expect(calibrated(other, margin * 0.03 + 0.7)).toBeCloseTo(calibrated(one, margin), 4)
    }
  })

  it('反向的锚点不会把排序倒过来', () => {
    const platt = fitPlatt([
      { margin: 0, positive: true, weight: 1 }, { margin: 1, positive: false, weight: 1 },
    ])
    expect(platt.a).toBe(0)
    expect(calibrated(platt, 0)).toBeCloseTo(0.5)
  })

  it('缺正例或反例时报错', () => {
    expect(() => fitPlatt([{ margin: 1, positive: true, weight: 1 }])).toThrow()
  })
})

describe('monotone map', () => {
  it('把违反单调的相邻点合并,点之间线性,两端取平', () => {
    const map = fitMonotone([[0.1, 0.2], [0.2, 0.4], [0.3, 0.3], [0.6, 0.8]])
    expect(map).toEqual([[0.1, 0.2], [0.25, expect.closeTo(0.35)], [0.6, 0.8]])
    expect(mapped(map, 0)).toBe(0.2)
    expect(mapped(map, 0.9)).toBe(0.8)
    expect(mapped(map, 0.425)).toBeCloseTo(0.575)
    expect(mapped([], 0.42)).toBe(0.42)
  })
})

describe('seeded sample', () => {
  it('同一个种子和同一批条目,不论顺序都抽出同一批', () => {
    const items = Array.from({ length: 30 }, (_, at) => `p${at}`)
    const one = seededSample(items, 5, 'direction:p:d', (item) => item)
    expect(one).toHaveLength(5)
    expect(new Set(one).size).toBe(5)
    expect(seededSample([...items].reverse(), 5, 'direction:p:d', (item) => item)).toEqual(one)
    expect(seededSample(items, 5, 'direction:p:other', (item) => item)).not.toEqual(one)
    expect(seededSample(items.slice(0, 3), 5, 'x', (item) => item)).toHaveLength(3)
  })
})
