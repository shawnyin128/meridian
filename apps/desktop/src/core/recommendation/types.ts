import type { RemotePaper } from '../net/arxiv.js'

export type RecommendationSeed = {
  paperId: string
  title: string
  abstract: string
  source: 'project' | 'feedback'
  /** Read-only canonical memberships belonging to this exact project paper. */
  wikiTerms?: string[]
}

/** One project-local profile. Feedback never crosses this project boundary. */
export type RecommendationProfile = {
  projectId: string
  projectName: string
  /** Explicit project intent: topic, current focus and active research-path labels. */
  anchorText: string
  /** Canonical Paper Wiki topic/method memberships, read only for transient ranking. */
  wikiTerms?: string[]
  positive: RecommendationSeed[]
  negative: RecommendationSeed[]
}

export type RecommendationIntent = {
  id: string
  label: string
  seeds: RecommendationSeed[]
  score: number
  core: boolean
  enabled: boolean
}

export type RecommendationMatch = {
  intentId: string
  intentLabel: string
  seedPaperIds: string[]
  core: boolean
}

export type RecommendationSource = 'similarity' | 'citation' | 'reference' | 'author'

/** Factual retrieval provenance. The renderer never infers this from prose. */
export type RecommendationOrigin = {
  source: RecommendationSource
  seedPaperIds: string[]
  /** Set when arXiv search found the paper; Semantic Scholar origins leave it out. */
  provider?: 'arxiv'
}

export type DiscoveryIntentCache = { fingerprint: string; fetchedAt: number }

export type DiscoverySchedule = {
  lastFetchedAt: number | null
  cursor: number
  requests: Record<string, DiscoveryIntentCache>
}

export type DiscoveryPreferences = {
  coreIntentId: string | null
  disabledIntentIds: string[]
}

/** Provider-neutral discovery result stored by Meridian after an external recommendation call. */
export type DiscoveryPaper = RemotePaper & {
  semanticId: string
  /** Added by Core after per-intent retrieval; providers never manufacture explanations. */
  matches?: RecommendationMatch[]
  /** Added by a source adapter and merged by Core when the same paper arrives more than once. */
  origins?: RecommendationOrigin[]
  /** Read-only canonical Wiki terms that actually matched this candidate. */
  wikiTerms?: string[]
}

/** Replaceable boundary for any project-seeded paper recommendation backend. */
export type RecommendationProvider = {
  recommend(
    positive: RecommendationSeed[], negativePaperIds: string[], source?: RecommendationSource,
  ): Promise<DiscoveryPaper[]>
}

export type PaperImpact = {
  citationCount: number
  influentialCitationCount: number
  venue: string
  published: boolean
}

/** Optional metadata enrichment used by recommendation scoring. */
export type ScholarlyMetadata = {
  lookup(arxivIds: string[]): Promise<Map<string, PaperImpact>>
}
