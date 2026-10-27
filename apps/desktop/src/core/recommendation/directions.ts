import type { DiscoveryDirectionParams } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import { applyRecommendationPreferences } from './profile.js'
import type {
  DiscoveryPreferences, RecommendationIntent, RecommendationProfile, RecommendationSeed,
} from './types.js'

/** One stored direction: its id, label, ranking score and seed papers, `named` once the user renamed it. */
export type DirectionRecord = {
  id: string
  label: string
  named?: true
  score: number
  seeds: { paperId: string; title: string }[]
}

/**
 * One project's directions as `.meridian/discovery/directions.json` stores them: the fingerprint of
 * the project basis they were last scanned against, the confirmed directions, the candidates waiting
 * for the user, and the candidates the user declined.
 */
export type ProjectDirections = {
  basis: string
  directions: DirectionRecord[]
  candidates: DirectionRecord[]
  declined: DirectionRecord[]
}

/** What a direction label may draw on for one seed paper: its Wiki topics and its short title. */
export type DirectionPaper = { topics: string[]; shortTitle?: string | undefined }

/** Longest title prefix before a colon that still reads as a short title. */
const SHORT_PREFIX = 40

const fingerprint = (source: string): string => {
  let hash = 2_166_136_261
  for (let at = 0; at < source.length; at += 1) {
    hash ^= source.charCodeAt(at)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(36)
}

/**
 * The fingerprint of what a project's directions follow: its topics, its current goal and the
 * labels of its research path, each list in any order.
 */
export function directionBasis(basis: { topics: string[]; focus: string; path: string[] }): string {
  return fingerprint(JSON.stringify([[...basis.topics].sort(), basis.focus.trim(), [...basis.path].sort()]))
}

/** The short title of `title`: its part before the first colon when that part is short, else all of it. */
const shortTitleOf = (title: string): string => {
  const head = title.split(':')[0]!.trim()
  return head !== '' && head.length <= SHORT_PREFIX && head !== title.trim() ? head : title.trim()
}

/**
 * The label of a direction seeded by `seeds`, in anchor order: the Wiki topic most of its seeds hold,
 * ties going to the earlier seed's earlier topic, unless `taken` already holds it; else the short title
 * `paperOf` gives the first seed, or its title's part before a colon, or its whole title.
 */
export function directionLabel(
  seeds: readonly Pick<RecommendationSeed, 'paperId' | 'title'>[],
  paperOf: (paperId: string) => DirectionPaper | undefined,
  taken: ReadonlySet<string>,
): string {
  const counts = new Map<string, number>()
  for (const seed of seeds) {
    for (const topic of new Set(paperOf(seed.paperId)?.topics ?? [])) counts.set(topic, (counts.get(topic) ?? 0) + 1)
  }
  let best: string | undefined
  for (const [topic, count] of counts) {
    if (!taken.has(topic) && (best === undefined || count > counts.get(best)!)) best = topic
  }
  if (best !== undefined) return best
  const first = seeds[0]
  if (first === undefined) return ''
  return paperOf(first.paperId)?.shortTitle?.trim() || shortTitleOf(first.title)
}

/** `intents` as stored directions, labelled in order so no two of them, nor any of `taken`, share a topic label. */
const recordsOf = (
  intents: readonly RecommendationIntent[], paperOf: (paperId: string) => DirectionPaper | undefined,
  taken: Set<string>,
): DirectionRecord[] => intents.map((intent) => {
  const label = directionLabel(intent.seeds, paperOf, taken)
  taken.add(label)
  return {
    id: intent.id, label, score: intent.score,
    seeds: intent.seeds.map((seed) => ({ paperId: seed.paperId, title: seed.title })),
  }
})

/**
 * The directions a project holds on its first open by this version: every direction `derived` from it
 * so far, in derivation order and with the same ids and seeds, confirmed and relabelled, against `basis`.
 */
export function migratedDirections(
  derived: readonly RecommendationIntent[], basis: string, paperOf: (paperId: string) => DirectionPaper | undefined,
): ProjectDirections {
  return { basis, directions: recordsOf(derived, paperOf, new Set()), candidates: [], declined: [] }
}

/**
 * Scans a project whose directions are `held` (undefined before its first scan) when its basis is no
 * longer `basis` or it holds no direction of any kind yet. Each direction `derived` from the project
 * that shares no seed with a direction it holds, offers or declined becomes a candidate. Confirmed
 * directions are never changed. Returns null when no scan is due, else the project's directions after
 * the scan and the candidates it found.
 */
export function scannedDirections(
  held: ProjectDirections | undefined, derived: readonly RecommendationIntent[], basis: string,
  paperOf: (paperId: string) => DirectionPaper | undefined,
): { next: ProjectDirections; found: DirectionRecord[] } | null {
  const current = held ?? { basis, directions: [], candidates: [], declined: [] }
  const all = [...current.directions, ...current.candidates, ...current.declined]
  if (held !== undefined && held.basis === basis && all.length > 0) return null
  const seen = new Set(all.flatMap((direction) => direction.seeds.map((seed) => seed.paperId)))
  const fresh = derived.filter((intent) => (
    !all.some((direction) => direction.id === intent.id) && intent.seeds.every((seed) => !seen.has(seed.paperId))
  ))
  const found = recordsOf(fresh, paperOf, new Set([...current.directions, ...current.candidates].map((direction) => direction.label)))
  return { next: { ...current, basis, candidates: [...current.candidates, ...found] }, found }
}

/**
 * The confirmed directions of `held` as recommendation intents, their seeds read from `profile` where
 * the project still holds the paper, with `preferences` choosing the core and the directions turned off.
 */
export function directionIntents(
  held: ProjectDirections | undefined, preferences: DiscoveryPreferences, profile: RecommendationProfile,
): RecommendationIntent[] {
  if (held === undefined) return []
  const seeds = new Map(profile.positive.map((seed) => [seed.paperId, seed]))
  return applyRecommendationPreferences(held.directions.map((direction) => ({
    id: direction.id, label: direction.label, score: direction.score, core: false, enabled: true,
    seeds: direction.seeds.map((seed) => seeds.get(seed.paperId) ?? {
      paperId: seed.paperId, title: seed.title, abstract: '', source: 'project' as const,
    }),
  })), preferences)
}

/**
 * The directions `held` after `action`: `add` confirms a candidate, `decline` declines it, and `rename`
 * gives a confirmed direction the user's label. Throws `not-found` when the direction the action needs
 * is not there.
 */
export function directionsAfter(held: ProjectDirections | undefined, action: DiscoveryDirectionParams): ProjectDirections {
  const candidate = held?.candidates.find((direction) => direction.id === action.directionId)
  if (action.action === 'rename') {
    if (held === undefined || !held.directions.some((direction) => direction.id === action.directionId)) {
      throw new CallError('not-found', `推荐方向不存在：${action.directionId}`)
    }
    return {
      ...held,
      directions: held.directions.map((direction) => (
        direction.id === action.directionId ? { ...direction, label: action.label, named: true } : direction
      )),
    }
  }
  if (held === undefined || candidate === undefined) throw new CallError('not-found', `候选方向不存在：${action.directionId}`)
  const candidates = held.candidates.filter((direction) => direction !== candidate)
  return action.action === 'add'
    ? { ...held, candidates, directions: [...held.directions, candidate] }
    : { ...held, candidates, declined: [...held.declined, candidate] }
}

/**
 * The directions turned off as `disabled` lists them, with every candidate and declined direction of
 * `held` added, so an App that derives its directions itself does not fetch them.
 */
export function mirroredDisabled(held: ProjectDirections, disabled: readonly string[]): string[] {
  return [...new Set([...disabled, ...[...held.candidates, ...held.declined].map((direction) => direction.id)])]
}
