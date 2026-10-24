/** Most candidates one scope keeps for later runs. */
export const POOL_LIMIT = 60

/** One scope taking part in a run that spreads a single delivery cap. */
export type SharedScope<T> = {
  /** When the scope last delivered more than an even split of a cap, or null if it never did. */
  favouredAt: number | null
  /** The scope's candidates in the order to offer them. Read once per run, in turn order. */
  candidates: () => Promise<T[]>
  /** Hands `batch` to the feed and returns how many of it the feed delivered. */
  deliver: (batch: T[]) => number
}

/**
 * Spreads `cap` deliveries over `scopes`. The first round splits the cap evenly over every scope and
 * gives the odd shares to the scopes favoured least recently, those never favoured first, then in the
 * given order; each later round splits what is left evenly over the scopes that still have candidates.
 * Each scope is offered its next candidates up to its share, and an offered candidate is used up whether
 * or not the feed delivers it. Returns, per scope in the given order, how many it delivered, the
 * candidates it was never offered, and whether it delivered more than the first round's even split.
 */
export async function shareCap<T>(
  scopes: SharedScope<T>[], cap: number,
): Promise<{ delivered: number; rest: T[]; favoured: boolean }[]> {
  const turn = scopes.map((_, at) => at).sort((left, right) => (
    (scopes[left]!.favouredAt ?? Number.NEGATIVE_INFINITY) - (scopes[right]!.favouredAt ?? Number.NEGATIVE_INFINITY)
    || left - right
  ))
  const rest: T[][] = scopes.map(() => [])
  const delivered = scopes.map(() => 0)
  const even = scopes.length === 0 ? 0 : Math.floor(cap / scopes.length)
  let remaining = cap
  let open = turn
  for (let round = 0; round === 0 || (open.length > 0 && remaining > 0); round += 1) {
    const base = Math.floor(remaining / Math.max(1, open.length))
    let odd = remaining - base * open.length
    for (const at of open) {
      if (round === 0) rest[at] = await scopes[at]!.candidates()
      const share = base + (odd > 0 ? 1 : 0)
      odd = Math.max(0, odd - 1)
      if (share === 0 || rest[at]!.length === 0) continue
      const added = scopes[at]!.deliver(rest[at]!.splice(0, share))
      delivered[at] = delivered[at]! + added
      remaining -= added
    }
    open = turn.filter((at) => rest[at]!.length > 0)
  }
  return scopes.map((_, at) => ({ delivered: delivered[at]!, rest: rest[at]!, favoured: delivered[at]! > even }))
}

/** The candidates of `pool` followed by those of `fresh`, each arXiv id once, the pool's copy kept. */
export function poolFirst<T extends { id: string }>(pool: T[], fresh: T[]): T[] {
  const seen = new Set<string>()
  return [...pool, ...fresh].filter((paper) => {
    if (seen.has(paper.id)) return false
    seen.add(paper.id)
    return true
  })
}
