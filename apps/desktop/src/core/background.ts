import type {
  AuthorCandidate, AuthorSearchFailed, DiscoveryFetchResult, InboxDownloadResult, JobsStatus, NetFailed, PaperImportResult,
  SemanticKeyCheckResult, WatchSuggestionResult,
} from '../shared/contract.js'
import { CallError } from './call-error.js'
import { createInboxDownloads } from './inbox/download.js'
import { createWatchFetcher } from './inbox/fetch.js'
import { armDiscoverySchedule, armFetchSchedule } from './inbox/schedule.js'
import { createArxiv } from './net/arxiv.js'
import type { HttpGet } from './net/http.js'
import { createRateLimitedGet, netFailure } from './net/http.js'
import { createSemanticAuthors } from './net/semantic-authors.js'
import { createArxivSuggestionSource, createWatchSuggestions } from './net/watch-suggestions.js'
import { createAuthorSearch, type ScholarSource } from './net/scholar-sources.js'
import { createSemanticPublications } from './net/semantic-metadata.js'
import { checkSemanticKey, createSemanticSearch } from './net/semantic-search.js'
import { isUnopenedStore } from './unopened-store.js'
import { createMetadataQueue, fillPublications, type PdfProbe } from './paper-library/index.js'
import {
  createArxivRecommendations, createFallbackRecommendations, createRecommendationService,
  createSemanticRecommendations, createSemanticScholar,
} from './recommendation/index.js'
import type { VaultStore } from './vault.js'

export type Background = {
  importPaper(filename: string, bytes: Uint8Array): PaperImportResult
  /** Parses the metadata of paper `paperId` again (MetadataQueue retry). */
  retryMetadata(paperId: string): void
  /**
   * Fills the publication venue and year of the vault's papers from Semantic Scholar (fillPublications)
   * and returns how many changed. Throws a `refused` CallError when no key is saved.
   */
  fillPublications(): Promise<number>
  downloadInbox(id: string): Promise<InboxDownloadResult>
  fetchWatches(watchIds?: string[]): Promise<void>
  searchAuthors(query: string): Promise<AuthorCandidate[] | AuthorSearchFailed>
  suggestWatches(input: { focus: string; seedTopics?: string[] }): Promise<WatchSuggestionResult | NetFailed>
  /** Runs one discovery after any discovery already running has finished. */
  fetchDiscoveries(projectId?: string, force?: boolean): Promise<DiscoveryFetchResult>
  /** One Semantic Scholar request with the saved key; fails as authentication when no key is saved. */
  checkSemanticKey(): Promise<SemanticKeyCheckResult>
  /**
   * Arms the six-hour watch schedule and the daily discovery schedule and returns their stop function;
   * arms nothing while no vault is open.
   */
  armSchedule(): () => void
  /**
   * The jobs status without the chats and Wiki proposals being generated and the failed Wiki runs,
   * which the chat service and the Harness cost gate report.
   */
  status(): Omit<JobsStatus, 'generating' | 'generatingWiki' | 'wikiFailures'>
  idle(): Promise<void>
}

const needsMetadata = (paper: PaperImportResult['paper']): boolean => (
  paper.authors === undefined || paper.year === undefined || paper.venue === ''
  || paper.identifier === undefined || paper.abstract === undefined || paper.pageCount === 0
)

