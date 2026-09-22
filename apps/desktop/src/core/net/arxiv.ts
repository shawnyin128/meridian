import type { Watch } from '../../shared/contract.js'
import { getWithRetry, type HttpGet } from './http.js'

const API = 'https://export.arxiv.org/api/query'
const ABS = 'https://arxiv.org/abs/'

/** Minimum delay between arXiv requests, following the API's courtesy guidance. */
export const ARXIV_INTERVAL_MS = 3_200

/** Maximum papers fetched for one watch in a single run. */
export const WATCH_BATCH = 20

/** Maximum papers read from one topical search for suggestions and discovery. */
export const TOPICAL_BATCH = 50

/** Maximum body size for one API response. */
const API_LIMIT = 5 * 1024 * 1024

/** Remote-paper fields used by Meridian. `id` omits the version; `submitted` is the first-version date. */
export type RemotePaper = {
  id: string
  title: string
  authors: string[]
  abstract: string
  submitted: string
  journalRef: string | null
  pdf: string
  ranking?: {
    relevance: number
    published: boolean
    citationCount: number
    influentialCitationCount: number
    submitted: string
  }
}

/** Look up paper metadata by identifier. arXiv is the first implementation; other sources use the same shape. */
export type MetadataProvider = {
  lookup(id: string): Promise<RemotePaper | null>
  lookupMany?(ids: readonly string[]): Promise<Map<string, RemotePaper>>
}

export type TopicalOrder = 'relevance' | 'submittedDate'

export type Arxiv = MetadataProvider & {
  search(query: string): Promise<RemotePaper[]>
  /** The TOPICAL_BATCH papers matching `query` first submitted in or after `sinceYear`, best match or newest first. */
  searchTopical(query: string, sinceYear: number, order: TopicalOrder): Promise<RemotePaper[]>
}

/**
 * Returns the arXiv search query for a watch. A topic is an exact phrase over
 * all fields. An author whose name starts with a one-letter initial is
 * `au:Surname_I`; any other author name is quoted whole.
 */
export function watchQuery(watch: Pick<Watch, 'type' | 'name'>): string {
  if (watch.type === 'topic') return `all:"${watch.name}"`
  const tokens = watch.name.replace(/\./g, ' ').split(/\s+/).filter(Boolean)
  if (tokens.length > 1 && tokens[0]!.length === 1) return `au:${tokens.at(-1)}_${tokens[0]}`
  return `au:"${tokens.join(' ')}"`
}

/** Returns the API address for the newest WATCH_BATCH papers matching `query`. */
export function searchUrl(query: string): string {
  const params = new URLSearchParams({
    search_query: query, sortBy: 'submittedDate', sortOrder: 'descending', max_results: String(WATCH_BATCH),
  })
  return `${API}?${params.toString()}`
}

/** Returns the API address for a topical search restricted to papers first submitted in or after `sinceYear`. */
export function topicalSearchUrl(query: string, sinceYear: number, order: TopicalOrder): string {
  const params = new URLSearchParams({
    search_query: `(${query}) AND submittedDate:[${sinceYear}01010000 TO 999912312359]`,
    sortBy: order, sortOrder: 'descending', max_results: String(TOPICAL_BATCH),
  })
  return `${API}?${params.toString()}`
}

/** Returns one API address for several known paper identifiers. */
export function batchLookupUrl(ids: readonly string[]): string {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  const params = new URLSearchParams({
    id_list: unique.join(','),
    max_results: String(unique.length),
  })
  return `${API}?${params.toString()}`
}

/** Returns the public abstract-page address for one paper. */
export function lookupUrl(id: string): string {
  return `${ABS}${encodeURIComponent(id)}`
}

const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&' }
const decode = (text: string): string => text.replace(
  /&(?:#x[\da-f]+|#\d+|lt|gt|quot|apos|amp);/gi,
  (hit) => {
    if (hit.startsWith('&#x') || hit.startsWith('&#X')) return String.fromCodePoint(Number.parseInt(hit.slice(3, -1), 16))
    if (hit.startsWith('&#')) return String.fromCodePoint(Number.parseInt(hit.slice(2, -1), 10))
    return ENTITIES[hit.toLowerCase()] ?? hit
  },
)

/** Parses the citation metadata arXiv publishes on a paper's abstract page. */
export function parseAbs(html: string): RemotePaper {
  const metadata = new Map<string, string[]>()
  for (const [tag = ''] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map(
      [...tag.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/gs)]
        .map(([, name = '', , value = '']) => [name.toLowerCase(), decode(value)] as const),
    )
    const name = attributes.get('name')?.toLowerCase()
    const content = attributes.get('content')
    if (name === undefined || content === undefined) continue
    metadata.set(name, [...(metadata.get(name) ?? []), content.replace(/\s+/g, ' ').trim()])
  }
  const first = (name: string): string | undefined => metadata.get(name)?.[0]
  const title = first('citation_title')
  const rawId = first('citation_arxiv_id')
  if (title === undefined || rawId === undefined) throw new Error('arXiv 摘要页没有书目元数据')
  const id = rawId.replace(/v\d+$/, '')
  const authors = (metadata.get('citation_author') ?? []).map((author) => {
    const [family, ...given] = author.split(',').map((part) => part.trim())
    return given.length === 0 ? author : `${given.join(' ')} ${family}`.trim()
  })
  return {
    id,
    title,
    authors,
    abstract: first('citation_abstract') ?? '',
    submitted: (first('citation_date') ?? '').replaceAll('/', '-'),
    journalRef: first('citation_journal_title') ?? first('citation_conference_title') ?? null,
    pdf: first('citation_pdf_url') ?? `https://arxiv.org/pdf/${id}`,
  }
}

