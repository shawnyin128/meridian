import type { AuthorCandidate } from '../../shared/contract.js'
import type { RemotePaper } from './arxiv.js'
import { getWithRetry, type HttpGet } from './http.js'
import type { ScholarAuthor, ScholarSource, SearchPaper } from './scholar-sources.js'

const API = 'https://api.openalex.org'
const AUTHOR_FIELDS = [
  'id', 'display_name', 'works_count', 'cited_by_count', 'summary_stats', 'last_known_institutions',
  'affiliations', 'topics', 'counts_by_year',
].join(',')
const SEARCH_WORK_FIELDS = ['id', 'title', 'publication_year', 'authorships', 'cited_by_count'].join(',')
const AUTHOR_WORK_FIELDS = [
  'id', 'title', 'authorships', 'abstract_inverted_index', 'publication_date', 'cited_by_count', 'ids',
  'locations', 'type',
].join(',')
// OpenAlex search often takes several seconds, well past what Semantic Scholar needed.
const TIMEOUT_MS = 20_000
const PAPER_LIMIT = 50
const AUTHOR_SEARCH_LIMIT = 10
const AUTHOR_BATCH_LIMIT = 50
const AUTHOR_WORK_SCAN_LIMIT = 100
const AUTHOR_WORK_LIMIT = 20
// OpenAlex links authors to every institution that ever appeared on their papers, often wrongly;
// only the ones held across several recent years say where someone works now.
const AFFILIATION_LIMIT = 2
const AFFILIATION_RECENT_YEARS = 5
const SECOND_AFFILIATION_MIN_YEARS = 3
/** The second institution must also span at least this share of the first one's years. */
const SECOND_AFFILIATION_MIN_SHARE = 0.5
const TOPIC_LIMIT = 2

