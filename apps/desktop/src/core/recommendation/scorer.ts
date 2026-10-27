import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Embeddings } from './embeddings.js'
import type { TrainingExample } from './examples.js'
import {
  calibrated, fitMonotone, fitPlatt, fitScopeModel, mapped, marginOf, scopeAnchors, seededSample,
  type Anchor, type ModelExample, type MonotoneMap, type Platt, type ScopeModel,
} from './model.js'
import { textDot, textVectors, topicWords, type TextVector } from './providers/seed-text.js'

/** Weight of one sampled random negative. */
export const RANDOM_NEGATIVE_WEIGHT = 0.1
/** Most random negatives one scope samples. */
export const RANDOM_NEGATIVE_LIMIT = 100
/** Fewest random negatives a scope samples from; with fewer it falls back to FIXED_PRIOR. */
export const MIN_RANDOM_NEGATIVES = 10
/** The fixed prior a scope with too few random negatives uses instead: one paper similar to nothing, weighted like them. */
export const FIXED_PRIOR = 'meridian:fixed-prior'
/** The vector of FIXED_PRIOR on every path: its dot product with any paper is 0. */
const NOTHING = Symbol('similar to nothing')
/** Fewest papers both paths scored in one scope before a run fits its monotone map. */
const MAP_MIN_PAIRS = 5

/** The Semantic Scholar batch id of a paper or card: its `semanticId` when it has one, else `ARXIV:` and its arXiv id. */
export const batchIdOf = (semanticId: string | undefined, arxiv: string): string => (
  semanticId !== undefined && semanticId !== '' ? semanticId : `ARXIV:${arxiv}`
)

/** Which vectors scored a paper: SPECTER2 embeddings from the API, or TF-IDF vectors of its text. */
export type ScorePath = 'api' | 'fallback'

/** The text of one paper, by its Semantic Scholar batch id. */
export type ScoredText = { paperId: string; title: string; abstract: string }

/**
 * One scope a run fits a model for: its key, its training examples, the papers whose centroid is its
 * prior, and the papers a provider retrieved for it.
 */
export type ModelScope = { key: string; examples: TrainingExample[]; prior: string[]; retrieved: string[] }

/** Scopes that rank the same papers together, a project's enabled directions or one watch, and those papers. */
export type ScoreGroup = { id: string; scopes: ModelScope[]; items: string[] }

/** A paper's score in its group: the calibrated score under the scope it scored best under, and its path. */
export type GroupScore = { score: number; path: ScorePath; scope: string }

/** Both paths' scores of each paper of one scope that an API run scored on both, for measuring their gap. */
export type ScoreGap = { scope: string; pairs: { paperId: string; api: number; fallback: number }[] }

/** The scores of one run. */
export type RunScores = {
  /** The score of `paperId` in group `groupId`; undefined when no scope of the group could score it. */
  scoreOf(groupId: string, paperId: string): GroupScore | undefined
  /** The cosine similarity of two papers: of their embeddings when both have one, else of their text. */
  similarity(left: string, right: string): number
  /** The positive examples of scope `key`, nearest to `paperId` first by weighted similarity. */
  nearest(key: string, paperId: string): string[]
}

export type Scorer = {
  /**
   * Scores every item of `groups` under each scope of its group, as one embedding run that starts on
   * the API path and stays on the fallback once a request fails. Each scope's model is fitted on its
   * examples and on random negatives sampled, seeded by the scope's key, from the papers of other
   * scopes: the groups' items and examples and `background`, which names each paper's owner, a group
   * id or a scope key, and whether it is a positive, as `randomNegatives` draws them. Every path is
   * Platt-fitted to the anchors of all scopes together: each scope's negatives, its positives scored
   * leave-one-out, and the papers retrieved for it that score above all its negatives, as positives
   * that share the weight of its positives. An item scores on the API path
   * when it and the scope's model have embeddings, else on the fallback path through the scope's
   * monotone map. `papers` holds the text of every paper named. Embeddings of the groups' papers come
   * from the cache or the API; those of the background only from the cache. While the run stays on
   * the API, each scope's map is refitted from the items both paths scored, and saved. A run that left
   * the API is logged with its reason, as an error when the API refused the saved key and else as a
   * warning. Throws when an embedding request fails for a reason that is no EmbeddingFallbackReason.
   */
  score(input: {
    groups: readonly ScoreGroup[]
    papers: ReadonlyMap<string, ScoredText>
    background: readonly { paperId: string; owner: string; positive: boolean }[]
  }): Promise<RunScores>
}

