/** Scale of the prior: the margin a paper gets per unit of cosine similarity to its nearest prior example. */
export const PRIOR_SCALE = 10
/** Strength of the L2 penalty that holds a scope model to its prior. */
export const L2_PENALTY = 1
const FIT_STEPS = 200
/** Gradient steps of a leave-one-out refit, which starts from the full fit. */
const REFIT_STEPS = 50
/** Most positives one scope scores leave-one-out as anchors, so a scope with many examples stays fast. */
export const ANCHOR_LIMIT = 20

/** One example of a scope model, by its row in the Gram matrix. `prior` marks the papers the prior measures against. */
export type ModelExample = { weight: number; positive: boolean; prior: boolean }

/**
 * A fitted scope model: the margin of a paper is PRIOR_SCALE times its cosine similarity to the
 * nearest prior example, plus the learned `beta` weights of its dot products with the examples.
 * `bias` is the fitted intercept, which a margin leaves out.
 */
export type ScopeModel = { rows: number[]; beta: number[]; bias: number; prior: number[] }

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value))

/** The margin under `model` of a paper whose dot products with every example row are `dots`. */
export function marginOf(model: ScopeModel, dots: readonly number[]): number {
  let learned = 0
  model.rows.forEach((row, at) => { learned += model.beta[at]! * dots[row]! })
  return PRIOR_SCALE * Math.max(...model.prior.map((row) => dots[row]!)) + learned
}

/**
 * Fits a weighted, L2-regularised logistic regression on the examples whose rows `rows` lists, the
 * vectors given as their Gram matrix `gram` of unit vectors, on top of the prior margin, the
 * similarity to the nearest prior example among `rows`; the penalty holds the learned weights near
 * zero, so with few examples the model ranks by nearest-seed similarity. Starts from `from` when given.
 * Returns null when `rows` holds no prior example.
 */
export function fitScopeModel(
  examples: readonly ModelExample[], gram: readonly (readonly number[])[], rows: readonly number[],
  from?: { beta: number[]; bias: number },
): ScopeModel | null {
  const prior = rows.filter((row) => examples[row]!.prior)
  if (prior.length === 0) return null
  const priorMargin = rows.map((row) => PRIOR_SCALE * Math.max(...prior.map((held) => gram[held]![row]!)))
  const total = rows.reduce((sum, row) => sum + examples[row]!.weight, 0)
  // Unit vectors bound the curvature of the weighted log loss by total / 2, so this step never overshoots.
  const step = 1 / (total / 2 + L2_PENALTY)
  const beta = from === undefined ? rows.map(() => 0) : [...from.beta]
  let bias = from?.bias ?? 0
  for (let iteration = 0; iteration < (from === undefined ? FIT_STEPS : REFIT_STEPS); iteration += 1) {
    const gradient = rows.map((row, at) => {
      let margin = priorMargin[at]! + bias
      rows.forEach((held, index) => { margin += beta[index]! * gram[held]![row]! })
      const example = examples[row]!
      return example.weight * (sigmoid(margin) - (example.positive ? 1 : 0))
    })
    gradient.forEach((value, at) => { beta[at] = beta[at]! - step * (value + L2_PENALTY * beta[at]!) })
    bias -= step * gradient.reduce((sum, value) => sum + value, 0)
  }
  return { rows: [...rows], beta, bias, prior }
}

/** A calibration point: the margin of an example scored without it, its label and its weight. */
export type Anchor = { margin: number; positive: boolean; weight: number }

/**
 * The anchors of one scope model fitted on every row of `gram`: each of the first ANCHOR_LIMIT positive
 * examples scored by the model refitted without it, when what is left still holds a prior example, and
 * each negative example scored by `model` itself. Returns none when no positive can be scored that way.
 */
export function scopeAnchors(
  examples: readonly ModelExample[], gram: readonly (readonly number[])[], model: ScopeModel,
): Anchor[] {
  const positives: Anchor[] = []
  for (const row of model.rows.filter((held) => examples[held]!.positive).slice(0, ANCHOR_LIMIT)) {
    const at = model.rows.indexOf(row)
    const rest = model.rows.filter((held) => held !== row)
    const refit = fitScopeModel(examples, gram, rest, {
      beta: model.beta.filter((_, index) => index !== at), bias: model.bias,
    })
    if (refit !== null) positives.push({ margin: marginOf(refit, gram[row]!), positive: true, weight: examples[row]!.weight })
  }
  if (positives.length === 0) return []
  return [...positives, ...model.rows.flatMap((row) => (examples[row]!.positive ? [] : [{
    margin: marginOf(model, gram[row]!), positive: false, weight: examples[row]!.weight,
  }]))]
}

/** A Platt map: the probability σ(a·margin + b). */
export type Platt = { a: number; b: number }

/** The probability `platt` gives `margin`, in [0, 1]. */
export const calibrated = (platt: Platt, margin: number): number => sigmoid(platt.a * margin + platt.b)

