import type {
  DiscoveryPreferences, RecommendationIntent, RecommendationProfile, RecommendationSeed,
  RecommendationSource,
} from './types.js'

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'aware', 'based', 'by', 'can', 'for', 'from', 'in',
  'is', 'its', 'language', 'large', 'llm', 'llms', 'model', 'models', 'of', 'on', 'paper',
  'the', 'to', 'toward', 'towards', 'via', 'with',
])
const MAX_PROVIDER_SEEDS = 5
const CLUSTER_SIMILARITY = 0.32

type ProfileInput = {
  projectId: string
  projectName: string
  anchorText: string
  wikiTerms?: string[]
  projectPapers: Omit<RecommendationSeed, 'source'>[]
  feedbackPapers: Array<Omit<RecommendationSeed, 'source'> & { feedback: 'more' | 'less' | 'known' }>
}

const uniqueSeeds = (seeds: RecommendationSeed[]): RecommendationSeed[] => {
  const seen = new Set<string>()
  return seeds.filter((seed) => {
    if (seen.has(seed.paperId)) return false
    seen.add(seed.paperId)
    return true
  }).slice(0, 50)
}

/** Builds the same project-local profile from either the real or fixture store projection. */
export function buildRecommendationProfile(input: ProfileInput): RecommendationProfile {
  const projectSeeds = input.projectPapers.map((paper) => ({ ...paper, source: 'project' as const }))
  const positives = input.feedbackPapers
    .filter((paper) => paper.feedback === 'more')
    .map((paper) => ({
      paperId: paper.paperId, title: paper.title, abstract: paper.abstract,
      source: 'feedback' as const,
    }))
  const negatives = input.feedbackPapers
    .filter((paper) => paper.feedback === 'less')
    .map((paper) => ({
      paperId: paper.paperId, title: paper.title, abstract: paper.abstract,
      source: 'feedback' as const,
    }))
  return {
    projectId: input.projectId,
    projectName: input.projectName,
    anchorText: input.anchorText,
    wikiTerms: [...new Set((input.wikiTerms ?? []).map((term) => term.trim()).filter(Boolean))],
    positive: uniqueSeeds([...projectSeeds, ...positives]),
    negative: uniqueSeeds(negatives),
  }
}

const terms = (seed: RecommendationSeed): Set<string> => {
  const title = seed.title.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  const useful = title.filter((word) => word.length > 1 && !STOP_WORDS.has(word))
  if (useful.length > 0) return new Set(useful)
  return new Set((seed.abstract.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word)))
}

const overlap = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const word of left) if (right.has(word)) shared += 1
  return shared / Math.min(left.size, right.size)
}

const anchorOverlap = (anchor: Set<string>, candidate: Set<string>): number => {
  if (anchor.size === 0 || candidate.size === 0) return 0
  let shared = 0
  for (const word of anchor) if (candidate.has(word)) shared += 1
  return shared / new Set([...anchor, ...candidate]).size
}

const labelOf = (cluster: RecommendationSeed[], all: RecommendationSeed[]): string => {
  const inside = new Map<string, number>()
  const outside = new Map<string, number>()
  const clusterIds = new Set(cluster.map((seed) => seed.paperId))
  for (const seed of all) {
    const target = clusterIds.has(seed.paperId) ? inside : outside
    for (const word of terms(seed)) target.set(word, (target.get(word) ?? 0) + 1)
  }
  const ranked = [...inside].sort(([wordA, countA], [wordB, countB]) => {
    const distinctA = countA / cluster.length - (outside.get(wordA) ?? 0) / Math.max(1, all.length - cluster.length)
    const distinctB = countB / cluster.length - (outside.get(wordB) ?? 0) / Math.max(1, all.length - cluster.length)
    return distinctB - distinctA || countB - countA || wordA.localeCompare(wordB)
  })
  const first = ranked[0]?.[0]
  if (first === undefined) return cluster[0]?.title || '相关研究'
  const companion = [...inside]
    .filter(([word]) => word !== first)
    .sort(([wordA, countA], [wordB, countB]) => (
      countB - countA
      || (outside.get(wordA) ?? 0) - (outside.get(wordB) ?? 0)
      || wordA.localeCompare(wordB)
    ))[0]?.[0]
  return companion === undefined ? first : `${first} · ${companion}`
}

const clusterSimilarity = (
  left: RecommendationSeed[], right: RecommendationSeed[], featureById: Map<string, Set<string>>,
): number => Math.min(...left.flatMap((a) => right.map((b) => (
  overlap(featureById.get(a.paperId)!, featureById.get(b.paperId)!)
))))

const tightClusters = (
  seeds: RecommendationSeed[], featureById: Map<string, Set<string>>,
): RecommendationSeed[][] => {
  const clusters = seeds.map((seed) => [seed])
  while (clusters.length > 1) {
    let best = CLUSTER_SIMILARITY
    let pair: [number, number] | null = null
    for (let left = 0; left < clusters.length; left += 1) {
      for (let right = left + 1; right < clusters.length; right += 1) {
        const score = clusterSimilarity(clusters[left]!, clusters[right]!, featureById)
        if (score >= best) {
          best = score
          pair = [left, right]
        }
      }
    }
    if (pair === null) break
    clusters[pair[0]] = [...clusters[pair[0]]!, ...clusters[pair[1]]!]
    clusters.splice(pair[1], 1)
  }
  return clusters
}