type Example = TrainingExample & { prior: boolean }
type Fitted = { model: ScopeModel; rows: Example[] }

/** Reads the monotone maps `file` keeps, by scope key; none when it is missing or unreadable, since the file is derived. */
const readMaps = (file: string): Record<string, MonotoneMap> => {
  try {
    const held: unknown = JSON.parse(readFileSync(file, 'utf8'))
    const maps = (held as { maps?: unknown } | null)?.maps
    if (maps === null || typeof maps !== 'object') return {}
    return Object.fromEntries(Object.entries(maps).filter(([, map]) => Array.isArray(map) && map.every((knot: unknown) => (
      Array.isArray(knot) && knot.length === 2 && knot.every((value) => typeof value === 'number' && Number.isFinite(value))
    )))) as Record<string, MonotoneMap>
  } catch {
    return {}
  }
}

const unit = (vector: readonly number[]): number[] => {
  const norm = Math.hypot(...vector) || 1
  return vector.map((value) => value / norm)
}

const denseDot = (left: readonly number[], right: readonly number[]): number => {
  let dot = 0
  for (let at = 0; at < left.length; at += 1) dot += left[at]! * (right[at] ?? 0)
  return dot
}

/** The similarity of the centroids of two sets of papers, through `similarity`; 0 when either is empty. */
const centroidSimilarity = (
  left: readonly string[], right: readonly string[], similarity: (left: string, right: string) => number,
): number => {
  const total = (one: readonly string[], other: readonly string[]) => one.reduce((sum, a) => (
    sum + other.reduce((inner, b) => inner + similarity(a, b), 0)
  ), 0)
  const norms = Math.sqrt(total(left, left) * total(right, right))
  return norms > 0 ? total(left, right) / norms : 0
}

/**
 * The random negatives of scope `key` in group `groupId`, drawn from `owned` (each paper's owners)
 * by a generator seeded with `key`, RANDOM_NEGATIVE_WEIGHT each, as many as make up
 * `positiveWeight`, at most RANDOM_NEGATIVE_LIMIT. Never drawn: a paper of `positives` or `taken`, a
 * paper of the scope or its group, a paper whose similarity to the centroid of `seeds` reaches the
 * weakest seed's, and every paper of an owner whose centroid reaches it. With fewer than
 * MIN_RANDOM_NEGATIVES left, returns FIXED_PRIOR alone, weighted like the negatives it stands for.
 */
export function randomNegatives(
  scope: { key: string; groupId: string; seeds: readonly string[]; taken: ReadonlySet<string>; positiveWeight: number },
  owned: ReadonlyMap<string, ReadonlySet<string>>, positives: ReadonlySet<string>,
  similarity: (left: string, right: string) => number,
): TrainingExample[] {
  const { key, groupId, seeds, taken, positiveWeight } = scope
  const floor = Math.min(...seeds.map((paperId) => centroidSimilarity([paperId], seeds, similarity)))
  const papersOf = new Map<string, string[]>()
  for (const [paperId, owners] of owned) {
    if (positives.has(paperId)) continue
    for (const owner of owners) papersOf.set(owner, [...papersOf.get(owner) ?? [], paperId])
  }
  const sameSubject = new Set([...papersOf].flatMap(([owner, held]) => (
    owner === key || owner === groupId || centroidSimilarity(held, seeds, similarity) >= floor ? [owner] : []
  )))
  const pool = [...owned].flatMap(([paperId, owners]) => (
    positives.has(paperId) || taken.has(paperId) || [...owners].some((owner) => sameSubject.has(owner))
    || centroidSimilarity([paperId], seeds, similarity) >= floor ? [] : [paperId]
  ))
  const count = Math.min(RANDOM_NEGATIVE_LIMIT, Math.round(positiveWeight / RANDOM_NEGATIVE_WEIGHT))
  if (pool.length < MIN_RANDOM_NEGATIVES) return [{ paperId: FIXED_PRIOR, weight: count * RANDOM_NEGATIVE_WEIGHT, positive: false }]
  return seededSample(pool, count, key, (paperId) => paperId).map((paperId) => ({
    paperId, weight: RANDOM_NEGATIVE_WEIGHT, positive: false,
  }))
}

/**
 * The paper scorer: embeddings through `embeddings`, monotone maps kept in `calibrationFile`, and
 * `onGap`, when given, told after every run on the API path what both paths scored.
 */
