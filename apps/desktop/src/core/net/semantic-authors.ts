import type { AuthorCandidate } from '../../shared/contract.js'
import type { RemotePaper } from './arxiv.js'
import { getWithRetry, type HttpGet } from './http.js'

const SEARCH_FIELDS = ['name', 'affiliations', 'paperCount', 'citationCount', 'hIndex'].join(',')
const PAPER_FIELDS = [
  'paperId', 'title', 'abstract', 'authors', 'venue', 'publicationDate', 'year',
  'citationCount', 'influentialCitationCount', 'externalIds', 'publicationTypes',
].join(',')
const TIMEOUT_MS = 10_000
const SEARCH_LIMIT = 10
const PAPER_SCAN_LIMIT = 100
const RESULT_LIMIT = 20
const SEARCH_CACHE_MS = 24 * 60 * 60 * 1_000

export const semanticAuthorSearchUrl = (query: string): string =>
  `https://api.semanticscholar.org/graph/v1/author/search?${new URLSearchParams({
    query, limit: String(SEARCH_LIMIT), fields: SEARCH_FIELDS,
  }).toString()}`

export const semanticAuthorPapersUrl = (authorId: string): string =>
  `https://api.semanticscholar.org/graph/v1/author/${encodeURIComponent(authorId)}/papers?${new URLSearchParams({
    limit: String(PAPER_SCAN_LIMIT), fields: PAPER_FIELDS,
  }).toString()}`

export type SemanticAuthors = {
  search(query: string): Promise<AuthorCandidate[]>
  papers(authorId: string): Promise<RemotePaper[]>
}

type ApiPaper = {
  title?: unknown
  abstract?: unknown
  authors?: unknown
  venue?: unknown
  publicationDate?: unknown
  year?: unknown
  citationCount?: unknown
  influentialCitationCount?: unknown
  externalIds?: { ArXiv?: unknown } | null
  publicationTypes?: unknown
}

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const count = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
)

const rowsOf = (body: Uint8Array, message: string): unknown[] => {
  const decoded: unknown = JSON.parse(new TextDecoder().decode(body))
  if (decoded === null || typeof decoded !== 'object'
    || !Array.isArray((decoded as { data?: unknown }).data)) throw new Error(message)
  return (decoded as { data: unknown[] }).data
}

/** Filters the loose network payload into the small author identity picker contract. */
export function parseAuthorCandidates(body: Uint8Array): AuthorCandidate[] {
  return rowsOf(body, 'Semantic Scholar 返回了无法识别的作者结果').flatMap((item) => {
    if (item === null || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const id = text(row['authorId'])
    const name = text(row['name'])
    if (id === '' || name === '') return []
    const affiliations = Array.isArray(row['affiliations'])
      ? [...new Set(row['affiliations'].map(text).filter(Boolean))] : []
    return [{
      id, name, affiliations,
      paperCount: count(row['paperCount']),
      citationCount: count(row['citationCount']),
      hIndex: count(row['hIndex']),
    }]
  })
}

const submittedOf = (paper: ApiPaper): string => {
  const date = text(paper.publicationDate)
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  return typeof paper.year === 'number' && Number.isInteger(paper.year)
    ? `${String(paper.year).padStart(4, '0')}-01-01` : '1970-01-01'
}

const reviewedTypes = new Set(['Conference', 'JournalArticle', 'Review', 'Book', 'BookSection'])

/** Converts an author's paper page into the arXiv-downloadable projection used by the inbox. */
export function parseAuthorPapers(body: Uint8Array): RemotePaper[] {
  const parsed = rowsOf(body, 'Semantic Scholar 返回了无法识别的作者论文结果')
    .flatMap((item) => {
      if (item === null || typeof item !== 'object') return []
      const paper = item as ApiPaper
      const id = text(paper.externalIds?.ArXiv).replace(/v\d+$/, '')
      const title = text(paper.title)
      if (id === '' || title === '') return []
      const submitted = submittedOf(paper)
      const venue = text(paper.venue)
      const types = Array.isArray(paper.publicationTypes)
        ? paper.publicationTypes.filter((type): type is string => typeof type === 'string') : []
      const authors = Array.isArray(paper.authors)
        ? paper.authors.flatMap((author) => {
          if (author === null || typeof author !== 'object') return []
          const name = text((author as { name?: unknown }).name)
          return name === '' ? [] : [name]
        }) : []
      return [{
        id, title, authors, abstract: text(paper.abstract), submitted,
        journalRef: venue === '' ? null : venue,
        pdf: `https://arxiv.org/pdf/${encodeURIComponent(id)}`,
        ranking: {
          relevance: 1,
          published: types.some((type) => reviewedTypes.has(type))
            || (venue !== '' && !/^arxiv$/i.test(venue)),
          citationCount: count(paper.citationCount),
          influentialCitationCount: count(paper.influentialCitationCount),
          submitted,
        },
      } satisfies RemotePaper]
    })
    .sort((a, b) => b.submitted.localeCompare(a.submitted))
  const seen = new Set<string>()
  return parsed.filter((paper) => {
    if (seen.has(paper.id)) return false
    seen.add(paper.id)
    return true
  }).slice(0, RESULT_LIMIT)
}

/** Stable author lookup and author-id paper retrieval backed by Semantic Scholar Graph API. */
export function createSemanticAuthors(deps: {
  get: HttpGet
  sleep: (ms: number) => Promise<void>
  now?: () => number
  searchCacheMs?: number
}): SemanticAuthors {
  const cache = new Map<string, { at: number; value: AuthorCandidate[] }>()
  const pending = new Map<string, Promise<AuthorCandidate[]>>()
  const policy = {
    timeoutMs: TIMEOUT_MS, tries: 2, backoffMs: 1_000,
    limit: 6 * 1024 * 1024, sleep: deps.sleep,
  }
  return {
    search(query) {
      const key = query.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
      const now = (deps.now ?? Date.now)()
      const held = cache.get(key)
      if (held !== undefined && now - held.at < (deps.searchCacheMs ?? SEARCH_CACHE_MS)) {
        return Promise.resolve(structuredClone(held.value))
      }
      const running = pending.get(key)
      if (running !== undefined) return running.then((value) => structuredClone(value))
      const request = getWithRetry(deps.get, semanticAuthorSearchUrl(query), policy)
        .then(parseAuthorCandidates)
        .then((value) => {
          cache.set(key, { at: (deps.now ?? Date.now)(), value: structuredClone(value) })
          return value
        })
        .finally(() => pending.delete(key))
      pending.set(key, request)
      return request.then((value) => structuredClone(value))
    },
    async papers(authorId) {
      const body = await getWithRetry(deps.get, semanticAuthorPapersUrl(authorId), policy)
      return parseAuthorPapers(body)
    },
  }
}