export const openAlexWorkSearchUrl = (query: string, sinceYear: number): string => `${API}/works?${new URLSearchParams({
  search: query, filter: `from_publication_date:${sinceYear}-01-01`,
  'per-page': String(PAPER_LIMIT), select: SEARCH_WORK_FIELDS,
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

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const count = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
)
const yearOf = (value: unknown): number | null => (
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
)
const rowsIn = (value: unknown): Record<string, unknown>[] => (
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object') : []
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

const authorsOf = (row: Record<string, unknown>): SearchPaper['authors'] => (
  rowsIn(row['authorships']).flatMap((authorship) => {
    const author = authorship['author']
    if (author === null || typeof author !== 'object') return []
    const id = shortId((author as { id?: unknown }).id)
    const name = text((author as { display_name?: unknown }).display_name)
    return id === '' || name === '' ? [] : [{ id, name }]
  })
)

/** Projects an OpenAlex work search into the papers topic and author ranking read. */
export function parseOpenAlexWorks(body: Uint8Array): SearchPaper[] {
  return resultsOf(body, 'OpenAlex 返回了无法识别的论文结果').flatMap((row) => {
    const title = text(row['title'])
    return title === '' ? [] : [{
      title, year: yearOf(row['publication_year']), authors: authorsOf(row),
      citationCount: count(row['cited_by_count']), influentialCitationCount: 0,
    }]
  })
}

/**
 * Where an author works now: institutions ranked by how many of the last few years they appear in,
 * then by total years. The second one is kept only when it also recurs over a comparable span. Authors without dated
 * affiliations fall back to OpenAlex's last known institutions.
 */
function affiliationsOf(row: Record<string, unknown>, currentYear: number): string[] {
  const dated = rowsIn(row['affiliations']).flatMap((affiliation) => {
    const name = text((affiliation['institution'] as { display_name?: unknown } | null | undefined)?.display_name)
    const years = Array.isArray(affiliation['years']) ? affiliation['years'].flatMap((year) => yearOf(year) ?? []) : []
    return name === '' || years.length === 0 ? [] : [{
      name,
      recent: years.filter((year) => year > currentYear - AFFILIATION_RECENT_YEARS).length,
      total: years.length,
      last: Math.max(...years),
    }]
  }).sort((left, right) => (
    right.recent - left.recent || right.total - left.total || right.last - left.last
  ))
  if (dated.length > 0) {
    const [first, second] = dated
    const keepSecond = second !== undefined && second.recent >= SECOND_AFFILIATION_MIN_YEARS
      && second.total >= first!.total * SECOND_AFFILIATION_MIN_SHARE
    return [first!.name, ...(keepSecond ? [second.name] : [])]
  }
  return [...new Set(rowsIn(row['last_known_institutions']).map((institution) => (
    text(institution['display_name'])
  )).filter(Boolean))].slice(0, AFFILIATION_LIMIT)
}

/** The field of the author's leading topic and their leading topic names; OpenAlex lists topics by paper count. */
function researchOf(row: Record<string, unknown>): { field?: string; topics?: string[] } {
  const topics = rowsIn(row['topics'])
  const field = text((topics[0]?.['field'] as { display_name?: unknown } | null | undefined)?.display_name)
  const names = [...new Set(topics.map((topic) => text(topic['display_name'])).filter(Boolean))].slice(0, TOPIC_LIMIT)
  return { ...(field === '' ? {} : { field }), ...(names.length === 0 ? {} : { topics: names }) }
}

/** The latest year OpenAlex counts any work for the author, or null when it lists none. */
function activeYearOf(row: Record<string, unknown>): number | null {
  const years = rowsIn(row['counts_by_year']).flatMap((entry) => (
    count(entry['works_count']) > 0 ? yearOf(entry['year']) ?? [] : []
  ))
  return years.length === 0 ? null : Math.max(...years)
}

/** Projects OpenAlex author records into author candidates with impact, affiliation and research metadata. */
export function parseOpenAlexAuthors(body: Uint8Array, currentYear: number): ScholarAuthor[] {
  return resultsOf(body, 'OpenAlex 返回了无法识别的作者结果').flatMap((row) => {
    const id = shortId(row['id'])
    const name = text(row['display_name'])
    if (id === '' || name === '') return []
    const stats = row['summary_stats'] as { h_index?: unknown } | null | undefined
    return [{
      candidate: {
        source: 'openalex' as const, id, name,
        affiliations: affiliationsOf(row, currentYear),
        paperCount: count(row['works_count']),
        citationCount: count(row['cited_by_count']),
        hIndex: count(stats?.h_index),
        ...researchOf(row),
      },
      activeYear: activeYearOf(row),
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

export type OpenAlex = ScholarSource & {
  authorWorks(authorId: string): Promise<RemotePaper[]>
}

/** Scholarly search, author lookup and author-id paper retrieval backed by OpenAlex, which needs no key. */
export function createOpenAlex(deps: {
  get: HttpGet
  sleep: (ms: number) => Promise<void>
  now?: () => number
}): OpenAlex {
  const policy = { timeoutMs: TIMEOUT_MS, tries: 2, backoffMs: 1_000, limit: 8 * 1024 * 1024, sleep: deps.sleep }
  const currentYear = () => new Date((deps.now ?? Date.now)()).getUTCFullYear()
  return {
    name: 'openalex',
    async searchPapers(query, sinceYear) {
      return parseOpenAlexWorks(await getWithRetry(deps.get, openAlexWorkSearchUrl(query, sinceYear), policy))
    },
    async authorImpacts(ids) {
      const batch = ids.slice(0, AUTHOR_BATCH_LIMIT)
      if (batch.length === 0) return []
      return parseOpenAlexAuthors(await getWithRetry(deps.get, openAlexAuthorBatchUrl(batch), policy), currentYear())
    },
    async searchAuthors(query): Promise<AuthorCandidate[]> {
      const body = await getWithRetry(deps.get, openAlexAuthorSearchUrl(query), policy)
      return parseOpenAlexAuthors(body, currentYear()).map((author) => author.candidate)
    },
    async authorWorks(authorId) {
      return parseOpenAlexAuthorWorks(await getWithRetry(deps.get, openAlexAuthorWorksUrl(authorId), policy))
    },
  }
}
