import { requestWithRetry, type HttpGet } from '../../net/http.js'
import type {
  DiscoveryPaper, PaperImpact, RecommendationProvider, RecommendationSource, ScholarlyMetadata,
} from '../types.js'

const PAPER_FIELDS = [
  'paperId', 'title', 'abstract', 'authors', 'venue', 'publicationDate', 'year',
  'citationCount', 'influentialCitationCount', 'externalIds', 'openAccessPdf', 'publicationTypes',
].join(',')
const RECOMMENDATION_LIMIT = 20
const RECOMMENDATION_BODY_LIMIT = 4 * 1024 * 1024
const RECOMMENDATION_TIMEOUT_MS = 10_000

export const semanticRecommendationsUrl =
  `https://api.semanticscholar.org/recommendations/v1/papers?${new URLSearchParams({
    fields: PAPER_FIELDS, limit: String(RECOMMENDATION_LIMIT),
  }).toString()}`

const RELATION_LIMIT = 20
const AUTHOR_LIMIT = 3
const graphPaperUrl = (paperId: string, path: 'citations' | 'references' | 'authors', fields: string) => (
  `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(paperId)}/${path}?${new URLSearchParams({
    limit: String(path === 'authors' ? AUTHOR_LIMIT : RELATION_LIMIT), fields,
  }).toString()}`
)

export const semanticCitationUrl = (paperId: string): string => (
  graphPaperUrl(paperId, 'citations', PAPER_FIELDS)
)
export const semanticReferenceUrl = (paperId: string): string => (
  graphPaperUrl(paperId, 'references', PAPER_FIELDS)
)
export const semanticAuthorNeighborsUrl = (paperId: string): string => {
  const fields = [
    'name', ...PAPER_FIELDS.split(',').map((field) => `papers.${field}`),
  ].join(',')
  return graphPaperUrl(paperId, 'authors', fields)
}

const BATCH = 'https://api.semanticscholar.org/graph/v1/paper/batch?fields=externalIds,citationCount,influentialCitationCount,venue,publicationTypes'
const IMPACT_BODY_LIMIT = 2 * 1024 * 1024
const IMPACT_TIMEOUT_MS = 2_500
const CACHE_MS = 24 * 60 * 60 * 1_000

type ApiPaper = {
  paperId?: unknown
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

const count = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
)
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

const submittedOf = (paper: ApiPaper): string => {
  const date = text(paper.publicationDate)
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  return typeof paper.year === 'number' && Number.isInteger(paper.year)
    ? `${paper.year.toString().padStart(4, '0')}-01-01` : '1970-01-01'
}

const reviewedTypes = new Set(['Conference', 'JournalArticle', 'Review', 'Book', 'BookSection'])

const discoveryPaper = (paper: ApiPaper, relevance: number): DiscoveryPaper | null => {
  const arxiv = text(paper.externalIds?.ArXiv).replace(/v\d+$/, '')
  const title = text(paper.title)
  const semanticId = text(paper.paperId)
  if (arxiv === '' || title === '' || semanticId === '') return null
  const submitted = submittedOf(paper)
  const venue = text(paper.venue)
  const types = Array.isArray(paper.publicationTypes)
    ? paper.publicationTypes.filter((type): type is string => typeof type === 'string') : []
  const published = types.some((type) => reviewedTypes.has(type))
    || (venue !== '' && !/^arxiv$/i.test(venue))
  const authors = Array.isArray(paper.authors)
    ? paper.authors.flatMap((author) => {
      if (author === null || typeof author !== 'object') return []
      const name = text((author as { name?: unknown }).name)
      return name === '' ? [] : [name]
    }) : []
  return {
    semanticId,
    id: arxiv,
    title,
    authors,
    abstract: text(paper.abstract),
    submitted,
    journalRef: venue === '' ? null : venue,
    pdf: `https://arxiv.org/pdf/${encodeURIComponent(arxiv)}`,
    ranking: {
      relevance: Math.max(0, Math.min(1, relevance)),
      published,
      citationCount: count(paper.citationCount),
      influentialCitationCount: count(paper.influentialCitationCount),
      submitted,
    },
  }
}

