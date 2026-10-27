import type { AuthorIdentity, FeedRun, FetchStatus, NetFailure } from '../../shared/contract.js'
import { WATCH_BATCH, watchQuery, type Arxiv } from '../net/arxiv.js'
import { netFailure } from '../net/http.js'
import type { RemotePaper } from '../net/arxiv.js'
import type { VaultStore } from '../vault.js'
import { DEFAULT_DELIVERY_SETTINGS } from '../../shared/contract.js'
import {
  POOL_LIMIT, SCORE_THRESHOLD, batchIdOf, logFeedMeasures, poolFirst, rankedPaper, scoringBackground, selectShown, shareCap, textCollector,
  trainingExamples, type DiscoveryPaper, type ScholarlyMetadata, type Scorer, type ScopeRanking, type TrainingExample,
} from '../recommendation/index.js'

export type WatchFetcher = { run(watchIds?: string[]): Promise<void>; status(): FetchStatus }

/** Most arXiv pages one run reads for a watch: as many papers as its pool keeps. */
export const MAX_WATCH_PAGES = 3

/** Fewest positive examples a watch needs before its model, not its keyword match, ranks its papers. */
export const WATCH_MODEL_POSITIVES = 3

const arxivBatchId = (paper: { id: string }): string => batchIdOf(undefined, paper.id)

/**
 * Builds the serialized arXiv fetcher for all active watches or a selected subset. A run queries every
 * watch it covers and spreads the delivery cap over them; the papers a watch did not deliver, beyond its
 * share or below its scope's cut, stay in its pool and are offered first by its next run, except those
 * the feed would no longer deliver as new cards. A watch with WATCH_MODEL_POSITIVES positive examples
 * ranks its papers and cards by `scorer`'s model, offers them by score and pools only those that pass
 * the threshold; any other ranks by its keyword match. An arXiv watch that has fetched before
 * reads page after page of its newest papers, until a page holds a paper from the newest page it
 * fetched last, falls short of WATCH_BATCH, or MAX_WATCH_PAGES are read.
 */
