import {
  WatchSuggestionResultSchema,
  type AuthorCandidate,
  type WatchAuthorSuggestion,
  type WatchSuggestionResult,
  type WatchTopicSuggestion,
} from '../../shared/contract.js'
import type { Arxiv } from './arxiv.js'
import { firstAnswer, type ScholarSource, type SearchPaper } from './scholar-sources.js'

const RESULT_LIMIT = 6
const SINGLE_WORD_TOPIC_LIMIT = 2
const CACHE_MS = 24 * 60 * 60 * 1_000
/** Papers from this many calendar years, the current one included, feed suggestions. */
const RECENT_PAPER_YEARS = 5
/** Authors whose latest known paper is more than this many years before the current one are not suggested. */
const ACTIVE_WITHIN_YEARS = 2
const AUTHOR_LOOKUP_LIMIT = 50
/** Authors sharing at least this many searched papers rank ahead of one-paper co-authors. */
const SHARED_PAPER_TIER = 2

/** Words that end a candidate phrase: function words and words that name a kind of paper rather than a topic. */
const STOP_WORDS = new Set([
  'a', 'accelerating', 'achieving', 'across', 'all', 'an', 'and', 'approach', 'approaches', 'are', 'as', 'at', 'be', 'between', 'beyond',
  'boosting', 'bridging', 'by', 'can', 'do', 'does', 'enabling', 'enhancing', 'exploring', 'for', 'framework', 'frameworks', 'from', 'how', 'i', 'in', 'into', 'is', 'it',
  'harnessing', 'its', 'language', 'large', 'leveraging', 'llm', 'llms', 'making', 'method', 'methods', 'model', 'models', 'new', 'not', 'of', 'on',
  'or', 'our', 'over', 'paper', 'papers', 'rethinking', 'revisiting', 'study', 'survey', 'than', 'the', 'their', 'this', 'through', 'to',
  'toward', 'towards', 'under', 'understanding', 'unleashing', 'unlocking', 'using', 'versus', 'via', 'vs', 'want', 'we', 'what', 'when', 'which', 'why',
  'with', 'without',
])

/** Words that say how well a paper did rather than what it is about: never a topic's first or last word. */
const GENERIC_MODIFIERS = new Set([
  'accurate', 'better', 'effective', 'efficient', 'efficiently', 'fast', 'faster', 'improved', 'improving',
  'lightweight', 'novel', 'practical', 'robust', 'scalable', 'simple', 'unified',
])

/** Words too broad to watch alone, though they stay inside longer topics such as reinforcement learning. */
const BROAD_WORDS = new Set([
  'adaptive', 'application', 'applications', 'data', 'dataset', 'datasets', 'deep', 'efficiency', 'evaluation', 'inference',
  'learning', 'network', 'networks', 'neural', 'parallel', 'performance', 'problem', 'problems', 'quantized',
  'results', 'system', 'systems', 'task', 'tasks', 'training',
])

type TopicCandidate = {
  name: string
  score: number
  papers: Set<number>
  seeded: boolean
}

/** Lower-cased words, keeping hyphenated terms such as post-training whole. */
const tokens = (value: string): string[] => (
  value.toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? []
)