export function createScorer(deps: {
  embeddings: Embeddings
  calibrationFile: string
  onGap?: (gaps: ScoreGap[]) => void
}): Scorer {
  return {
    async score({ groups, papers, background }) {
      const run = deps.embeddings.startRun()
      const owners = new Map<string, Set<string>>()
      const own = (paperId: string, owner: string): void => {
        const held = owners.get(paperId)
        if (held === undefined) owners.set(paperId, new Set([owner]))
        else held.add(owner)
      }
      for (const group of groups) {
        for (const item of group.items) own(item, group.id)
        for (const scope of group.scopes) for (const id of [...scope.prior, ...scope.examples.map((example) => example.paperId)]) own(id, scope.key)
      }
      for (const { paperId, owner } of background) own(paperId, owner)

      const fetched = new Set(groups.flatMap((group) => [
        ...group.items, ...group.scopes.flatMap((scope) => [...scope.prior, ...scope.examples.map((example) => example.paperId)]),
      ]))
      const lookup = await deps.embeddings.vectorsFor([...fetched], run)
      if (run.reason === 'auth') {
        console.error('[feed] fallback reason=auth: Semantic Scholar refused the saved key for paper embeddings; this refresh scores on TF-IDF. Check the key in Settings.')
      } else if (run.reason !== undefined) {
        console.warn(`[feed] fallback reason=${run.reason}: paper embeddings fell back to TF-IDF for this refresh`)
      }
      const cached = await deps.embeddings.vectorsFor([...owners.keys()].filter((paperId) => !fetched.has(paperId)), { path: 'fallback' })
      const embedding = new Map([...lookup.vectors].map(([id, vector]) => [id, unit(vector)]))
      if (lookup.model === null || cached.model === lookup.model) {
        for (const [id, vector] of cached.vectors) embedding.set(id, unit(vector))
      }
      const texts = [...papers.values()]
      const textVector = new Map<string, TextVector>(textVectors(texts.map((paper) => topicWords(`${paper.title} ${paper.abstract}`)))
        .map((vector, at) => [texts[at]!.paperId, vector]))
      const similarity = (left: string, right: string): number => {
        const leftEmbedding = embedding.get(left)
        const rightEmbedding = embedding.get(right)
        if (leftEmbedding !== undefined && rightEmbedding !== undefined) return denseDot(leftEmbedding, rightEmbedding)
        const leftText = textVector.get(left)
        const rightText = textVector.get(right)
        return leftText !== undefined && rightText !== undefined ? textDot(leftText, rightText) : 0
      }
      // Papers no scope may draw as a random negative: every positive example, in the run or not.
      const positives = new Set([
        ...groups.flatMap((group) => group.scopes.flatMap((scope) => (
          scope.examples.flatMap((example) => (example.positive ? [example.paperId] : []))
        ))),
        ...background.flatMap((paper) => (paper.positive ? [paper.paperId] : [])),
      ])
      const examplesOf = new Map<string, Example[]>()
      const retrievedOf = new Map(groups.flatMap((group) => group.scopes.map((scope) => [scope.key, scope.retrieved] as const)))
      for (const group of groups) {
        for (const scope of group.scopes) {
          const prior = new Set(scope.prior)
          const labelled = [...new Map(scope.examples.map((example) => [example.paperId, example])).values()]
          const positiveWeight = labelled.reduce((sum, example) => sum + (example.positive ? example.weight : 0), 0)
          const negatives = randomNegatives({
            key: scope.key, groupId: group.id, seeds: scope.prior.filter((paperId) => papers.has(paperId)),
            taken: new Set(labelled.map((example) => example.paperId)), positiveWeight,
          }, new Map([...owners].filter(([paperId]) => papers.has(paperId))), positives, similarity)
          examplesOf.set(scope.key, [
            ...labelled.map((example) => ({ ...example, prior: prior.has(example.paperId) })),
            ...negatives.map((example) => ({ ...example, prior: false })),
          ])
        }
      }

      /** Fits each scope on one path, and the Platt map of that path; null when the path cannot be calibrated. */
      const fitPath = <V>(vectorOf: (paperId: string) => V | undefined, dotOf: (left: V, right: V) => number) => {
        type Held = V | typeof NOTHING
        const known = (paperId: string): Held | undefined => (paperId === FIXED_PRIOR ? NOTHING : vectorOf(paperId))
        const dot = (left: Held, right: Held): number => (left === NOTHING || right === NOTHING ? 0 : dotOf(left, right))
        const fitted = new Map<string, Fitted>()
        const anchors: Anchor[] = []
        for (const [key, examples] of examplesOf) {
          const rows = examples.filter((example) => known(example.paperId) !== undefined)
          const vectors = rows.map((example) => known(example.paperId)!)
          const gram = vectors.map((left) => vectors.map((right) => dot(left, right)))
          const modelRows: ModelExample[] = rows.map(({ weight, positive, prior }) => ({ weight, positive, prior }))
          const model = fitScopeModel(modelRows, gram, rows.map((_, at) => at))
          if (model === null) continue
          fitted.set(key, { model, rows })
          const own = scopeAnchors(modelRows, gram, model)
          anchors.push(...own)
          // A retrieved paper no closer to the scope than its closest negative is no evidence of relevance.
          const ceiling = Math.max(...rows.flatMap((example, at) => (example.positive ? [] : [marginOf(model, gram[at]!)])))
          const retrieved = (retrievedOf.get(key) ?? []).flatMap((paperId) => {
            const vector = vectorOf(paperId)
            const margin = vector === undefined ? undefined : marginOf(model, vectors.map((row) => dot(row, vector)))
            return margin === undefined || margin <= ceiling ? [] : [margin]
          })
          const weight = rows.reduce((sum, example) => sum + (example.positive ? example.weight : 0), 0) / retrieved.length
          anchors.push(
            ...retrieved.map((margin) => ({ margin, positive: true, weight })),
            ...(retrieved.length === 0 || own.length > 0 ? [] : rows.flatMap((example, at) => (example.positive ? [] : [{
              margin: marginOf(model, gram[at]!), positive: false, weight: example.weight,
            }]))),
          )
        }
        if (!anchors.some((anchor) => anchor.positive) || !anchors.some((anchor) => !anchor.positive)) return null
        const platt: Platt = fitPlatt(anchors)
        return {
          scoreOf(key: string, paperId: string): number | undefined {
            const held = fitted.get(key)
            const vector = vectorOf(paperId)
            if (held === undefined || vector === undefined) return undefined
            return calibrated(platt, marginOf(held.model, held.rows.map((example) => dot(known(example.paperId)!, vector))))
          },
        }
      }
      const api = fitPath((paperId) => embedding.get(paperId), denseDot)
      const fallback = fitPath((paperId) => textVector.get(paperId), textDot)

      const maps = readMaps(deps.calibrationFile)
      const onApi = run.path === 'api' && lookup.path === 'api'
      const gaps: ScoreGap[] = []
      const scores = new Map<string, Map<string, GroupScore>>()
      for (const group of groups) {
        const byItem = new Map<string, GroupScore>()
        for (const scope of group.scopes) {
          const pairs: ScoreGap['pairs'] = []
          const raw = group.items.map((paperId) => {
            const fromApi = api?.scoreOf(scope.key, paperId)
            const fromText = fallback?.scoreOf(scope.key, paperId)
            if (fromApi !== undefined && fromText !== undefined) pairs.push({ paperId, api: fromApi, fallback: fromText })
            return { paperId, fromApi, fromText }
          })
          if (onApi && pairs.length > 0) gaps.push({ scope: scope.key, pairs })
          if (onApi && pairs.length >= MAP_MIN_PAIRS) maps[scope.key] = fitMonotone(pairs.map((pair) => [pair.fallback, pair.api]))
          const map = maps[scope.key] ?? []
          for (const { paperId, fromApi, fromText } of raw) {
            const scored: GroupScore | undefined = fromApi !== undefined
              ? { score: fromApi, path: 'api', scope: scope.key }
              : fromText !== undefined ? { score: mapped(map, fromText), path: 'fallback', scope: scope.key } : undefined
            const held = byItem.get(paperId)
            if (scored !== undefined && (held === undefined || scored.score > held.score)) byItem.set(paperId, scored)
          }
        }
        scores.set(group.id, byItem)
      }
      if (onApi && gaps.some((gap) => gap.pairs.length >= MAP_MIN_PAIRS)) {
        mkdirSync(dirname(deps.calibrationFile), { recursive: true })
        writeFileSync(deps.calibrationFile, `${JSON.stringify({ maps })}\n`, 'utf8')
      }
      if (onApi && gaps.length > 0) deps.onGap?.(gaps)

      return {
        scoreOf: (groupId, paperId) => scores.get(groupId)?.get(paperId),
        similarity,
        nearest(key, paperId) {
          const positives = (examplesOf.get(key) ?? []).filter((example) => example.positive)
          return positives.map((example, at) => ({ example, at, value: example.weight * similarity(paperId, example.paperId) }))
            .sort((left, right) => right.value - left.value || left.at - right.at)
            .map(({ example }) => example.paperId)
        },
      }
    },
  }
}
