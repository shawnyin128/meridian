import { requestWithRetry, type HttpGet } from './http.js'

const BATCH_URL = `https://api.semanticscholar.org/graph/v1/paper/batch?${new URLSearchParams({
  fields: 'venue,publicationVenue,externalIds',
}).toString()}`
const TIMEOUT_MS = 10_000
/** The most paper ids one batch request may carry. */
const BATCH_LIMIT = 500
/** A venue name that only says the paper is on arXiv, which is no publication. */
const PREPRINT = /^arxiv(\.org)?$/i
/** A DBLP key of a conference or journal paper, ending in the two digits of its year; CoRR keys are arXiv's. */
const DBLP_VENUE_KEY = /^(?:conf|journals)\/(?!corr\/)[^/]+\/.*\D(\d{2})$/

/**
 * Where a paper was published: the venue's short name (its full name when it has none), the year of
 * that publication, and `source` 'dblp' when DBLP gave them rather than Semantic Scholar.
 */
export type Publication = { venue: string; year?: number; source?: 'dblp' }

/** Looks up where papers were published by Semantic Scholar id (`ARXIV:<id>`, `DOI:<doi>`), keyed by the id asked. */
export type PublicationSource = {
  lookup(ids: readonly string[]): Promise<Map<string, Publication>>
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * Returns the venue a batch row names: the first of its venue's alternate names that is one word with
 * at least two capitals (NeurIPS, ICLR), else the venue's name, else the row's `venue`; empty when
 * that names only arXiv.
 */
function venueOf(row: Record<string, unknown>): string {
  const venue = row['publicationVenue'] !== null && typeof row['publicationVenue'] === 'object'
    ? row['publicationVenue'] as Record<string, unknown> : {}
  const alternates = Array.isArray(venue['alternate_names']) ? venue['alternate_names'].map(text) : []
  const short = alternates.find((name) => !/\s/.test(name) && (name.match(/\p{Lu}/gu) ?? []).length >= 2)
  const name = short ?? (text(venue['name']) || text(row['venue']))
  return PREPRINT.test(name) || PREPRINT.test(text(venue['name']) || text(row['venue'])) ? '' : name
}

/**
 * Returns the year a DBLP venue key ends in (`conf/icml/LeviathanKM23` is 2023), 70 to 99 read as
 * 19xx and the rest as 20xx; undefined for a CoRR key, any other key or none.
 */
function dblpYear(row: Record<string, unknown>): number | undefined {
  const ids = row['externalIds'] !== null && typeof row['externalIds'] === 'object' ? row['externalIds'] as Record<string, unknown> : {}
  const digits = DBLP_VENUE_KEY.exec(text(ids['DBLP']))?.[1]
  if (digits === undefined) return undefined
  const year = Number(digits)
  return year >= 70 ? 1900 + year : 2000 + year
}

/**
 * Reads a `/paper/batch` response for the ids `ids` asked, in their order: the publication of each
 * paper found that names a venue other than arXiv, with the year its DBLP venue key gives. Throws when the
 * response is not a list.
 */
export function parseSemanticPublications(body: Uint8Array, ids: readonly string[]): Map<string, Publication> {
  const rows: unknown = JSON.parse(new TextDecoder().decode(body))
  if (!Array.isArray(rows)) throw new Error('Semantic Scholar 返回了无法识别的论文结果')
  const out = new Map<string, Publication>()
  rows.forEach((row: unknown, at) => {
    if (row === null || typeof row !== 'object' || ids[at] === undefined) return
    const held = row as Record<string, unknown>
    const venue = venueOf(held)
    if (venue === '') return
    const year = dblpYear(held)
    out.set(ids[at], { venue, ...(year === undefined ? {} : { year }) })
  })
  return out
}

/** Publication lookup over the Graph API's paper batch, at most BATCH_LIMIT ids a request. */
export function createSemanticPublications(deps: {
  get: HttpGet
  sleep: (ms: number) => Promise<void>
}): PublicationSource {
  const policy = { timeoutMs: TIMEOUT_MS, tries: 2, backoffMs: 0, limit: 10 * 1024 * 1024, sleep: deps.sleep }
  return {
    async lookup(ids) {
      const out = new Map<string, Publication>()
      for (let from = 0; from < ids.length; from += BATCH_LIMIT) {
        const batch = ids.slice(from, from + BATCH_LIMIT)
        const body = await requestWithRetry(deps.get, BATCH_URL, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: batch }),
        }, policy)
        for (const [id, publication] of parseSemanticPublications(body, batch)) out.set(id, publication)
      }
      return out
    },
  }
}
