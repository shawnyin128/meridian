import type { AuthorIdentity, FeedRun, FetchStatus, NetFailure } from '../../shared/contract.js'
import { watchQuery, type Arxiv } from '../net/arxiv.js'
import { netFailure } from '../net/http.js'
import type { RemotePaper } from '../net/arxiv.js'
import type { VaultStore } from '../vault.js'
import {
  POOL_LIMIT, poolFirst, rankedPaper, shareCap, type DiscoveryPaper, type ScholarlyMetadata,
} from '../recommendation/index.js'

export type WatchFetcher = { run(watchIds?: string[]): Promise<void>; status(): FetchStatus }

/**
 * Builds the serialized arXiv fetcher for all active watches or a selected subset. A run queries every
 * watch it covers and spreads the delivery cap over them; the papers a watch could not deliver within its
 * share stay in its pool and are offered first by its next run.
 */
export function createWatchFetcher(deps: {
  store: VaultStore; arxiv: Pick<Arxiv, 'search'>; scholar?: ScholarlyMetadata
  /** Papers by an author with a saved Semantic Scholar identity; other author watches search arXiv by name. */
  authorPapers?: (identity: AuthorIdentity) => Promise<RemotePaper[]>
  now: () => number; onWrite: () => void
}): WatchFetcher {
  let tail: Promise<void> = Promise.resolve()
  let pending = 0
  let reason: NetFailure | null = null

  const fetchWatches = async (watchIds: string[] | undefined): Promise<void> => {
    const watches = deps.store.listWatches()
      .filter((watch) => watch.active && (watchIds === undefined || watchIds.includes(watch.id)))
    const batches: { watch: (typeof watches)[number]; found: RemotePaper[] }[] = []
    const counts = new Map<string, { name: string; added: number }>()
    let failure: NetFailure | null = null
    const progress = watches.map((watch) => deps.store.refreshProgress({ kind: 'watch', id: watch.id }))
    const shares = await shareCap(watches.map((watch, at) => ({
      favouredAt: progress[at]!.favouredAt,
      candidates: async (): Promise<DiscoveryPaper[]> => {
        try {
          const found = watch.type === 'author' && watch.identity?.source === 'semantic-scholar' && deps.authorPapers !== undefined
            ? await deps.authorPapers(watch.identity)
            : await deps.arxiv.search(watchQuery(watch))
          return poolFirst(progress[at]!.candidates, found.map((paper) => ({ ...rankedPaper(watch, paper), semanticId: '' })))
        } catch (caught) {
          failure ??= netFailure(caught)
          return progress[at]!.candidates
        }
      },
      deliver: (batch: DiscoveryPaper[]) => {
        const added = deps.store.addInboxEntries(watch.id, batch, batch.length)
        if (added.length > 0) {
          const ids = new Set(added)
          batches.push({ watch, found: batch.filter((paper) => ids.has(paper.id)) })
          counts.set(watch.id, { name: watch.name, added: (counts.get(watch.id)?.added ?? 0) + added.length })
          // Publish each watch as soon as arXiv returns; impact enrichment must not gate visibility.
          deps.onWrite()
        }
        return added.length
      },
    })), deps.store.deliverySettings().maxItemsPerRun)
    for (const [at, watch] of watches.entries()) {
      const { delivered, rest, favoured } = shares[at]!
      const pool = rest.slice(0, POOL_LIMIT)
      const held = progress[at]!
      if (delivered === 0 && pool.length === held.candidates.length
        && pool.every((paper, index) => paper.id === held.candidates[index]!.id)) continue
      deps.store.setRefreshProgress({ kind: 'watch', id: watch.id }, {
        steps: held.steps, candidates: pool, favouredAt: favoured ? deps.now() : held.favouredAt,
      })
    }
    const arxivIds = [...new Set(batches.flatMap((batch) => batch.found.map((paper) => paper.id)))]
    const impact = arxivIds.length === 0
      ? new Map()
      : await deps.scholar?.lookup(arxivIds).catch(() => new Map())
    for (const { watch, found } of batches) {
      const ranked = found.map((paper) => rankedPaper(watch, paper, impact?.get(paper.id)))
      if (deps.store.updateInboxEntries(watch.id, ranked) > 0) deps.onWrite()
    }
    reason = failure
    const total = [...counts.values()].reduce((sum, count) => sum + count.added, 0)
    if (total > 0) {
      const runs: FeedRun[] = [
        { kind: 'text', text: '抓取：' },
        { kind: 'strong', text: `${total} 篇新论文入队` },
        { kind: 'text', text: `（${[...counts.values()].map((count) => `${count.name} ×${count.added}`).join(' · ')}）。` },
      ]
      deps.store.appendFeed({ source: 'inbox', body: { kind: 'runs', runs } })
      deps.onWrite()
    }
    if (watchIds === undefined && failure === null) {
      deps.store.setLastFetch(deps.now())
      deps.onWrite()
    }
  }

  return {
    run(watchIds) {
      pending += 1
      const next = tail.then(() => fetchWatches(watchIds)).finally(() => { pending -= 1 })
      tail = next.catch(() => undefined)
      return next
    },
    status: () => ({
      state: pending > 0 ? 'checking' : reason !== null ? 'failed' : 'idle',
      checkedAt: deps.store.lastFetch(),
      reason,
    }),
  }
}