export function createWatchFetcher(deps: {
  store: VaultStore; arxiv: Pick<Arxiv, 'search'>; scholar?: ScholarlyMetadata; scorer: Scorer
  /** Papers by an author with a saved Semantic Scholar identity; other author watches search arXiv by name. */
  authorPapers?: (identity: AuthorIdentity) => Promise<RemotePaper[]>
  now: () => number; onWrite: () => void
}): WatchFetcher {
  let tail: Promise<void> = Promise.resolve()
  let pending = 0
  let reason: NetFailure | null = null
  let last: FetchStatus['last']

  const searchPages = async (query: string, seen: ReadonlySet<string>): Promise<RemotePaper[]> => {
    const found: RemotePaper[] = []
    for (let page = 0; page < MAX_WATCH_PAGES; page += 1) {
      const batch = await deps.arxiv.search(query, page * WATCH_BATCH)
      found.push(...batch)
      if (seen.size === 0 || batch.length < WATCH_BATCH || batch.some((paper) => seen.has(paper.id))) break
    }
    return found
  }

  /** How `watch`'s model, fitted on `examples`, ranks `found` and the watch's cards. */
  const watchRanking = async (watchId: string, examples: TrainingExample[], found: DiscoveryPaper[]): Promise<ScopeRanking> => {
    const group = `watch:${watchId}`
    const { papers, text } = textCollector()
    for (const paper of found) text(arxivBatchId(paper), paper.title, paper.abstract)
    const cards = deps.store.scopeCards({ kind: 'watch', id: watchId })
    for (const card of cards) text(card.paperId, card.title, card.abstract)
    const positives = examples.filter((example) => example.positive).map((example) => example.paperId)
    for (const [paperId, paper] of deps.store.knownPapers(examples.map((example) => example.paperId))) text(paperId, paper.title, paper.abstract)
    const scores = await deps.scorer.score({
      groups: [{
        id: group, scopes: [{ key: group, examples, prior: positives, retrieved: found.map(arxivBatchId) }],
        items: [...new Set([...found.map(arxivBatchId), ...cards.map((card) => card.paperId)])],
      }],
      papers,
      background: scoringBackground(deps.store, new Set([group]), text),
    })
    const shown = deps.store.deliverySettings().maxShownPerScope ?? DEFAULT_DELIVERY_SETTINGS.maxShownPerScope
    return {
      scoreOf(paperId) {
        const score = scores.scoreOf(group, paperId)
        return score === undefined ? undefined : { relevance: score.score, path: score.path, reasons: [] }
      },
      shown: (candidates) => new Set(selectShown(candidates.map(({ paperId, relevance }) => ({
        paperId, score: scores.scoreOf(group, paperId)?.score ?? relevance, direction: group,
      })), [{ id: group, core: true }], shown, scores.similarity)),
    }
  }

  const fetchWatches = async (watchIds: string[] | undefined): Promise<void> => {
    const watches = deps.store.listWatches()
      .filter((watch) => watch.active && (watchIds === undefined || watchIds.includes(watch.id)))
    const batches: { at: number; watch: (typeof watches)[number]; found: RemotePaper[] }[] = []
    const counts = new Map<string, { name: string; added: number }>()
    let failure: NetFailure | null = null
    const progress = watches.map((watch) => deps.store.refreshProgress({ kind: 'watch', id: watch.id }))
    const newest = progress.map((held) => held.newest)
    const offered = watches.map((): DiscoveryPaper[] => [])
    const examples = watches.map((watch) => trainingExamples({ kind: 'watch', watchId: watch.id }, deps.store))
    const rankings: (ScopeRanking | undefined)[] = watches.map(() => undefined)
    const scoreOf = (at: number, paper: { id: string }): number => (
      rankings[at]?.scoreOf(arxivBatchId(paper))?.relevance ?? Number.NEGATIVE_INFINITY
    )
    const shares = await shareCap(watches.map((watch, at) => ({
      favouredAt: progress[at]!.favouredAt,
      candidates: async (): Promise<DiscoveryPaper[]> => {
        const pooled = deps.store.undelivered(progress[at]!.candidates)
        let candidates = pooled
        try {
          const found = watch.type === 'author' && watch.identity?.source === 'semantic-scholar' && deps.authorPapers !== undefined
            ? await deps.authorPapers(watch.identity)
            : await searchPages(watchQuery(watch), new Set(progress[at]!.newest))
          newest[at] = found.slice(0, WATCH_BATCH).map((paper) => paper.id)
          candidates = poolFirst(pooled, found.map((paper) => ({ ...rankedPaper(watch, paper), semanticId: '' })))
        } catch (caught) {
          failure ??= netFailure(caught)
        }
        if (examples[at]!.filter((example) => example.positive).length < WATCH_MODEL_POSITIVES) return candidates
        rankings[at] = await watchRanking(watch.id, examples[at]!, candidates)
        return candidates.map((paper, order) => ({ paper, order, score: scoreOf(at, paper) }))
          .sort((left, right) => right.score - left.score || left.order - right.order).map(({ paper }) => paper)
      },
      deliver: (batch: DiscoveryPaper[]) => {
        offered[at]!.push(...batch)
        const added = deps.store.addInboxEntries(watch.id, batch, batch.length, rankings[at])
        if (added.length > 0) {
          const ids = new Set(added)
          batches.push({ at, watch, found: batch.filter((paper) => ids.has(paper.id)) })
          counts.set(watch.id, { name: watch.name, added: (counts.get(watch.id)?.added ?? 0) + added.length })
          // Publish each watch as soon as arXiv returns; impact enrichment must not gate visibility.
          deps.onWrite()
        }
        return added.length
      },
    })), deps.store.deliverySettings().maxItemsPerRun)
    for (const [at, watch] of watches.entries()) {
      const { delivered, rest, favoured } = shares[at]!
      const pool = [...deps.store.undelivered(offered[at]!), ...rest]
        .filter((paper) => rankings[at] === undefined || scoreOf(at, paper) >= SCORE_THRESHOLD).slice(0, POOL_LIMIT)
      const held = progress[at]!
      if (delivered === 0 && pool.length === held.candidates.length
        && pool.every((paper, index) => paper.id === held.candidates[index]!.id)
        && newest[at]!.join('\n') === held.newest.join('\n')) continue
      deps.store.setRefreshProgress({ kind: 'watch', id: watch.id }, {
        steps: held.steps, candidates: pool, favouredAt: favoured ? deps.now() : held.favouredAt, newest: newest[at]!,
        poolStalled: held.poolStalled,
      })
    }
    const arxivIds = [...new Set(batches.flatMap((batch) => batch.found.map((paper) => paper.id)))]
    const impact = arxivIds.length === 0
      ? new Map()
      : await deps.scholar?.lookup(arxivIds).catch(() => new Map())
    for (const { at, watch, found } of batches) {
      const enriched = found.map((paper) => {
        const next = rankedPaper(watch, paper, impact?.get(paper.id))
        const score = rankings[at]?.scoreOf(arxivBatchId(paper))
        return score === undefined || next.ranking === undefined ? next : { ...next, ranking: { ...next.ranking, relevance: score.relevance } }
      })
      if (deps.store.updateInboxEntries(watch.id, enriched) > 0) deps.onWrite()
    }
    for (const watch of watches) logFeedMeasures(`watch:${watch.id}`, deps.store.scopeSignals({ kind: 'watch', id: watch.id }).cards, [])
    reason = failure
    const total = [...counts.values()].reduce((sum, count) => sum + count.added, 0)
    last = { watches: watchIds ?? null, added: total, at: deps.now() }
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
      ...(last === undefined ? {} : { last: structuredClone(last) }),
    }),
  }
}
