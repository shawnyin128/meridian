import { watchQuery, type Arxiv, type RemotePaper } from '../../net/arxiv.js'
import type {
  DiscoveryPaper, RecommendationProvider, RecommendationSeed, RecommendationSource,
} from '../types.js'
import { keyPhrases, seedSimilarity, topicWords } from './seed-text.js'

const RESULT_LIMIT = 20
/** Similar papers come from this many calendar years, the current one included. */
const TOPICAL_YEARS = 5
/** Newest papers and same-author papers come from this many calendar years, the current one included. */
const RECENT_YEARS = 2
const PHRASE_LIMIT = 3
const TITLE_WORD_LIMIT = 4
/** Candidates whose text is less similar to every seed than this are off topic and dropped. */
const MIN_SIMILARITY = 0.05
/** Papers found by author name alone need a closer match, since a name says nothing of the topic. */
const AUTHOR_MIN_SIMILARITY = 0.08
/** Share of the final score that comes from arXiv's own order rather than the candidate's text. */
const POSITION_WEIGHT = 0.35

const ARXIV_SEED = /^ARXIV:(.+)$/i

const quoted = (value: string): string => value.replace(/"/g, ' ').trim()

/**
 * The arXiv query for the seeds' topic: their key phrases in a title or abstract, or, when the seeds
 * share no phrase, every topic word of the first seed's title. Returns null when there is nothing to ask.
 */
const topicQuery = (seeds: RecommendationSeed[]): string | null => {
  const phrases = keyPhrases(seeds, PHRASE_LIMIT)
  if (phrases.length > 0) {
    return phrases.flatMap((phrase) => [`ti:"${quoted(phrase)}"`, `abs:"${quoted(phrase)}"`]).join(' OR ')
  }
  const words = [...new Set(topicWords(seeds[0]?.title ?? ''))].slice(0, TITLE_WORD_LIMIT)
  return words.length === 0 ? null : words.map((word) => `all:${quoted(word)}`).join(' AND ')
}

/**
 * Orders candidates by arXiv's position blended with how close their text is to the seeds, dropping
 * the seeds themselves and candidates less similar than `minSimilarity`.
 */
const ranked = (
  found: RemotePaper[], seeds: RecommendationSeed[], source: RecommendationSource, seedArxivIds: Set<string>,
  minSimilarity: number,
): DiscoveryPaper[] => {
  const pool = found.filter((paper) => !seedArxivIds.has(paper.id))
  const similarity = seedSimilarity(seeds, pool)
  const topSimilarity = Math.max(Number.EPSILON, ...similarity)
  const seedPaperIds = seeds.map((seed) => seed.paperId)
  return pool.flatMap((paper, at) => (similarity[at]! < minSimilarity ? [] : [{
    paper,
    score: POSITION_WEIGHT * (1 - at / pool.length) + (1 - POSITION_WEIGHT) * similarity[at]! / topSimilarity,
  }])).sort((left, right) => right.score - left.score).slice(0, RESULT_LIMIT).map(({ paper, score }) => ({
    ...paper,
    semanticId: `ARXIV:${paper.id}`,
    ranking: {
      relevance: Math.max(0, Math.min(1, score)),
      published: paper.journalRef !== null,
      citationCount: 0,
      influentialCitationCount: 0,
      submitted: paper.submitted,
    },
    origins: [{ source, seedPaperIds: [...seedPaperIds], provider: 'arxiv' as const }],
  }))
}

/**
 * Project discovery backed by arXiv search, which needs no key. Similarity searches the seeds' key
 * phrases over the last few years by relevance. arXiv keeps no citations, so citation and reference
 * requests return the newest papers on the same phrases, labelled as similarity. Author follows the
 * first and last author of the first seed arXiv knows. Every candidate must be textually close to a
 * seed; negative seeds only act through Core's own exclusion.
 */
export function createArxivRecommendations(deps: { arxiv: Arxiv; now: () => number }): RecommendationProvider {
  const currentYear = () => new Date(deps.now()).getUTCFullYear()
  return {
    async recommend(positive, _negativePaperIds, source = 'similarity') {
      if (positive.length === 0) return []
      const seedArxivIds = new Set(positive.flatMap((seed) => ARXIV_SEED.exec(seed.paperId)?.[1] ?? []))
      if (source === 'author') {
        const [first] = seedArxivIds
        if (first === undefined) return []
        const authors = (await deps.arxiv.lookupMany?.([first]))?.get(first)?.authors ?? []
        const named = [...new Set([authors[0], authors.at(-1)])].filter((name): name is string => name !== undefined)
        if (named.length === 0) return []
        const query = named.map((name) => watchQuery({ type: 'author', name })).join(' OR ')
        const found = await deps.arxiv.searchTopical(query, currentYear() - RECENT_YEARS + 1, 'submittedDate')
        return ranked(found, positive, 'author', seedArxivIds, AUTHOR_MIN_SIMILARITY)
      }
      const query = topicQuery(positive)
      if (query === null) return []
      const found = source === 'similarity'
        ? await deps.arxiv.searchTopical(query, currentYear() - TOPICAL_YEARS + 1, 'relevance')
        : await deps.arxiv.searchTopical(query, currentYear() - RECENT_YEARS + 1, 'submittedDate')
      return ranked(found, positive, 'similarity', seedArxivIds, MIN_SIMILARITY)
    },
  }
}
