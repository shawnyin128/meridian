import type { FeedRun, FetchStatus } from '../../shared/contract.js'
import { watchQuery, type Arxiv } from '../net/arxiv.js'
import { netReason } from '../net/http.js'
import type { SemanticAuthors } from '../net/semantic-authors.js'
import type { VaultStore } from '../vault.js'
import { rankedPaper, type ScholarlyMetadata } from '../recommendation/index.js'

export type WatchFetcher = { run(watchIds?: string[]): Promise<void>; status(): FetchStatus }

/** Builds the serialized arXiv fetcher for all active watches or a selected subset. */
export function createWatchFetcher(deps: {
  store: VaultStore; arxiv: Arxiv; scholar?: ScholarlyMetadata; authors?: SemanticAuthors
  now: () => number; onWrite: () => void
}): WatchFetcher {
  let tail: Promise<void> = Promise.resolve()
  let pending = 0
  let error: string | null = null

  const fetchWatches = async (watchIds: string[] | undefined): Promise<void> => {
    const watches = deps.store.listWatches()
      .filter((watch) => watch.active && (watchIds === undefined || watchIds.includes(watch.id)))
    const batches: { watch: (typeof watches)[number]; found: Awaited<ReturnType<Arxiv['search']>> }[] = []
    const counts: { name: string; added: number }[] = []
    let failure: string | null = null
    let remaining = deps.store.deliverySettings().maxItemsPerRun
    for (const watch of watches) {
      if (remaining === 0) break
      try {
        const found = watch.type === 'author' && watch.identity !== undefined && deps.authors !== undefined
          ? await deps.authors.papers(watch.identity.id)
          : await deps.arxiv.search(watchQuery(watch))
        const local = found.map((paper) => rankedPaper(watch, paper))
        const added = deps.store.addInboxEntries(watch.id, local, remaining)
        if (added.length > 0) {
          remaining -= added.length
          const ids = new Set(added)
          batches.push({ watch, found: found.filter((paper) => ids.has(paper.id)) })
          counts.push({ name: watch.name, added: added.length })
          // Publish each watch as soon as arXiv returns; impact enrichment must not gate visibility.
          deps.onWrite()
        }
      } catch (caught) {
        failure ??= netReason(caught)
      }
    }
    const arxivIds = [...new Set(batches.flatMap((batch) => batch.found.map((paper) => paper.id)))]
    const impact = arxivIds.length === 0
      ? new Map()
      : await deps.scholar?.lookup(arxivIds).catch(() => new Map())
    for (const { watch, found } of batches) {
      const ranked = found.map((paper) => rankedPaper(watch, paper, impact?.get(paper.id)))
      if (deps.store.updateInboxEntries(watch.id, ranked) > 0) deps.onWrite()
    }
    error = failure
    const total = counts.reduce((sum, count) => sum + count.added, 0)
    if (total > 0) {
      const runs: FeedRun[] = [
        { kind: 'text', text: '抓取:' },
        { kind: 'strong', text: `${total} 篇新论文入队` },
        { kind: 'text', text: `(${counts.map((count) => `${count.name} ×${count.added}`).join(' · ')})。` },
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
      state: pending > 0 ? 'checking' : error !== null ? 'failed' : 'idle',
      checkedAt: deps.store.lastFetch(),
      error,
    }),
  }
}