const stableId = (cluster: RecommendationSeed[]): string => {
  const source = cluster.map((seed) => seed.paperId).sort().join('\n')
  let hash = 2_166_136_261
  for (let at = 0; at < source.length; at += 1) {
    hash ^= source.charCodeAt(at)
    hash = Math.imul(hash, 16_777_619)
  }
  return `intent-${(hash >>> 0).toString(36)}`
}

/**
 * Splits one project profile into a few inspectable title-overlap intents. This is deliberately
 * deterministic: it is a retrieval plan, not durable generated knowledge and not a Wiki write.
 */
export function clusterRecommendationProfile(profile: RecommendationProfile): RecommendationIntent[] {
  const seeds = profile.positive
  if (seeds.length === 0) return []
  const features = seeds.map(terms)
  const featureById = new Map(seeds.map((seed, at) => [seed.paperId, features[at]!]))
  const anchor = terms({
    paperId: profile.projectId, title: profile.anchorText, abstract: '', source: 'project',
  })
  const clusters = tightClusters(seeds, featureById)
  const ranked = clusters.map((cluster) => {
    const anchorScore = Math.max(
      0, ...cluster.map((seed) => anchorOverlap(anchor, featureById.get(seed.paperId)!)),
    )
    const feedbackScore = cluster.filter((seed) => seed.source === 'feedback').length / cluster.length
    const sizeScore = Math.min(1, Math.log2(cluster.length + 1) / 3)
    const score = anchorScore * 0.65 + feedbackScore * 0.25 + sizeScore * 0.1
    const orderedSeeds = [...cluster].sort((a, b) => (
      anchorOverlap(anchor, featureById.get(b.paperId)!)
      - anchorOverlap(anchor, featureById.get(a.paperId)!)
      || Number(b.source === 'feedback') - Number(a.source === 'feedback')
      || seeds.indexOf(a) - seeds.indexOf(b)
    ))
    return { cluster, orderedSeeds, score }
  }).sort((a, b) => b.score - a.score || seeds.indexOf(a.cluster[0]!) - seeds.indexOf(b.cluster[0]!))
  return ranked.map(({ cluster, orderedSeeds, score }, at) => ({
    id: stableId(cluster),
    label: labelOf(cluster, seeds),
    seeds: orderedSeeds.slice(0, MAX_PROVIDER_SEEDS),
    score,
    core: at === 0,
    enabled: true,
  }))
}

/** Applies user-owned recommendation controls without changing the derived cluster identities. */
export function applyRecommendationPreferences(
  intents: RecommendationIntent[], preferences: DiscoveryPreferences,
): RecommendationIntent[] {
  const disabled = new Set(preferences.disabledIntentIds)
  const enabled = intents.filter((intent) => !disabled.has(intent.id))
  const preferred = enabled.find((intent) => intent.id === preferences.coreIntentId) ?? enabled[0]
  return intents.map((intent) => ({
    ...intent,
    enabled: !disabled.has(intent.id),
    core: intent.id === preferred?.id,
  })).sort((left, right) => (
    Number(right.core) - Number(left.core) || right.score - left.score
  ))
}

export function recommendationFingerprint(
  intent: RecommendationIntent, negativePaperIds: string[], providerSource?: RecommendationSource,
): string {
  const fingerprintInput = [
    ...(providerSource === undefined || providerSource === 'similarity'
      ? [] : [`--source:${providerSource}--`]),
    intent.id,
    ...intent.seeds.map((seed) => seed.paperId).sort(),
    '--negative--',
    ...negativePaperIds.slice().sort(),
  ].join('\n')
  let hash = 2_166_136_261
  for (let at = 0; at < fingerprintInput.length; at += 1) {
    hash ^= fingerprintInput.charCodeAt(at)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(36)
}

/**
 * Uses the anchor-ranked representative for retrieval. Multi-seed providers weight positives
 * symmetrically, which can average away the project's main idea even inside a coherent cluster.
 * The complete cluster remains visible to the user and continues to determine the direction.
 */
export function recommendationQueryIntent(intent: RecommendationIntent): RecommendationIntent {
  return { ...intent, seeds: intent.seeds.slice(0, 1) }
}

/** Always keeps the anchored core intent and rotates the bounded secondary slots. */
export function selectRecommendationIntents(
  intents: RecommendationIntent[], limit: number, cursor: number,
): { selected: RecommendationIntent[]; nextCursor: number } {
  intents = intents.filter((intent) => intent.enabled)
  if (limit <= 0 || intents.length === 0) return { selected: [], nextCursor: cursor }
  if (intents.length <= limit) return { selected: intents, nextCursor: cursor }
  const core = intents[0]!
  const secondary = intents.slice(1)
  if (limit === 1) {
    const cycle = secondary.length * 2
    const phase = cursor % cycle
    return {
      selected: [phase % 2 === 0 ? core : secondary[Math.floor(phase / 2)]!],
      nextCursor: (phase + 1) % cycle,
    }
  }
  const slots = Math.max(0, limit - 1)
  const selected = [core]
  for (let at = 0; at < slots; at += 1) selected.push(secondary[(cursor + at) % secondary.length]!)
  return { selected, nextCursor: (cursor + slots) % secondary.length }
}

export function recommendationSeedIds(profile: RecommendationProfile): {
  positive: string[]; negative: string[]
} {
  return {
    positive: profile.positive.map((seed) => seed.paperId),
    negative: profile.negative.map((seed) => seed.paperId),
  }
}
