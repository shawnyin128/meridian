import type { InboxEntry } from '../../shared/contract.js'
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

/** One project or watch whose refreshes Core keeps progress for. */
export type RefreshScope = { kind: 'project' | 'watch'; id: string }

/** How far a scope's refreshes have got. */
export type RefreshProgress = {
  /** Per discovery direction id, how many queries it has run; the next one runs at that rotation step. */
  steps: Record<string, number>
  /** Candidates fetched beyond a run's delivery cap, in the order a later run offers them first. */
  candidates: DiscoveryPaper[]
  /** When the scope last delivered more than an even split of a run's cap, or null if it never did. */
  favouredAt: number | null
  /** The arXiv ids of the newest page a watch fetched last; empty before its first fetch and for projects. */
  newest: string[]
  /**
   * Whether a run served the scope from its pool, without provider calls, and delivered nothing, and no
   * run delivered since.
   */
  poolStalled: boolean
}

/**
 * One inbox entry a stream of a scope lists, as the scope's model learns from it: the Semantic
 * Scholar batch ids its paper goes by, its `semanticId` first, then `ARXIV:<arXiv id>`; whether it left the feed, and why
 * when that was stored; whether it was downloaded into the vault; its stored discovery feedback; the
 * reasons that stream gave; and the library
 * rating of the paper page it was added as, when there is one.
 */
export type CardSignal = {
  paperIds: string[]
  gone: boolean
  downloaded: boolean
  left?: string
  feedback?: 'more' | 'less' | 'known'
  reasons: { kind: string; label: string }[]
  rating?: number
}

/** What the user did with a scope's papers: its cards, and the library rating of each rated paper of its project by batch id. */
export type ScopeSignals = { cards: CardSignal[]; ratings: Record<string, number> }

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

/**
 * Replaceable boundary for any project-seeded paper recommendation backend. `page` counts from 0 and
 * asks for the results after the first `page` batches; a backend that cannot page ignores it.
 */
export type RecommendationProvider = {
  recommend(
    positive: RecommendationSeed[], negativePaperIds: string[], source?: RecommendationSource, page?: number,
  ): Promise<DiscoveryPaper[]>
  /**
   * A key that is equal for two calls of `recommend` with these arguments exactly when they make the
   * same request; undefined when every seed, source and page makes a different one.
   */
  queryKey?(positive: RecommendationSeed[], source: RecommendationSource, page: number): string | undefined
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

/** How a refresh scored one paper: its calibrated score in [0, 1], the path that scored it and the reasons it shows. */
export type PaperScore = { relevance: number; path: 'api' | 'fallback'; reasons: InboxEntry['reasons'] }

/**
 * A refresh's ranking of the papers of one scope, each named by its Semantic Scholar batch id: the
 * `semanticId` of a paper or card that has one, else `ARXIV:` and its arXiv id.
 */
export type ScopeRanking = {
  /** How the refresh scored `paperId`; undefined for a paper it did not score. */
  scoreOf(paperId: string): PaperScore | undefined
  /** The papers of `candidates` the scope shows; a paper the refresh did not score ranks by its `relevance`. */
  shown(candidates: readonly { paperId: string; relevance: number }[]): Set<string>
}

/** A card the feed shows for one scope: its id, its paper's Semantic Scholar batch id and its text. */
export type ScopeCard = { id: string; paperId: string; title: string; abstract: string }

/**
 * One paper the vault or the feed knows, by Semantic Scholar batch id: its title, short title and
 * abstract, and how the user took it, when it came from the feed: added to the vault (`library`, or
 * `rated` once rated 5), or queued to read later.
 */
export type KnownPaper = { title: string; shortTitle: string; abstract: string; taken?: 'library' | 'later' | 'rated' }