/**
 * Fits a Platt map to `anchors` by Newton's method on the weighted log loss against Platt's smoothed
 * targets. A map that would rank margins in reverse is flattened to the anchors' weighted base rate.
 * Throws when `anchors` lacks a positive or a negative.
 */
export function fitPlatt(anchors: readonly Anchor[]): Platt {
  const positive = anchors.reduce((sum, anchor) => sum + (anchor.positive ? anchor.weight : 0), 0)
  const negative = anchors.reduce((sum, anchor) => sum + (anchor.positive ? 0 : anchor.weight), 0)
  if (positive === 0 || negative === 0) throw new Error('Platt 校准需要正例和反例')
  const high = (positive + 1) / (positive + 2)
  const low = 1 / (negative + 2)
  const loss = (a: number, b: number): number => anchors.reduce((sum, anchor) => {
    const value = a * anchor.margin + b
    const target = anchor.positive ? high : low
    // log(1 + e^v) - t·v, written to stay finite for large |v|.
    const softplus = value > 0 ? value + Math.log1p(Math.exp(-value)) : Math.log1p(Math.exp(value))
    return sum + anchor.weight * (softplus - target * value)
  }, 0)
  let a = 0
  let b = Math.log((positive + 1) / (negative + 1))
  let current = loss(a, b)
  for (let iteration = 0; iteration < 100; iteration += 1) {
    let ga = 0
    let gb = 0
    let haa = 1e-12
    let hab = 0
    let hbb = 1e-12
    for (const anchor of anchors) {
      const p = sigmoid(a * anchor.margin + b)
      const residual = anchor.weight * (p - (anchor.positive ? high : low))
      const curvature = anchor.weight * p * (1 - p)
      ga += residual * anchor.margin
      gb += residual
      haa += curvature * anchor.margin * anchor.margin
      hab += curvature * anchor.margin
      hbb += curvature
    }
    if (Math.abs(ga) < 1e-9 && Math.abs(gb) < 1e-9) break
    const det = haa * hbb - hab * hab
    const da = -(hbb * ga - hab * gb) / det
    const db = -(haa * gb - hab * ga) / det
    let scale = 1
    while (scale > 1e-10 && loss(a + scale * da, b + scale * db) > current) scale /= 2
    if (scale <= 1e-10) break
    a += scale * da
    b += scale * db
    current = loss(a, b)
  }
  return a > 0 ? { a, b } : { a: 0, b: Math.log(positive / negative) }
}

/** A monotone map as its knots, ascending in both coordinates; between knots it is linear, beyond them flat. */
export type MonotoneMap = [number, number][]

/**
 * The monotone non-decreasing map that fits `pairs` of (from, to) best in least squares, by pool
 * adjacent violators, as one knot per pooled block at its mean `from` and `to`.
 */
export function fitMonotone(pairs: readonly (readonly [number, number])[]): MonotoneMap {
  const blocks: { x: number; y: number; count: number }[] = []
  for (const [x, y] of [...pairs].sort((left, right) => left[0] - right[0] || left[1] - right[1])) {
    blocks.push({ x, y, count: 1 })
    while (blocks.length > 1 && blocks.at(-2)!.y >= blocks.at(-1)!.y) {
      const last = blocks.pop()!
      const before = blocks.at(-1)!
      const count = before.count + last.count
      before.x = (before.x * before.count + last.x * last.count) / count
      before.y = (before.y * before.count + last.y * last.count) / count
      before.count = count
    }
  }
  return blocks.map((block) => [block.x, block.y])
}

/** The value `map` gives `x`. */
export function mapped(map: MonotoneMap, x: number): number {
  const first = map[0]
  if (first === undefined) return x
  if (x <= first[0]) return first[1]
  for (let at = 1; at < map.length; at += 1) {
    const [x1, y1] = map[at]!
    if (x <= x1) {
      const [x0, y0] = map[at - 1]!
      return x1 === x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    }
  }
  return map.at(-1)![1]
}

const hash = (text: string): number => {
  let value = 2_166_136_261
  for (let at = 0; at < text.length; at += 1) {
    value ^= text.charCodeAt(at)
    value = Math.imul(value, 16_777_619)
  }
  return value >>> 0
}

/**
 * `count` items of `items`, drawn without replacement by a generator seeded with `seed`, so the same
 * seed and the same items, in any order, give the same draw. Items are told apart by `keyOf`.
 */
export function seededSample<T>(items: readonly T[], count: number, seed: string, keyOf: (item: T) => string): T[] {
  const pool = [...items].sort((left, right) => keyOf(left).localeCompare(keyOf(right)))
  let state = hash(seed)
  const next = (): number => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
  const drawn = Math.min(count, pool.length)
  for (let at = 0; at < drawn; at += 1) {
    const pick = at + Math.floor(next() * (pool.length - at))
    ;[pool[at], pool[pick]] = [pool[pick]!, pool[at]!]
  }
  return pool.slice(0, drawn)
}
