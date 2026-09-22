import type { AuthorCandidate } from '../../shared/contract.js'
import type { RemotePaper } from './arxiv.js'
import { getWithRetry, type HttpGet } from './http.js'

const API = 'https://api.openalex.org'
const AUTHOR_FIELDS = ['id', 'display_name', 'works_count', 'cited_by_count', 'summary_stats', 'last_known_institutions'].join(',')
const SEARCH_WORK_FIELDS = ['id', 'title', 'authorships', 'cited_by_count'].join(',')
const AUTHOR_WORK_FIELDS = [
  'id', 'title', 'authorships', 'abstract_inverted_index', 'publication_date', 'cited_by_count', 'ids',
  'locations', 'type',
].join(',')
// OpenAlex search often takes several seconds, well past what Semantic Scholar needed.
const TIMEOUT_MS = 20_000
const PAPER_LIMIT = 24
const AUTHOR_SEARCH_LIMIT = 10
const AUTHOR_BATCH_LIMIT = 30
const AUTHOR_WORK_SCAN_LIMIT = 100
const AUTHOR_WORK_LIMIT = 20
const AUTHOR_SEARCH_CACHE_MS = 24 * 60 * 60 * 1_000

export const openAlexWorkSearchUrl = (query: string): string => `${API}/works?${new URLSearchParams({
  search: query, 'per-page': String(PAPER_LIMIT), select: SEARCH_WORK_FIELDS,
}).toString()}`

export const openAlexAuthorBatchUrl = (ids: readonly string[]): string => `${API}/authors?${new URLSearchParams({
  filter: `openalex:${ids.join('|')}`, 'per-page': String(ids.length), select: AUTHOR_FIELDS,
}).toString()}`

export const openAlexAuthorSearchUrl = (query: string): string => `${API}/authors?${new URLSearchParams({
  search: query, 'per-page': String(AUTHOR_SEARCH_LIMIT), select: AUTHOR_FIELDS,
}).toString()}`

export const openAlexAuthorWorksUrl = (authorId: string): string => `${API}/works?${new URLSearchParams({
  filter: `author.id:${authorId}`, sort: 'publication_date:desc',
  'per-page': String(AUTHOR_WORK_SCAN_LIMIT), select: AUTHOR_WORK_FIELDS,
}).toString()}`

