import type { VaultStore } from '../vault.js'
import type { RecommendationIntent, CardSignal } from './types.js'

/** One paper a scope model learns from: whether it is relevant to the scope, and how much it counts. */
export type TrainingExample = { paperId: string; weight: number; positive: boolean }

/** The scope a model is fitted for: one direction of a project, or one watch. */
export type ExampleScope =
  | { kind: 'direction'; projectId: string; directionId: string }
  | { kind: 'watch'; watchId: string }

/** What `trainingExamples` reads from the vault. */
export type ExampleStore = Pick<VaultStore, 'discoveryIntents' | 'scopeSignals'>

/** What each stored action says about its paper, by the `left` or `feedback` value that records it. */
const ACTIONS = new Map<string, { positive: boolean; weight: number }>([
  ['library', { positive: true, weight: 1 }],
  ['later', { positive: true, weight: 0.5 }],
  ['more', { positive: true, weight: 0.5 }],
  ['known', { positive: true, weight: 0.3 }],
  ['dismissed', { positive: false, weight: 0.3 }],
  ['less', { positive: false, weight: 0.5 }],
])
const SEED_WEIGHT = 1
const LIKED_WEIGHT = 1.5
const DISLIKED_WEIGHT = 0.5

/** The strongest positive and negative weights one paper has drawn, and whether it was rated 1–2. */
type Tally = { positive: number; negative: number; disliked: boolean }

/**
 * The actions on `card` that still stand: a stored `more`, and while the card is gone, why it left,
 * or for a card stored before `left` was, its feedback and whether it was downloaded into the vault.
 */
const actionsOf = (card: CardSignal): string[] => [
  ...(card.feedback === 'more' ? ['more'] : []),
  ...(!card.gone ? [] : card.left !== undefined ? [card.left] : [card.feedback ?? '', card.downloaded ? 'library' : '']),
]

/** The direction of `directions` that `card` counts for: the first one its reasons name, else the core one. */
function directionOf(card: CardSignal, directions: RecommendationIntent[]): RecommendationIntent | undefined {
  for (const reason of card.reasons) {
    const label = reason.kind === 'intent' ? /「(.+)」/.exec(reason.label)?.[1] : undefined
    const named = directions.find((direction) => direction.label === label)
    if (named !== undefined) return named
  }
  return directions.find((direction) => direction.core)
}

/**
 * The weighted training examples of `scope`, read from `store`, one per paper. A direction learns
 * from its seeds and from the cards of its project that name it, or name no direction its project
 * holds when it is the core one; a watch learns from its cards. A seed and a card added to the vault
 * count 1, as does a card an older version stored as downloaded without why it left; a library
 * rating of 4–5 counts 1.5, a card read later and an old `more` 0.5 and a card marked known 0.3; a
 * dismissed card is a negative of 0.3 and an old `less` one of 0.5. A paper with any positive is a
 * positive of its strongest weight, unless it was rated 1–2, which makes it a negative of 0.5. A card
 * restored to the feed, a card folded away and a card still in the feed count for nothing.
 * Returns the seeds first, then the cards in vault order, and no examples for a direction the
 * project does not hold.
 */
export function trainingExamples(scope: ExampleScope, store: ExampleStore): TrainingExample[] {
  const signals = store.scopeSignals(scope.kind === 'watch'
    ? { kind: 'watch', id: scope.watchId }
    : { kind: 'project', id: scope.projectId })
  const tallies = new Map<string, Tally>()
  const keyOf = new Map<string, string>()
  /** The tally of the paper known by `paperIds`, merged with a paper already tallied under any of them. */
  const tallyOf = (paperIds: string[]): Tally => {
    const key = paperIds.map((id) => keyOf.get(id)).find((held) => held !== undefined) ?? paperIds[0]!
    for (const id of paperIds) keyOf.set(id, key)
    const tally = tallies.get(key) ?? { positive: 0, negative: 0, disliked: false }
    tallies.set(key, tally)
    return tally
  }
  const rate = (tally: Tally, rating: number | undefined): void => {
    if (rating === undefined) return
    if (rating >= 4) tally.positive = Math.max(tally.positive, LIKED_WEIGHT)
    if (rating <= 2) tally.disliked = true
  }

  let cards = signals.cards
  if (scope.kind === 'direction') {
    const directions = store.discoveryIntents(scope.projectId)
    const held = directions.find((direction) => direction.id === scope.directionId)
    if (held === undefined) return []
    for (const seed of held.seeds) {
      const tally = tallyOf([seed.paperId])
      tally.positive = Math.max(tally.positive, SEED_WEIGHT)
      rate(tally, signals.ratings[seed.paperId])
    }
    cards = cards.filter((card) => directionOf(card, directions) === held)
  }
  for (const card of cards) {
    if (card.paperIds.length === 0) continue
    const tally = tallyOf(card.paperIds)
    for (const action of actionsOf(card)) {
      const said = ACTIONS.get(action)
      if (said === undefined) continue
      if (said.positive) tally.positive = Math.max(tally.positive, said.weight)
      else tally.negative = Math.max(tally.negative, said.weight)
    }
    rate(tally, card.rating)
  }

  return [...tallies].flatMap(([paperId, tally]): TrainingExample[] => {
    if (tally.disliked) return [{ paperId, weight: DISLIKED_WEIGHT, positive: false }]
    if (tally.positive > 0) return [{ paperId, weight: tally.positive, positive: true }]
    if (tally.negative > 0) return [{ paperId, weight: tally.negative, positive: false }]
    return []
  })
}