const normalizedPapers = (raw: ApiPaper[], relevance: (at: number) => number): DiscoveryPaper[] => {
  const out: DiscoveryPaper[] = []
  const seen = new Set<string>()
  for (let at = 0; at < raw.length; at += 1) {
    const parsed = discoveryPaper(raw[at]!, relevance(at))
    if (parsed === null || seen.has(parsed.id)) continue
    seen.add(parsed.id)
    out.push(parsed)
  }
  return out
}

/** Parses Semantic Scholar recommendations and keeps arXiv-downloadable papers only. */
export function parseSemanticRecommendations(body: Uint8Array): DiscoveryPaper[] {
  const decoded: unknown = JSON.parse(new TextDecoder().decode(body))
  if (decoded === null || typeof decoded !== 'object'
    || !Array.isArray((decoded as { recommendedPapers?: unknown }).recommendedPapers)) {
    throw new Error('Semantic Scholar 返回了无法识别的推荐结果')
  }
  const raw = (decoded as { recommendedPapers: unknown[] }).recommendedPapers
  return normalizedPapers(
    raw.filter((item): item is ApiPaper => item !== null && typeof item === 'object'),
    (at) => 1 - at / Math.max(raw.length, 1),
  )
}

const dataRows = (body: Uint8Array, message: string): unknown[] => {
  const decoded: unknown = JSON.parse(new TextDecoder().decode(body))
  if (decoded === null || typeof decoded !== 'object'
    || !Array.isArray((decoded as { data?: unknown }).data)) throw new Error(message)
  return (decoded as { data: unknown[] }).data
}

/** Parses one citation/reference page into the same provider-neutral candidate shape. */
export function parseSemanticRelations(
  body: Uint8Array, relation: 'citation' | 'reference',
): DiscoveryPaper[] {
  const key = relation === 'citation' ? 'citingPaper' : 'citedPaper'
  const rows = dataRows(body, 'Semantic Scholar 返回了无法识别的引用关系')
  const papers = rows.flatMap((item) => {
    if (item === null || typeof item !== 'object') return []
    const raw = (item as Record<string, unknown>)[key]
    return raw !== null && typeof raw === 'object' ? [raw as ApiPaper] : []
  })
  return normalizedPapers(papers, (at) => Math.max(0.5, 0.78 - at / 80))
}

/** Keeps author branches balanced so one prolific collaborator cannot consume the whole page. */
export function parseSemanticAuthorNeighbors(body: Uint8Array): DiscoveryPaper[] {
  const rows = dataRows(body, 'Semantic Scholar 返回了无法识别的作者邻居')
  const branches = rows.flatMap((item) => {
    if (item === null || typeof item !== 'object') return []
    const papers = (item as { papers?: unknown }).papers
    return Array.isArray(papers)
      ? [papers.filter((paper): paper is ApiPaper => paper !== null && typeof paper === 'object')]
      : []
  })
  const interleaved: ApiPaper[] = []
  const longest = Math.max(0, ...branches.map((branch) => branch.length))
  for (let at = 0; at < longest && interleaved.length < RECOMMENDATION_LIMIT; at += 1) {
    for (const branch of branches) {
      const paper = branch[at]
      if (paper !== undefined) interleaved.push(paper)
      if (interleaved.length >= RECOMMENDATION_LIMIT) break
    }
  }
  return normalizedPapers(interleaved, (at) => Math.max(0.5, 0.75 - at / 80))
}

const withOrigin = (
  papers: DiscoveryPaper[], source: RecommendationSource, seedPaperIds: string[],
): DiscoveryPaper[] => papers.map((paper) => ({
  ...paper, origins: [{ source, seedPaperIds: [...seedPaperIds] }],
}))