/** Builds Core work that continues after the import contract call returns. */
export function createBackground(deps: {
  store: VaultStore; get: HttpGet; probe: PdfProbe; arxivIntervalMs: number
  sleep: (ms: number) => Promise<void>; now: () => number
  /** The Semantic Scholar API key to send, read on every request so a newly saved key applies at once. */
  semanticScholarApiKey?: () => string | undefined
}): Background {
  let writes = 0
  const onWrite = (): void => { writes += 1 }
  const arxiv = createArxiv({ get: deps.get, minIntervalMs: deps.arxivIntervalMs, now: deps.now, sleep: deps.sleep })
  const semanticKey = (): string | undefined => (
    deps.semanticScholarApiKey?.()?.trim() || undefined
  )
  const keyedGet: HttpGet = (url, options) => {
    const apiKey = semanticKey()
    return deps.get(url, apiKey ? { ...options, headers: { ...options.headers, 'x-api-key': apiKey } } : options)
  }
  // Semantic Scholar throttles about a quarter of keyed requests at random and sends no Retry-After,
  // so a short pause before the next request serves better than a long cooldown.
  const semanticGet = createRateLimitedGet(keyedGet, {
    minIntervalMs: 1_100, throttleCooldownMs: 2_000, sleep: deps.sleep, now: deps.now,
  })
  const scholar = createSemanticScholar({ get: semanticGet, sleep: deps.sleep, now: deps.now })
  const authors = createSemanticAuthors({ get: semanticGet, sleep: deps.sleep })
  const semanticSearch = createSemanticSearch({ get: semanticGet, sleep: deps.sleep })
  const arxivSuggestions = createArxivSuggestionSource(arxiv)
  // Semantic Scholar leads once a key is saved; arXiv needs no key and answers whenever it cannot.
  const scholarSources = (): readonly ScholarSource[] => (
    semanticKey() === undefined ? [arxivSuggestions] : [semanticSearch, arxivSuggestions]
  )
  const watchSuggestions = createWatchSuggestions({ sources: scholarSources, now: deps.now })
  const authorSearch = createAuthorSearch({ sources: () => [semanticSearch], now: deps.now })
  const semanticRecommendations = createSemanticRecommendations({ get: semanticGet, sleep: deps.sleep })
  const arxivRecommendations = createArxivRecommendations({ arxiv, now: deps.now })
  const recommendation = createRecommendationService({
    store: deps.store, onWrite, now: deps.now,
    provider: createFallbackRecommendations(() => (
      semanticKey() === undefined ? [arxivRecommendations] : [semanticRecommendations, arxivRecommendations]
    )),
  })
  const publications = createSemanticPublications({ get: semanticGet, sleep: deps.sleep })
  const metadata = createMetadataQueue({
    store: deps.store, probe: deps.probe, provider: arxiv, onWrite,
    publications: () => (semanticKey() === undefined ? undefined : publications),
  })
  const downloads = createInboxDownloads({ store: deps.store, get: deps.get, probe: deps.probe, onWrite })
  const fetcher = createWatchFetcher({
    store: deps.store, arxiv, scholar, now: deps.now, onWrite,
    authorPapers: (identity) => authors.papers(identity.id),
  })
  let discoveryTail: Promise<unknown> = Promise.resolve()
  let discovering = 0
  const fetchDiscoveries = async (projectId?: string, force?: boolean): Promise<DiscoveryFetchResult> => {
    discovering += 1
    const run = discoveryTail.then(() => recommendation.discover(projectId, force)).finally(() => { discovering -= 1 })
    discoveryTail = run.catch(() => undefined)
    const result = await run
    if (result.added > 0) {
      deps.store.appendFeed({
        source: 'inbox',
        body: {
          kind: 'runs',
          runs: [
            { kind: 'text', text: '发现：' },
            { kind: 'strong', text: `${result.added} 篇新论文推荐` },
            { kind: 'text', text: `（${result.projects} 个项目）。` },
          ],
        },
      })
      onWrite()
    }
    return result
  }
  return {
    importPaper(filename, bytes) {
      const result = deps.store.importPaper(filename, bytes)
      if (result.kind === 'added' || needsMetadata(result.paper)) {
        metadata.enqueueUpload(result.paper.id, filename, bytes)
      }
      return result
    },
    retryMetadata: (paperId) => metadata.retry(paperId),
    async fillPublications() {
      if (semanticKey() === undefined) throw new CallError('refused', '还没有保存 Semantic Scholar key')
      const updated = await fillPublications(deps.store, publications)
      if (updated > 0) onWrite()
      return updated
    },
    downloadInbox: (id) => downloads.download(id),
    fetchWatches: (watchIds) => fetcher.run(watchIds),
    async searchAuthors(query) {
      if (semanticKey() === undefined) return { kind: 'failed', reason: 'no-key' }
      try {
        return await authorSearch.search(query)
      } catch (error) {
        return { kind: 'failed', reason: netFailure(error) }
      }
    },
    async suggestWatches(input) {
      try {
        return await watchSuggestions.suggest(input)
      } catch (error) {
        return { kind: 'failed', reason: netFailure(error) }
      }
    },
    fetchDiscoveries,
    checkSemanticKey: () => (semanticKey() === undefined
      ? Promise.resolve({ state: 'failed', reason: 'authentication', detail: '还没有保存 key' })
      : checkSemanticKey(semanticGet)),
    armSchedule() {
      if (isUnopenedStore(deps.store)) return () => {}
      const stopWatches = armFetchSchedule(fetcher, deps.now)
      const stopDiscovery = armDiscoverySchedule({
        running: () => discovering > 0,
        refreshedAt: () => deps.store.listDiscoveryProfiles()
          .filter((profile) => profile.seedCount + profile.positiveCount > 0 && profile.intentCount > 0)
          .map((profile) => profile.lastFetchedAt),
        run: () => fetchDiscoveries().catch((error: unknown) => {
          console.error(`[discovery] scheduled discovery refresh failed: ${error instanceof Error ? error.message : String(error)}`)
        }),
      }, deps.now)
      return () => {
        stopWatches()
        stopDiscovery()
      }
    },
    status: () => ({
      writes,
      uploads: metadata.uploads(),
      downloads: downloads.progress(),
      fetch: fetcher.status(),
    }),
    idle: () => metadata.idle(),
  }
}