/**
 * Parses an arXiv Atom feed into its entries, in feed order. Runs of
 * whitespace inside every text field collapse to single spaces. Throws if the
 * feed is arXiv's error entry, carrying arXiv's own summary.
 */
export function parseAtom(xml: string): RemotePaper[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, body = '']) => {
    const field = (tag: string): string | null => {
      const hit = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(body)
      return hit === null ? null : decode(hit[1]!).replace(/\s+/g, ' ').trim()
    }
    const address = field('id') ?? ''
    if (address.includes('/api/errors')) throw new Error(`arXiv 拒绝了这次查询:${field('summary') ?? address}`)
    const id = address.replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '')
    return {
      id,
      title: field('title') ?? '',
      authors: [...body.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map(([, name = '']) => decode(name).trim()),
      abstract: field('summary') ?? '',
      submitted: (field('published') ?? '').slice(0, 10),
      journalRef: field('arxiv:journal_ref'),
      pdf: `https://arxiv.org/pdf/${id}`,
    }
  })
}

/**
 * Builds the arXiv client. Calls go out one at a time, each starting at least
 * `minIntervalMs` after the previous one started, and each is tried through
 * getWithRetry with a 20 s timeout, 3 attempts and a 3 s backoff. A failed call
 * does not hold up the next. `search` and `lookupMany` read the Atom API;
 * `lookup` reads one paper's citation metadata from its abstract page. All
 * operations share the request queue and cache, and throw network or parse errors.
 */
export function createArxiv(deps: {
  get: HttpGet; minIntervalMs: number; now: () => number; sleep: (ms: number) => Promise<void>
}): Arxiv {
  let queue: Promise<unknown> = Promise.resolve()
  let last = Number.NEGATIVE_INFINITY
  const lookupCache = new Map<string, Promise<RemotePaper | null>>()
  const call = <T>(url: string, parse: (body: string) => T): Promise<T> => {
    const run = queue.then(async () => {
      const wait = last + deps.minIntervalMs - deps.now()
      if (wait > 0) await deps.sleep(wait)
      last = deps.now()
      const body = await getWithRetry(deps.get, url, {
        timeoutMs: 20_000, tries: 3, backoffMs: 3_000, limit: API_LIMIT, sleep: deps.sleep,
      })
      return parse(new TextDecoder().decode(body))
    })
    queue = run.catch(() => undefined)
    return run
  }

  const lookup = (id: string): Promise<RemotePaper | null> => {
    const normalized = id.trim()
    const cached = lookupCache.get(normalized)
    if (cached !== undefined) return cached
    const request = call(lookupUrl(normalized), parseAbs)
      .catch((error: unknown) => {
        lookupCache.delete(normalized)
        throw error
      })
    lookupCache.set(normalized, request)
    return request
  }

  const cacheBatch = (ids: readonly string[]) => {
    const request = call(batchLookupUrl(ids), parseAtom).then(
      (papers) => new Map(papers.map((paper) => [paper.id, paper])),
    )
    for (const id of ids) {
      const entry = request
        .then((papers) => papers.get(id) ?? null)
        .catch((error: unknown) => {
          lookupCache.delete(id)
          throw error
        })
      lookupCache.set(id, entry)
    }
  }

  return {
    search: (query) => call(searchUrl(query), parseAtom),
    searchTopical: (query, sinceYear, order) => call(topicalSearchUrl(query, sinceYear, order), parseAtom),
    lookup,
    async lookupMany(ids) {
      const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
      const missing = unique.filter((id) => !lookupCache.has(id))
      if (missing.length === 1) void lookup(missing[0]!)
      else if (missing.length > 1) cacheBatch(missing)

      const found = new Map<string, RemotePaper>()
      await Promise.all(unique.map(async (id) => {
        const paper = await lookupCache.get(id)
        if (paper) found.set(id, paper)
      }))
      return found
    },
  }
}