/** Semantic Scholar source adapter for similarity, citation, reference and author candidates. */
export function createSemanticRecommendations(deps: {
  get: HttpGet
  sleep: (ms: number) => Promise<void>
}): RecommendationProvider {
  const policy = {
    timeoutMs: RECOMMENDATION_TIMEOUT_MS, tries: 2, backoffMs: 1_000,
    limit: RECOMMENDATION_BODY_LIMIT, sleep: deps.sleep,
  }
  return {
    async recommend(positivePaperIds, negativePaperIds, source = 'similarity') {
      if (positivePaperIds.length === 0) return []
      if (source === 'similarity') {
        const body = await requestWithRetry(deps.get, semanticRecommendationsUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positivePaperIds, negativePaperIds }),
        }, policy)
        return withOrigin(parseSemanticRecommendations(body), source, positivePaperIds)
      }
      const seed = positivePaperIds[0]!
      const url = source === 'citation' ? semanticCitationUrl(seed)
        : source === 'reference' ? semanticReferenceUrl(seed)
          : semanticAuthorNeighborsUrl(seed)
      const body = await requestWithRetry(deps.get, url, {}, policy)
      const parsed = source === 'author'
        ? parseSemanticAuthorNeighbors(body)
        : parseSemanticRelations(body, source)
      return withOrigin(parsed.filter((paper) => (
        !positivePaperIds.includes(paper.semanticId)
        && !positivePaperIds.includes(`ARXIV:${paper.id}`)
      )), source, positivePaperIds)
    },
  }
}

type BatchPaper = {
  externalIds?: { ArXiv?: unknown } | null
  citationCount?: unknown
  influentialCitationCount?: unknown
  venue?: unknown
  publicationTypes?: unknown
}

/** Parses the small paper-batch projection used by scoring, keyed by versionless arXiv id. */
export function parsePaperImpact(body: Uint8Array): Map<string, PaperImpact> {
  const decoded: unknown = JSON.parse(new TextDecoder().decode(body))
  if (!Array.isArray(decoded)) throw new Error('Semantic Scholar 返回了无法识别的结果')
  const out = new Map<string, PaperImpact>()
  for (const raw of decoded) {
    if (raw === null || typeof raw !== 'object') continue
    const paper = raw as BatchPaper
    const rawId = paper.externalIds?.ArXiv
    if (typeof rawId !== 'string' || rawId === '') continue
    const venue = text(paper.venue)
    const types = Array.isArray(paper.publicationTypes)
      ? paper.publicationTypes.filter((item): item is string => typeof item === 'string') : []
    const published = types.some((type) => reviewedTypes.has(type))
      || (venue !== '' && !/^arxiv$/i.test(venue))
    out.set(rawId.replace(/v\d+$/, ''), {
      citationCount: count(paper.citationCount),
      influentialCitationCount: count(paper.influentialCitationCount),
      venue,
      published,
    })
  }
  return out
}

/** Best-effort ranking enrichment, batched and cached independently of source retrieval. */
export function createSemanticScholar(deps: {
  get: HttpGet; sleep: (ms: number) => Promise<void>; now?: () => number; cacheMs?: number
}): ScholarlyMetadata {
  const cache = new Map<string, { at: number; value: PaperImpact | null }>()
  return {
    async lookup(arxivIds) {
      if (arxivIds.length === 0) return new Map()
      const now = (deps.now ?? Date.now)()
      const maxAge = deps.cacheMs ?? CACHE_MS
      const out = new Map<string, PaperImpact>()
      const missing: string[] = []
      for (const id of new Set(arxivIds)) {
        const held = cache.get(id)
        if (held === undefined || now - held.at >= maxAge) missing.push(id)
        else if (held.value !== null) out.set(id, held.value)
      }
      if (missing.length === 0) return out
      const body = await requestWithRetry(deps.get, BATCH, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: missing.map((id) => `ARXIV:${id}`) }),
      }, {
        timeoutMs: IMPACT_TIMEOUT_MS, tries: 1, backoffMs: 0,
        limit: IMPACT_BODY_LIMIT, sleep: deps.sleep,
      })
      const fetched = parsePaperImpact(body)
      for (const id of missing) {
        const value = fetched.get(id) ?? null
        cache.set(id, { at: now, value })
        if (value !== null) out.set(id, value)
      }
      return out
    },
  }
}

export const semanticScholarBatchUrl = BATCH
