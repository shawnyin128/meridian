import type { AuthorCandidate } from '../../shared/contract.js'
import { getWithRetry, requestWithRetry, type HttpGet } from './http.js'
import type { ScholarAuthor, ScholarSource, SearchPaper } from './scholar-sources.js'

const API = 'https://api.semanticscholar.org/graph/v1'
const PAPER_FIELDS = ['paperId', 'title', 'year', 'authors', 'citationCount', 'influentialCitationCount'].join(',')
const AUTHOR_FIELDS = ['name', 'affiliations', 'paperCount', 'citationCount', 'hIndex'].join(',')
const TIMEOUT_MS = 10_000
// Someone is waiting on these answers and OpenAlex can give them, so they skip a queue this long.
const MAX_QUEUE_MS = 3_000
const PAPER_LIMIT = 50
const AUTHOR_SEARCH_LIMIT = 10
const AUTHOR_BATCH_LIMIT = 50
const AFFILIATION_LIMIT = 2

export const semanticPaperSearchUrl = (query: string, sinceYear: number): string => `${API}/paper/search?${new URLSearchParams({
  query, year: `${sinceYear}-`, limit: String(PAPER_LIMIT), fields: PAPER_FIELDS,
}).toString()}`

export const semanticAuthorBatchUrl = (): string => `${API}/author/batch?${new URLSearchParams({
  fields: AUTHOR_FIELDS,
}).toString()}`

export const semanticAuthorSearchUrl = (query: string): string => `${API}/author/search?${new URLSearchParams({
  query, limit: String(AUTHOR_SEARCH_LIMIT), fields: AUTHOR_FIELDS,
}).toString()}`

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const count = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
)
const rowsIn = (value: unknown): Record<string, unknown>[] => (
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object') : []
)

const dataOf = (body: Uint8Array, message: string): Record<string, unknown>[] => {
  const decoded: unknown = JSON.parse(new TextDecoder().decode(body))
  const data = decoded !== null && typeof decoded === 'object' ? (decoded as { data?: unknown }).data : undefined
  if (!Array.isArray(data)) throw new Error(message)
  return rowsIn(data)
}

/** Projects a Semantic Scholar paper search into the papers topic and author ranking read. */
export function parseSemanticPapers(body: Uint8Array): SearchPaper[] {
  return dataOf(body, 'Semantic Scholar 返回了无法识别的论文结果').flatMap((row) => {
    const title = text(row['title'])
    if (title === '') return []
    const year = row['year']
    return [{
      title,
      year: typeof year === 'number' && Number.isInteger(year) && year > 0 ? year : null,
      authors: rowsIn(row['authors']).flatMap((author) => {
        const id = text(author['authorId'])
        const name = text(author['name'])
        return id === '' || name === '' ? [] : [{ id, name }]
      }),
      citationCount: count(row['citationCount']),
      influentialCitationCount: count(row['influentialCitationCount']),
    }]
  })
}

const authorOf = (row: Record<string, unknown>): AuthorCandidate[] => {
  const id = text(row['authorId'])
  const name = text(row['name'])
  if (id === '' || name === '') return []
  const affiliations = Array.isArray(row['affiliations'])
    ? [...new Set(row['affiliations'].map(text).filter(Boolean))].slice(0, AFFILIATION_LIMIT) : []
  return [{
    source: 'semantic-scholar', id, name, affiliations,
    paperCount: count(row['paperCount']),
    citationCount: count(row['citationCount']),
    hIndex: count(row['hIndex']),
  }]
}

/** Projects a Semantic Scholar author search into author candidates. */
export function parseSemanticAuthorSearch(body: Uint8Array): AuthorCandidate[] {
  return dataOf(body, 'Semantic Scholar 返回了无法识别的作者结果').flatMap(authorOf)
}

/** Projects an author-batch response, whose unknown ids come back as null, into author candidates. */
export function parseSemanticAuthorBatch(body: Uint8Array): AuthorCandidate[] {
  const decoded: unknown = JSON.parse(new TextDecoder().decode(body))
  if (!Array.isArray(decoded)) throw new Error('Semantic Scholar 返回了无法识别的作者结果')
  return rowsIn(decoded).flatMap(authorOf)
}

/**
 * Paper search, author impact lookup and author search backed by the Semantic Scholar Graph API.
 * It reports no activity year, so ranking judges activity from the searched papers.
 */
export function createSemanticSearch(deps: {
  get: HttpGet
  sleep: (ms: number) => Promise<void>
}): ScholarSource {
  // One attempt only: OpenAlex answers when this fails, sooner than waiting out a rate limit.
  const policy = {
    timeoutMs: TIMEOUT_MS, maxQueueMs: MAX_QUEUE_MS, tries: 1, backoffMs: 0, limit: 8 * 1024 * 1024, sleep: deps.sleep,
  }
  return {
    name: 'semantic-scholar',
    async searchPapers(query, sinceYear) {
      return parseSemanticPapers(await getWithRetry(deps.get, semanticPaperSearchUrl(query, sinceYear), policy))
    },
    async authorImpacts(ids): Promise<ScholarAuthor[]> {
      const batch = ids.slice(0, AUTHOR_BATCH_LIMIT)
      if (batch.length === 0) return []
      const body = await requestWithRetry(deps.get, semanticAuthorBatchUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: batch }),
      }, policy)
      return parseSemanticAuthorBatch(body).map((candidate) => ({ candidate, activeYear: null }))
    },
    async searchAuthors(query) {
      return parseSemanticAuthorSearch(await getWithRetry(deps.get, semanticAuthorSearchUrl(query), policy))
    },
  }
}