/** A searched paper reduced to what topic and author ranking read. */
export type SearchPaper = {
  title: string
  authors: { id: string; name: string }[]
  citationCount: number
  influentialCitationCount: number
}

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const count = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
)
/** OpenAlex returns ids as URLs; the bare key such as A5070926896 is what filters accept. */
const shortId = (value: unknown): string => text(value).replace(/^https:\/\/openalex\.org\//, '')

const resultsOf = (body: Uint8Array, message: string): Record<string, unknown>[] => {
  const decoded: unknown = JSON.parse(new TextDecoder().decode(body))
  const results = decoded !== null && typeof decoded === 'object'
    ? (decoded as { results?: unknown }).results : undefined
  if (!Array.isArray(results)) throw new Error(message)
  return results.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
}

const authorsOf = (row: Record<string, unknown>): { id: string; name: string }[] => (
  Array.isArray(row['authorships']) ? row['authorships'].flatMap((authorship) => {
    const author = (authorship as { author?: unknown } | null)?.author
    if (author === null || typeof author !== 'object') return []
    const id = shortId((author as { id?: unknown }).id)
    const name = text((author as { display_name?: unknown }).display_name)
    return id === '' || name === '' ? [] : [{ id, name }]
  }) : []
)

/** Projects an OpenAlex work search into the papers topic and author ranking read. */
export function parseOpenAlexWorks(body: Uint8Array): SearchPaper[] {
  return resultsOf(body, 'OpenAlex 返回了无法识别的论文结果').flatMap((row) => {
    const title = text(row['title'])
    return title === '' ? [] : [{
      title, authors: authorsOf(row), citationCount: count(row['cited_by_count']), influentialCitationCount: 0,
    }]
  })
}

/** Projects OpenAlex author records into author candidates with public impact metadata. */
export function parseOpenAlexAuthors(body: Uint8Array): AuthorCandidate[] {
  return resultsOf(body, 'OpenAlex 返回了无法识别的作者结果').flatMap((row) => {
    const id = shortId(row['id'])
    const name = text(row['display_name'])
    if (id === '' || name === '') return []
    const institutions = Array.isArray(row['last_known_institutions']) ? row['last_known_institutions'] : []
    const affiliations = [...new Set(institutions.map((institution) => (
      text((institution as { display_name?: unknown } | null)?.display_name)
    )).filter(Boolean))]
    const stats = row['summary_stats'] as { h_index?: unknown } | null | undefined
    return [{
      source: 'openalex' as const, id, name, affiliations,
      paperCount: count(row['works_count']),
      citationCount: count(row['cited_by_count']),
      hIndex: count(stats?.h_index),
    }]
  })
}

const ARXIV_ID = /(\d{4}\.\d{4,5})(?:v\d+)?$/

/** The arXiv id of a work, from its arXiv DOI or an arXiv landing page, or '' when it has none. */
function arxivIdOf(row: Record<string, unknown>): string {
  const doi = text((row['ids'] as { doi?: unknown } | null | undefined)?.doi).toLowerCase()
  const fromDoi = /10\.48550\/arxiv\.(\d{4}\.\d{4,5})/.exec(doi)?.[1]
  if (fromDoi !== undefined) return fromDoi
  const locations = Array.isArray(row['locations']) ? row['locations'] : []
  for (const location of locations) {
    const url = text((location as { landing_page_url?: unknown } | null)?.landing_page_url)
    if (/arxiv\.org\/abs\//i.test(url)) {
      const id = ARXIV_ID.exec(url)?.[1]
      if (id !== undefined) return id
    }
  }
  return ''
}

/** Rebuilds an abstract from OpenAlex's word-to-positions index. */
function abstractOf(index: unknown): string {
  if (index === null || typeof index !== 'object') return ''
  const words: string[] = []
  for (const [word, positions] of Object.entries(index as Record<string, unknown>)) {
    if (!Array.isArray(positions)) continue
    for (const position of positions) if (typeof position === 'number') words[position] = word
  }
  return words.filter((word) => word !== undefined).join(' ')
}

/** Converts an author's works into the arXiv-downloadable projection used by the inbox, newest first. */
export function parseOpenAlexAuthorWorks(body: Uint8Array): RemotePaper[] {
  const seen = new Set<string>()
  return resultsOf(body, 'OpenAlex 返回了无法识别的作者论文结果').flatMap((row) => {
    const id = arxivIdOf(row)
    const title = text(row['title'])
    if (id === '' || title === '' || seen.has(id)) return []
    seen.add(id)
    const date = text(row['publication_date'])
    const submitted = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '1970-01-01'
    return [{
      id, title,
      authors: authorsOf(row).map((author) => author.name),
      abstract: abstractOf(row['abstract_inverted_index']),
      submitted,
      journalRef: null,
      pdf: `https://arxiv.org/pdf/${encodeURIComponent(id)}`,
      ranking: {
        relevance: 1,
        published: text(row['type']) !== 'preprint',
        citationCount: count(row['cited_by_count']),
        influentialCitationCount: 0,
        submitted,
      },
    } satisfies RemotePaper]
  }).sort((a, b) => b.submitted.localeCompare(a.submitted)).slice(0, AUTHOR_WORK_LIMIT)
}

export type OpenAlex = {
  searchPapers(query: string): Promise<SearchPaper[]>
  authorImpacts(ids: readonly string[]): Promise<AuthorCandidate[]>
  searchAuthors(query: string): Promise<AuthorCandidate[]>
  authorWorks(authorId: string): Promise<RemotePaper[]>
}

/**
 * Scholarly search, author lookup and author-id paper retrieval backed by OpenAlex, which needs no key.
 * Author search reuses a successful answer for the same name for a day and merges concurrent lookups.
 */
export function createOpenAlex(deps: {
  get: HttpGet
  sleep: (ms: number) => Promise<void>
  now?: () => number
}): OpenAlex {
  const policy = { timeoutMs: TIMEOUT_MS, tries: 2, backoffMs: 1_000, limit: 8 * 1024 * 1024, sleep: deps.sleep }
  const searched = new Map<string, { at: number; value: AuthorCandidate[] }>()
  const searching = new Map<string, Promise<AuthorCandidate[]>>()
  const now = deps.now ?? Date.now
  return {
    async searchPapers(query) {
      return parseOpenAlexWorks(await getWithRetry(deps.get, openAlexWorkSearchUrl(query), policy))
    },
    async authorImpacts(ids) {
      const batch = ids.slice(0, AUTHOR_BATCH_LIMIT)
      if (batch.length === 0) return []
      return parseOpenAlexAuthors(await getWithRetry(deps.get, openAlexAuthorBatchUrl(batch), policy))
    },
    searchAuthors(query) {
      const key = query.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
      const held = searched.get(key)
      if (held !== undefined && now() - held.at < AUTHOR_SEARCH_CACHE_MS) return Promise.resolve(structuredClone(held.value))
      const running = searching.get(key)
      if (running !== undefined) return running.then((value) => structuredClone(value))
      const request = getWithRetry(deps.get, openAlexAuthorSearchUrl(query), policy)
        .then(parseOpenAlexAuthors)
        .then((value) => {
          searched.set(key, { at: now(), value: structuredClone(value) })
          return value
        })
        .finally(() => searching.delete(key))
      searching.set(key, request)
      return request.then((value) => structuredClone(value))
    },
    async authorWorks(authorId) {
      return parseOpenAlexAuthorWorks(await getWithRetry(deps.get, openAlexAuthorWorksUrl(authorId), policy))
    },
  }
}
