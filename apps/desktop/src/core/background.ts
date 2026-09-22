import type {
  AuthorCandidate, DiscoveryFetchResult, InboxDownloadResult, JobsStatus, PaperImportResult,
  SemanticKeyCheckResult, WatchSuggestionResult,
} from '../shared/contract.js'
import { createInboxDownloads } from './inbox/download.js'
import { createWatchFetcher } from './inbox/fetch.js'
import { armFetchSchedule } from './inbox/schedule.js'
import { createArxiv } from './net/arxiv.js'
import type { HttpGet } from './net/http.js'
import { createRateLimitedGet, HttpStatusError, netReason } from './net/http.js'
import { createSemanticAuthors } from './net/semantic-authors.js'
import { createArxivSuggestionSource, createWatchSuggestions } from './net/watch-suggestions.js'
import { createAuthorSearch, type ScholarSource } from './net/scholar-sources.js'
import { checkSemanticKey, createSemanticSearch } from './net/semantic-search.js'
import { createMetadataQueue, type PdfProbe } from './paper-library/index.js'
import {
  createArxivRecommendations, createFallbackRecommendations, createRecommendationService,
  createSemanticRecommendations, createSemanticScholar,
} from './recommendation/index.js'
import type { VaultStore } from './vault.js'

export type Background = {
  importPaper(filename: string, bytes: Uint8Array): PaperImportResult
  downloadInbox(id: string): Promise<InboxDownloadResult>
  fetchWatches(watchIds?: string[]): Promise<void>
  searchAuthors(query: string): Promise<AuthorCandidate[]>
  suggestWatches(input: { focus: string; seedTopics?: string[] }): Promise<WatchSuggestionResult>
  fetchDiscoveries(projectId?: string, force?: boolean): Promise<DiscoveryFetchResult>
  /** One Semantic Scholar request with the saved key; fails as authentication when no key is saved. */
  checkSemanticKey(): Promise<SemanticKeyCheckResult>
  armSchedule(): () => void
  status(): JobsStatus
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
  const metadata = createMetadataQueue({ store: deps.store, probe: deps.probe, provider: arxiv, onWrite })
  const downloads = createInboxDownloads({ store: deps.store, get: deps.get, onWrite })
  const fetcher = createWatchFetcher({
    store: deps.store, arxiv, scholar, now: deps.now, onWrite,
    authorPapers: (identity) => authors.papers(identity.id),
  })
  return {
    importPaper(filename, bytes) {
      const result = deps.store.importPaper(filename, bytes)
      if (result.kind === 'added' || needsMetadata(result.paper)) {
        metadata.enqueueUpload(result.paper.id, filename, bytes)
      }
      return result
    },
    downloadInbox: (id) => downloads.download(id),
    fetchWatches: (watchIds) => fetcher.run(watchIds),
    async searchAuthors(query) {
      if (semanticKey() === undefined) {
        throw new Error('填入 Semantic Scholar key 后才能区分同名作者；也可以先按姓名保存为未确认作者')
      }
      try {
        return await authorSearch.search(query)
      } catch (error) {
        if (error instanceof HttpStatusError && error.status === 429) {
          throw new Error('Semantic Scholar 正在限流，请稍后重试；也可以先按姓名保存为未确认作者')
        }
        throw new Error(`没能搜索作者:${netReason(error)}`)
      }
    },
    async suggestWatches(input) {
      try {
        return await watchSuggestions.suggest(input)
      } catch (error) {
        if (error instanceof HttpStatusError && error.status === 429) {
          throw new Error('论文检索正在限流，请稍后重试')
        }
        throw new Error(`没能生成关注建议:${netReason(error)}`)
      }
    },
    async fetchDiscoveries(projectId, force) {
      const result = await recommendation.discover(projectId, force)
      if (result.added > 0) {
        deps.store.appendFeed({
          source: 'inbox',
          body: {
            kind: 'runs',
            runs: [
              { kind: 'text', text: '发现:' },
              { kind: 'strong', text: `${result.added} 篇新论文推荐` },
              { kind: 'text', text: `(${result.projects} 个项目)。` },
            ],
          },
        })
        onWrite()
      }
      return result
    },
    checkSemanticKey: () => (semanticKey() === undefined
      ? Promise.resolve({ state: 'failed', reason: 'authentication', detail: '还没有保存 key' })
      : checkSemanticKey(semanticGet)),
    armSchedule: () => armFetchSchedule(fetcher, deps.now),
    status: () => ({
      writes,
      uploads: metadata.uploads(),
      downloads: downloads.progress(),
      fetch: fetcher.status(),
    }),
    idle: () => metadata.idle(),
  }
}
