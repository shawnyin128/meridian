import type {
  DiscoveryPaper, RecommendationIntent, RecommendationProfile,
} from './types.js'

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'based', 'by', 'for', 'from', 'in', 'is', 'it',
  'its', 'language', 'large', 'model', 'models', 'of', 'on', 'paper', 'the', 'to',
  'using', 'via', 'with',
])

const words = (value: string): string[] => (
  value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
).filter((word) => word.length > 1 && !STOP_WORDS.has(word))

const coverage = (query: Set<string>, candidate: Set<string>): number => {
  if (query.size === 0 || candidate.size === 0) return 0
  let found = 0
  for (const word of query) if (candidate.has(word)) found += 1
  return found / query.size
}

const matchingWikiTerms = (paper: DiscoveryPaper, wikiTerms: string[]): string[] => {
  const body = `${paper.title}\n${paper.abstract}`.toLocaleLowerCase()
  const bodyWords = new Set(words(body))
  return wikiTerms.filter((term) => {
    const normalized = term.trim().toLocaleLowerCase()
    if (normalized === '') return false
    if (body.includes(normalized)) return true
    const termWords = words(normalized)
    return termWords.length > 0 && termWords.every((word) => bodyWords.has(word))
  }).slice(0, 3)
}

/**
 * Re-ranks one source response against the explicit project anchor, the representative seed and
 * read-only canonical Wiki memberships. Only matched Wiki terms are retained as explanations.
 */
export function applyRecommendationSignals(
  profile: RecommendationProfile, intent: RecommendationIntent, papers: DiscoveryPaper[],
): DiscoveryPaper[] {
  const representative = intent.seeds[0]
  const query = new Set(words([
    profile.anchorText, intent.label, representative?.title ?? '',
  ].join(' ')))
  // Keep Wiki evidence inside the already-separated direction. A project-wide union here would
  // recreate the cross-direction averaging that intent clustering is designed to prevent.
  const wikiTerms = [...new Set(intent.seeds.flatMap((seed) => seed.wikiTerms ?? []))]
  return papers.map((paper, at) => {
    const matchedWiki = matchingWikiTerms(paper, wikiTerms)
    const lexical = coverage(query, new Set(words(`${paper.title} ${paper.abstract}`)))
    const wiki = wikiTerms.length === 0 ? 0 : matchedWiki.length / Math.min(3, wikiTerms.length)
    const base = paper.ranking?.relevance ?? Math.max(0, 1 - at / Math.max(1, papers.length))
    const relevance = Math.min(1, base * 0.72 + lexical * 0.2 + wiki * 0.08)
    return {
      ...paper,
      ...(matchedWiki.length === 0 ? {} : { wikiTerms: matchedWiki }),
      ...(paper.ranking === undefined ? {} : { ranking: { ...paper.ranking, relevance } }),
    }
  }).sort((left, right) => (
    (right.ranking?.relevance ?? 0) - (left.ranking?.relevance ?? 0)
    || (right.ranking?.influentialCitationCount ?? 0)
      - (left.ranking?.influentialCitationCount ?? 0)
    || (right.ranking?.citationCount ?? 0) - (left.ranking?.citationCount ?? 0)
    || right.submitted.localeCompare(left.submitted)
  ))
}
