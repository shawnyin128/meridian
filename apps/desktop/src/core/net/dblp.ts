import { requestWithRetry, type HttpGet } from './http.js'
import type { Publication } from './semantic-metadata.js'

const SEARCH_URL = 'https://dblp.org/search/publ/api'
const TIMEOUT_MS = 10_000
/** How many hits one title search reads. */
const HITS = 10
/** A DBLP key of a conference or journal paper; CoRR keys are arXiv's. */
const VENUE_KEY = /^(?:conf|journals)\/(?!corr\/)/

/** The paper a title search is for: its title and its authors' names as the vault holds them. */
export type DblpPaper = { title: string; authors: readonly string[] }

/** Looks up where a paper was published in DBLP's publication search. */
export type DblpSource = {
  /** The venue of `paper` DBLP lists, or undefined when no hit is accepted. Throws when the search fails. */
  venueOf(paper: DblpPaper): Promise<Publication | undefined>
}

/** `value` lowercased, without accents, with every run of other than letters and digits as one space. */
const normalized = (value: string): string => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** The normalized surname of `name`: the part before a comma, else its last word, without DBLP's homonym number. */
const surnameOf = (name: string): string => {
  const plain = name.replace(/\s+\d{4}$/, '')
  const surname = plain.includes(',') ? plain.split(',')[0]! : plain.trim().split(/\s+/).at(-1) ?? ''
  return normalized(surname)
}

const record = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
)
/** `value` as a list: DBLP gives a single author, venue or hit as the item itself. */
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined ? [] : [value])
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * Reads a publ search answer for `paper`: the venue and year of the earliest hit whose normalized
 * title equals the paper's, that shares at least one author surname with it and that is a conference
 * or journal entry (not CoRR), or undefined when none is. Throws when the answer is not JSON.
 */
export function parseDblpVenue(body: Uint8Array, paper: DblpPaper): Publication | undefined {
  const answer = record(JSON.parse(new TextDecoder().decode(body)))
  const hits = list(record(record(answer['result'])['hits'])['hit'])
  const title = normalized(paper.title)
  const surnames = new Set(paper.authors.map(surnameOf).filter((name) => name !== ''))
  let best: Publication | undefined
  for (const hit of hits) {
    const info = record(record(hit)['info'])
    const venue = text(list(info['venue'])[0])
    const year = Number(text(info['year']))
    if (!VENUE_KEY.test(text(info['key'])) || venue === '' || !Number.isInteger(year) || year <= 0) continue
    if (normalized(text(info['title'])) !== title) continue
    const authors = list(record(info['authors'])['author']).map((author) => surnameOf(text(record(author)['text'])))
    if (!authors.some((name) => surnames.has(name))) continue
    if (best === undefined || year < best.year!) best = { venue, year, source: 'dblp' }
  }
  return best
}

/** DBLP's publication search over `get`, one request a paper, never retried. */
export function createDblp(deps: { get: HttpGet; sleep: (ms: number) => Promise<void> }): DblpSource {
  const policy = { timeoutMs: TIMEOUT_MS, tries: 1, backoffMs: 0, limit: 2 * 1024 * 1024, sleep: deps.sleep }
  return {
    async venueOf(paper) {
      const query = new URLSearchParams({ q: normalized(paper.title), format: 'json', h: String(HITS) })
      return parseDblpVenue(await requestWithRetry(deps.get, `${SEARCH_URL}?${query.toString()}`, {}, policy), paper)
    },
  }
}