/** Runs of topic words: a phrase never spans punctuation, such as the colon after a system name, or a stop word. */
const usefulRuns = (value: string): string[][] => {
  const runs: string[][] = []
  for (const segment of value.split(/[:;,.!?()[\]{}"“”]|\s[-–—]\s/)) {
    let current: string[] = []
    for (const token of tokens(segment)) {
      if (STOP_WORDS.has(token) || /^\d+$/.test(token)) {
        if (current.length > 0) runs.push(current)
        current = []
      } else {
        current.push(token)
      }
    }
    if (current.length > 0) runs.push(current)
  }
  return runs
}

/** Whether a derived phrase names a topic: no generic modifier at either end, and no broad word on its own. */
const topical = (words: string[]): boolean => (
  !GENERIC_MODIFIERS.has(words[0]!) && !GENERIC_MODIFIERS.has(words.at(-1)!)
  && !(words.length === 1 && BROAD_WORDS.has(words[0]!))
)

const addTopic = (
  candidates: Map<string, TopicCandidate>, name: string, score: number,
  paper: number | null, seeded: boolean,
): void => {
  name = tokens(name).join(' ')
  if (name.length < 3 || name.length > 80) return
  const held = candidates.get(name) ?? { name, score: 0, papers: new Set<number>(), seeded: false }
  held.score += score
  held.seeded ||= seeded
  if (paper !== null) held.papers.add(paper)
  candidates.set(name, held)
}

const addPhrases = (
  candidates: Map<string, TopicCandidate>, value: string, weight: number, paper: number | null,
): void => {
  for (const run of usefulRuns(value)) {
    for (let size = 1; size <= Math.min(3, run.length); size += 1) {
      for (let at = 0; at + size <= run.length; at += 1) {
        const words = run.slice(at, at + size)
        const phrase = words.join(' ')
        if (size === 1 && phrase.length < 4 || !topical(words)) continue
        addTopic(candidates, phrase, weight * (size === 1 ? 0.28 : size === 2 ? 1.2 : 0.95), paper, false)
      }
    }
  }
}

const topicSuggestions = (
  focus: string, seedTopics: string[], papers: SearchPaper[],
): WatchTopicSuggestion[] => {
  const candidates = new Map<string, TopicCandidate>()
  addPhrases(candidates, focus, 0.75, null)
  papers.forEach((paper, at) => addPhrases(candidates, paper.title, 1 / (1 + at * 0.12), at))
  for (const seed of seedTopics) addTopic(candidates, seed, 5, null, true)

  // A phrase several papers share is more specific than the single words inside it, so it ranks first.
  const shared = (candidate: TopicCandidate): boolean => (
    tokens(candidate.name).length > 1 && candidate.papers.size >= 2
  )
  // A fragment that only ever appears inside one longer phrase, such as "convolutional neural", gives way to it.
  const all = [...candidates.values()]
  const partial = (candidate: TopicCandidate): boolean => !candidate.seeded && candidate.papers.size > 0
    && all.some((other) => other !== candidate && other.name.length > candidate.name.length
      && ` ${other.name} `.includes(` ${candidate.name} `) && other.papers.size >= candidate.papers.size)
  const ranked = all.filter((candidate) => (
    (candidate.seeded || candidate.papers.size >= (tokens(candidate.name).length === 1 ? 2 : 1)) && !partial(candidate)
  )).sort((left, right) => (
    Number(right.seeded) - Number(left.seeded)
    || Number(shared(right)) - Number(shared(left))
    || right.papers.size - left.papers.size
    || right.score - left.score
    || tokens(right.name).length - tokens(left.name).length
    || left.name.localeCompare(right.name)
  ))

  const selected: TopicCandidate[] = []
  let singleWords = 0
  for (const candidate of ranked) {
    const words = tokens(candidate.name)
    if (words.length === 1 && !candidate.seeded && singleWords === SINGLE_WORD_TOPIC_LIMIT) continue
    const redundant = selected.some((held) => {
      const heldWords = tokens(held.name)
      return words.length === 1 && heldWords.includes(words[0]!)
        || heldWords.length === 1 && words.includes(heldWords[0]!) && !candidate.seeded
        || candidate.name.includes(held.name) && candidate.papers.size <= held.papers.size && !candidate.seeded
    })
    if (!redundant) {
      selected.push(candidate)
      if (words.length === 1 && !candidate.seeded) singleWords += 1
    }
    if (selected.length === RESULT_LIMIT) break
  }
  return selected.map((candidate) => ({
    name: candidate.name,
    relatedPapers: candidate.papers.size,
  }))
}

type AuthorRelevance = { name: string; papers: Set<number>; score: number; latestYear: number | null }

/** How strongly each author is tied to the searched papers, weighted by search rank and influence. */
const relevanceOf = (papers: SearchPaper[]): Map<string, AuthorRelevance> => {
  const relevance = new Map<string, AuthorRelevance>()
  papers.forEach((paper, at) => {
    const paperWeight = 1 / (1 + at * 0.18)
      + Math.log1p(paper.influentialCitationCount) * 0.04
    for (const author of paper.authors) {
      const held = relevance.get(author.id) ?? { name: author.name, papers: new Set<number>(), score: 0, latestYear: null }
      held.papers.add(at)
      held.score += paperWeight
      if (paper.year !== null) held.latestYear = Math.max(held.latestYear ?? paper.year, paper.year)
      relevance.set(author.id, held)
    }
  })
  return relevance
}

/** The authors worth looking up: most shared papers first, then relevance. */
const lookupIds = (relevance: Map<string, AuthorRelevance>): string[] => (
  [...relevance.entries()].sort(([, left], [, right]) => (
    right.papers.size - left.papers.size || right.score - left.score
  )).slice(0, AUTHOR_LOOKUP_LIMIT).map(([id]) => id)
)

/** Whether an author's latest related paper, when its year is known, is recent enough to suggest. */
const active = (topical: AuthorRelevance, currentYear: number): boolean => (
  topical.latestYear === null || topical.latestYear >= currentYear - ACTIVE_WITHIN_YEARS
)

/** Authors sharing several papers first, then the higher score, relatedness, impact and name. */
const byTierAndScore = (
  left: { suggestion: WatchAuthorSuggestion; score: number }, right: { suggestion: WatchAuthorSuggestion; score: number },
): number => (
  Number(right.suggestion.relatedPapers >= SHARED_PAPER_TIER) - Number(left.suggestion.relatedPapers >= SHARED_PAPER_TIER)
  || right.score - left.score
  || right.suggestion.relatedPapers - left.suggestion.relatedPapers
  || ('hIndex' in right.suggestion ? right.suggestion.hIndex : 0) - ('hIndex' in left.suggestion ? left.suggestion.hIndex : 0)
  || left.suggestion.name.localeCompare(right.suggestion.name)
)

/**
 * Ranks suggested authors. With `impacts` from a source that knows identities, only those identities
 * are suggested and impact adds to relevance; without them the authors are suggested by name.
 */
const authorSuggestions = (
  relevance: Map<string, AuthorRelevance>, impacts: AuthorCandidate[] | null, currentYear: number,
): WatchAuthorSuggestion[] => {
  const maxRelevance = Math.max(1, ...[...relevance.values()].map((item) => item.score))
  if (impacts === null) {
    return [...relevance.values()].filter((topical) => active(topical, currentYear)).map((topical) => ({
      suggestion: { name: topical.name, relatedPapers: topical.papers.size },
      score: topical.score / maxRelevance,
    })).sort(byTierAndScore).slice(0, RESULT_LIMIT).map(({ suggestion }) => suggestion)
  }
  const maxHIndex = Math.max(1, ...impacts.map((item) => Math.log1p(item.hIndex)))
  const maxCitations = Math.max(1, ...impacts.map((item) => Math.log1p(item.citationCount)))
  return impacts.flatMap((candidate) => {
    const topical = relevance.get(candidate.id)
    if (topical === undefined || !active(topical, currentYear)) return []
    const score = topical.score / maxRelevance * 0.7
      + Math.log1p(candidate.hIndex) / maxHIndex * 0.2
      + Math.log1p(candidate.citationCount) / maxCitations * 0.1
    return [{
      suggestion: { ...candidate, name: candidate.name || topical.name, relatedPapers: topical.papers.size },
      score,
    }]
  }).sort(byTierAndScore).slice(0, RESULT_LIMIT).map(({ suggestion }) => suggestion)
}

export type WatchSuggestions = {
  suggest(input: { focus: string; seedTopics?: string[] }): Promise<WatchSuggestionResult>
}

/** Where suggestions read papers and author impact from. */
export type SuggestionSource = ScholarSource

/**
 * Suggests watches with scholarly search plus deterministic extraction and ranking. It performs
 * no model calls, owns no durable state, and returns only candidates for explicit user review.
 * Each request asks `sources()` in order and answers wholly from the first that succeeds, since
 * author ids only mean something within one source. When every source fails and the same request
 * was answered before, it returns that answer marked `stale`.
 */
export function createWatchSuggestions(deps: {
  sources: () => readonly SuggestionSource[]
  now?: () => number
  cacheMs?: number
}): WatchSuggestions {
  const cache = new Map<string, { at: number; value: WatchSuggestionResult }>()
  const pending = new Map<string, Promise<WatchSuggestionResult>>()

  return {
    suggest(input) {
      const focus = input.focus.trim().replace(/\s+/g, ' ')
      const seedTopics = [...new Set((input.seedTopics ?? [])
        .map((topic) => topic.trim()).filter(Boolean))]
      const sources = deps.sources()
      const key = [
        sources.map((source) => source.name).join('>'), focus.toLocaleLowerCase(),
        ...seedTopics.map((topic) => topic.toLocaleLowerCase()).sort(),
      ].join('\n')
      const now = (deps.now ?? Date.now)()
      const currentYear = new Date(now).getUTCFullYear()
      const held = cache.get(key)
      if (held !== undefined && now - held.at < (deps.cacheMs ?? CACHE_MS)) {
        return Promise.resolve(structuredClone(held.value))
      }
      const running = pending.get(key)
      if (running !== undefined) return running.then((value) => structuredClone(value))

      const request = firstAnswer(sources, async (source) => {
        const papers = await source.searchPapers(focus, currentYear - RECENT_PAPER_YEARS + 1)
        const relevance = relevanceOf(papers)
        const impacts = source.authorImpacts === undefined ? null : await source.authorImpacts(lookupIds(relevance))
        return WatchSuggestionResultSchema.parse({
          topics: topicSuggestions(focus, seedTopics, papers),
          authors: authorSuggestions(relevance, impacts, currentYear),
          paperCount: papers.length,
        })
      })
        .then((value) => {
          cache.set(key, { at: (deps.now ?? Date.now)(), value: structuredClone(value) })
          return value
        }, (error: unknown) => {
          if (held === undefined) throw error
          return { ...structuredClone(held.value), stale: true }
        })
        .finally(() => pending.delete(key))
      pending.set(key, request)
      return request.then((value) => structuredClone(value))
    },
  }
}

const QUERY_RUN_LIMIT = 4
const PHRASE_WORD_LIMIT = 3

/**
 * The arXiv query for a focus: its multi-word topic runs, or its single topic words when it has no
 * run, each matched anywhere in a paper and joined with OR. A run longer than a short phrase must
 * match word by word. Returns null when the focus names no topic.
 */
export function arxivFocusQuery(focus: string): string | null {
  const runs = [...new Map(usefulRuns(focus).map((run) => [run.join(' '), run])).values()]
  const multi = runs.filter((run) => run.length > 1)
  const single = runs.filter((run) => run.length === 1 && topical(run) && run[0]!.length >= 4)
  const chosen = (multi.length > 0 ? multi : single).slice(0, QUERY_RUN_LIMIT)
  if (chosen.length === 0) return null
  const clean = (word: string) => word.replace(/"/g, '')
  return chosen.map((run) => (run.length <= PHRASE_WORD_LIMIT
    ? `all:"${run.map(clean).join(' ')}"`
    : `(${run.map((word) => `all:${clean(word)}`).join(' AND ')})`)).join(' OR ')
}

/** Watch suggestions read from arXiv search, which names authors but keeps no identities or impact. */
export function createArxivSuggestionSource(arxiv: Pick<Arxiv, 'searchTopical'>): SuggestionSource {
  return {
    name: 'arxiv',
    async searchPapers(query, sinceYear) {
      const search = arxivFocusQuery(query)
      if (search === null) return []
      return (await arxiv.searchTopical(search, sinceYear, 'relevance')).map((paper) => ({
        title: paper.title,
        year: Number.parseInt(paper.submitted.slice(0, 4), 10) || null,
        authors: paper.authors.map((name) => ({ id: name.toLocaleLowerCase(), name })),
        citationCount: 0,
        influentialCitationCount: 0,
      }))
    },
  }
}
