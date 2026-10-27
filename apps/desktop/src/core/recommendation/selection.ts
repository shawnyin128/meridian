/** Scores below this are as likely irrelevant as relevant or less, and never shown. */
export const SCORE_THRESHOLD = 0.5
/** Weight of the score against the similarity to the papers already picked, in maximal marginal relevance. */
export const MMR_LAMBDA = 0.7

/** A paper a scope may show: its score in [0, 1] and the direction it scored best under, if any. */
export type ShownCandidate = { paperId: string; score: number; direction?: string | undefined }

/**
 * Picks from `pool` up to `count` papers by maximal marginal relevance: each pick has the highest
 * MMR_LAMBDA · score − (1 − MMR_LAMBDA) · its greatest `similarity` to `picked` and the papers picked
 * before it, ties going to the earlier paper. Returns the picks in order.
 */
function pickMmr(
  pool: readonly ShownCandidate[], count: number, picked: readonly ShownCandidate[],
  similarity: (left: string, right: string) => number,
): ShownCandidate[] {
  const chosen: ShownCandidate[] = []
  const left = [...pool]
  while (chosen.length < count && left.length > 0) {
    let best = 0
    let bestValue = Number.NEGATIVE_INFINITY
    left.forEach((paper, at) => {
      const near = Math.max(0, ...[...picked, ...chosen].map((held) => similarity(paper.paperId, held.paperId)))
      const value = MMR_LAMBDA * paper.score - (1 - MMR_LAMBDA) * near
      if (value > bestValue) {
        best = at
        bestValue = value
      }
    })
    chosen.push(left.splice(best, 1)[0]!)
  }
  return chosen
}

/**
 * The papers of `candidates` a scope shows, at most `shown`, in the order picked. Papers scored below
 * SCORE_THRESHOLD are dropped. The core direction of `directions` (else the first) gets half the
 * slots, rounded up, and the other directions split the rest evenly, the odd slots going to the
 * earlier ones; each direction fills its share from its own papers by maximal marginal relevance under
 * `similarity`. Slots a direction cannot fill go, again by maximal marginal relevance, to the best of
 * the papers left, those of no listed direction included.
 */
export function selectShown(
  candidates: readonly ShownCandidate[], directions: readonly { id: string; core: boolean }[], shown: number,
  similarity: (left: string, right: string) => number,
): string[] {
  const eligible = candidates.filter((paper) => paper.score >= SCORE_THRESHOLD)
    .map((paper, at) => ({ paper, at }))
    .sort((left, right) => right.paper.score - left.paper.score || left.at - right.at)
    .map(({ paper }) => paper)
  const core = directions.find((direction) => direction.core) ?? directions[0]
  const others = directions.filter((direction) => direction !== core)
  const coreShare = others.length === 0 ? shown : Math.ceil(shown / 2)
  const rest = shown - coreShare
  const shares = core === undefined ? [] : [
    { id: core.id, count: coreShare },
    ...others.map((direction, at) => ({
      id: direction.id, count: Math.floor(rest / others.length) + (at < rest % others.length ? 1 : 0),
    })),
  ]
  const picked: ShownCandidate[] = []
  for (const share of shares) {
    picked.push(...pickMmr(eligible.filter((paper) => paper.direction === share.id), share.count, [], similarity))
  }
  const taken = new Set(picked.map((paper) => paper.paperId))
  picked.push(...pickMmr(eligible.filter((paper) => !taken.has(paper.paperId)), shown - picked.length, picked, similarity))
  return picked.map((paper) => paper.paperId)
}
