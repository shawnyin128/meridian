import type {
  AuthorCandidate, DiscoveryFetchResult, InboxDownloadResult, JobsStatus, PaperImportResult,
  WatchSuggestionResult,
} from '../shared/contract.js'
import { createInboxDownloads } from './inbox/download.js'
import { createWatchFetcher } from './inbox/fetch.js'
import { armFetchSchedule } from './inbox/schedule.js'
import { createArxiv } from './net/arxiv.js'
import type { HttpGet } from './net/http.js'
import { createRateLimitedGet, HttpStatusError, netReason } from './net/http.js'
import { createSemanticAuthors } from './net/semantic-authors.js'
import { createWatchSuggestions } from './net/watch-suggestions.js'
import { createOpenAlex } from './net/openalex.js'
import { createMetadataQueue, type PdfProbe } from './paper-library/index.js'
import {
  createRecommendationService, createSemanticRecommendations, createSemanticScholar,
} from './recommendation/index.js'
import type { VaultStore } from './vault.js'

export type Background = {
  importPaper(filename: string, bytes: Uint8Array): PaperImportResult
  downloadInbox(id: string): Promise<InboxDownloadResult>
  fetchWatches(watchIds?: string[]): Promise<void>
  searchAuthors(query: string): Promise<AuthorCandidate[]>
  suggestWatches(input: { focus: string; seedTopics?: string[] }): Promise<WatchSuggestionResult>
  fetchDiscoveries(projectId?: string, force?: boolean): Promise<DiscoveryFetchResult>
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
  const keyedGet: HttpGet = (url, options) => {
    const apiKey = deps.semanticScholarApiKey?.()?.trim() || process.env['SEMANTIC_SCHOLAR_API_KEY']?.trim()
    return deps.get(url, apiKey ? { ...options, headers: { ...options.headers, 'x-api-key': apiKey } } : options)
  }
  const semanticGet = createRateLimitedGet(keyedGet, { minIntervalMs: 1_100, sleep: deps.sleep, now: deps.now })
  const scholar = createSemanticScholar({ get: semanticGet, sleep: deps.sleep, now: deps.now })
  const authors = createSemanticAuthors({ get: semanticGet, sleep: deps.sleep })
  // OpenAlex needs no key, so watch suggestions and author search work out of the box.
  const openAlex = createOpenAlex({ get: deps.get, sleep: deps.sleep, now: deps.now })
  const watchSuggestions = createWatchSuggestions({ source: openAlex, now: deps.now })
  const recommendations = createSemanticRecommendations({ get: semanticGet, sleep: deps.sleep })
  const recommendation = createRecommendationService({
    store: deps.store, provider: recommendations, onWrite, now: deps.now,
  })
  const metadata = createMetadataQueue({ store: deps.store, probe: deps.probe, provider: arxiv, onWrite })
  const downloads = createInboxDownloads({ store: deps.store, get: deps.get, onWrite })
  const fetcher = createWatchFetcher({
    store: deps.store, arxiv, scholar, now: deps.now, onWrite,
    authorPapers: (identity) => (identity.source === 'openalex'
      ? openAlex.authorWorks(identity.id) : authors.papers(identity.id)),
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
      try {
        return await openAlex.searchAuthors(query)
      } catch (error) {
        if (error instanceof HttpStatusError && error.status === 429) {
          throw new Error('OpenAlex 正在限流，请稍后重试；也可以先按姓名保存为未确认作者')
        }
        throw new Error(`没能搜索作者:${netReason(error)}`)
      }
    },
    async suggestWatches(input) {
      try {
        return await watchSuggestions.suggest(input)
      } catch (error) {
        if (error instanceof HttpStatusError && error.status === 429) {
          throw new Error('OpenAlex 正在限流，请稍后重试')
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
