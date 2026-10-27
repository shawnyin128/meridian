import { directionOf } from './examples.js'
import type { ScoreGap } from './scorer.js'
import type { CardSignal, RecommendationIntent } from './types.js'

/** The depth the gap between the two paths is measured at. */
export const GAP_DEPTH = 10

/**
 * The nDCG at depth `k` of `ranked` under `gain`, each paper's gain: the discounted gains of its first
 * `k` papers over those of the best order of every paper `gains` names. Returns 1 when no paper has a
 * gain above 0.
 */
export function ndcgAt(ranked: readonly string[], gains: ReadonlyMap<string, number>, k: number): number {
  const dcg = (values: readonly number[]) => values.slice(0, k).reduce((sum, value, at) => sum + value / Math.log2(at + 2), 0)
  const ideal = dcg([...gains.values()].sort((left, right) => right - left))
  return ideal === 0 ? 1 : dcg(ranked.map((paperId) => gains.get(paperId) ?? 0)) / ideal
}

/** The ranks of `values`, from 1, ties sharing their mean rank. */
const ranksOf = (values: readonly number[]): number[] => {
  const order = values.map((value, at) => ({ value, at })).sort((left, right) => left.value - right.value)
  const ranks = new Array<number>(values.length)
  for (let from = 0; from < order.length;) {
    let to = from
    while (to + 1 < order.length && order[to + 1]!.value === order[from]!.value) to += 1
    for (let at = from; at <= to; at += 1) ranks[order[at]!.at] = (from + to) / 2 + 1
    from = to + 1
  }
  return ranks
}

/** Spearman's rank correlation of two equally long lists; 0 when either has no spread. */
export function spearman(left: readonly number[], right: readonly number[]): number {
  const a = ranksOf(left)
  const b = ranksOf(right)
  const mean = (a.length + 1) / 2
  let cross = 0
  let spreadA = 0
  let spreadB = 0
  a.forEach((rank, at) => {
    cross += (rank - mean) * (b[at]! - mean)
    spreadA += (rank - mean) ** 2
    spreadB += (b[at]! - mean) ** 2
  })
  return spreadA === 0 || spreadB === 0 ? 0 : cross / Math.sqrt(spreadA * spreadB)
}

/** How far the fallback ranking of one scope's papers is from the API ranking of the same papers. */
export type RankingGap = { scope: string; papers: number; overlap: number; ndcg: number; spearman: number }

/**
 * The gap of one scope: the share of the API's top GAP_DEPTH the fallback's top GAP_DEPTH holds, the
 * fallback ranking's nDCG at GAP_DEPTH against the API ranking, whose first paper gains GAP_DEPTH, its
 * second one less, and so on to 1 for the last of its top GAP_DEPTH, and Spearman's ρ of the two
 * scores. Ties keep the papers' order in `gap.pairs`.
 */
export function rankingGap(gap: ScoreGap): RankingGap {
  const by = (key: 'api' | 'fallback') => [...gap.pairs].sort((left, right) => right[key] - left[key]).map((pair) => pair.paperId)
  const api = by('api').slice(0, GAP_DEPTH)
  const fallback = by('fallback')
  const top = new Set(fallback.slice(0, GAP_DEPTH))
  return {
    scope: gap.scope,
    papers: gap.pairs.length,
    overlap: api.filter((paperId) => top.has(paperId)).length / api.length,
    ndcg: ndcgAt(fallback, new Map(api.map((paperId, at) => [paperId, GAP_DEPTH - at])), GAP_DEPTH),
    spearman: spearman(gap.pairs.map((pair) => pair.api), gap.pairs.map((pair) => pair.fallback)),
  }
}

/** Writes one Core info line for the gap of each scope of `gaps`. */
export function logGaps(gaps: readonly ScoreGap[]): void {
  for (const gap of gaps) {
    const measured = rankingGap(gap)
    console.info(`[feed] gap ${measured.scope} papers=${measured.papers} overlap@${GAP_DEPTH}=${measured.overlap.toFixed(3)} `
      + `ndcg@${GAP_DEPTH}=${measured.ndcg.toFixed(3)} spearman=${measured.spearman.toFixed(3)}`)
  }
}

/**
 * What one scoring path delivered to a scope, over every card the scope holds: how many cards it
 * scored last, how many still show, how many were added to the vault, dismissed or marked known, how
 * many show though the vault holds their paper, and each direction's share of the cards that show.
 * `path` is `none` for cards no scope model scored.
 */
export type PathMeasures = {
  path: string; delivered: number; shown: number; added: number; dismissed: number; known: number; ownedShown: number
  directions: Record<string, number>
}

/** Why `card` left the feed: its `left`, or for a card stored before `left` was, its download or feedback. */
const outcomeOf = (card: CardSignal): string | undefined => (
  !card.gone ? undefined : card.left ?? (card.downloaded ? 'library' : card.feedback)
)

/**
 * The measures of each path among `cards`, one scope's cards, in the order `api`, `fallback`, `none`,
 * leaving out a path with no card. A card counts for the direction of `directions` it names, else the
 * core one; with no directions, no shares are kept.
 */
export function feedMeasures(cards: readonly CardSignal[], directions: readonly RecommendationIntent[]): PathMeasures[] {
  return ['api', 'fallback', 'none'].flatMap((path) => {
    const held = cards.filter((card) => (card.path ?? 'none') === path)
    if (held.length === 0) return []
    const shown = held.filter((card) => card.shown)
    const counts = new Map<string, number>()
    for (const card of shown) {
      const id = directionOf(card, directions)?.id
      if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    const outcomes = held.map(outcomeOf)
    return [{
      path, delivered: held.length, shown: shown.length,
      added: outcomes.filter((outcome) => outcome === 'library').length,
      dismissed: outcomes.filter((outcome) => outcome === 'dismissed').length,
      known: outcomes.filter((outcome) => outcome === 'known').length,
      ownedShown: shown.filter((card) => card.owned).length,
      directions: Object.fromEntries([...counts].map(([id, count]) => [id, count / shown.length])),
    }]
  })
}

/**
 * Writes one Core line for each path of the feedMeasures of `scope`'s `cards`: info, or error when a
 * card shows though the vault holds its paper.
 */
export function logFeedMeasures(scope: string, cards: readonly CardSignal[], directions: readonly RecommendationIntent[]): void {
  for (const measured of feedMeasures(cards, directions)) {
    const share = (count: number) => (count / measured.delivered).toFixed(3)
    const shares = Object.entries(measured.directions).map(([id, value]) => `${id}:${value.toFixed(3)}`).join(',')
    const line = `[feed] measures ${scope} path=${measured.path} delivered=${measured.delivered} shown=${measured.shown} `
      + `added=${measured.added} dismissed=${measured.dismissed} known=${measured.known} owned-shown=${measured.ownedShown} `
      + `added-rate=${share(measured.added)} dismiss-rate=${share(measured.dismissed)} known-share=${share(measured.known)}`
      + (shares === '' ? '' : ` directions=${shares}`)
    if (measured.ownedShown > 0) console.error(line)
    else console.info(line)
  }
}
