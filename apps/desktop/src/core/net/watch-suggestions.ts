import {
  WatchSuggestionResultSchema,
  type AuthorCandidate,
  type WatchAuthorSuggestion,
  type WatchSuggestionResult,
  type WatchTopicSuggestion,
} from '../../shared/contract.js'
import type { SearchPaper } from './openalex.js'

const RESULT_LIMIT = 6
const CACHE_MS = 24 * 60 * 60 * 1_000

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'i', 'in',
  'is', 'it', 'language', 'large', 'llm', 'llms', 'model', 'models', 'of', 'on', 'or',
  'paper', 'papers', 'study', 'the', 'this', 'to', 'using', 'via', 'want', 'with',
])

type TopicCandidate = {
  name: string
  score: number
  papers: Set<number>
  seeded: boolean
}

const tokens = (value: string): string[] => (
  value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
)

const usefulRuns = (value: string): string[][] => {
  const runs: string[][] = []
  let current: string[] = []
  for (const token of tokens(value)) {
    if (STOP_WORDS.has(token) || /^\d+$/.test(token)) {
      if (current.length > 0) runs.push(current)
      current = []
    } else {
      current.push(token)
    }
  }
  if (current.length > 0) runs.push(current)
  return runs
}

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
        const phrase = run.slice(at, at + size).join(' ')
        if (size === 1 && phrase.length < 4) continue
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

  const ranked = [...candidates.values()].filter((candidate) => (
    candidate.seeded || candidate.papers.size >= (tokens(candidate.name).length === 1 ? 2 : 1)
  )).sort((left, right) => (
    Number(right.seeded) - Number(left.seeded)
    || right.papers.size - left.papers.size
    || right.score - left.score
    || tokens(right.name).length - tokens(left.name).length
    || left.name.localeCompare(right.name)
  ))

  const selected: TopicCandidate[] = []
  for (const candidate of ranked) {
    const words = tokens(candidate.name)
    const redundant = selected.some((held) => {
      const heldWords = tokens(held.name)
      return words.length === 1 && heldWords.includes(words[0]!)
        || heldWords.length === 1 && words.includes(heldWords[0]!) && !candidate.seeded
        || candidate.name.includes(held.name) && candidate.papers.size <= held.papers.size && !candidate.seeded
    })
    if (!redundant) selected.push(candidate)
    if (selected.length === RESULT_LIMIT) break
  }
  return selected.map((candidate) => ({
    name: candidate.name,
    relatedPapers: candidate.papers.size,
  }))
}

const authorSuggestions = (
  papers: SearchPaper[], impacts: AuthorCandidate[],
): WatchAuthorSuggestion[] => {
  const relevance = new Map<string, { name: string; papers: Set<number>; score: number }>()
  papers.forEach((paper, at) => {
    const paperWeight = 1 / (1 + at * 0.18)
      + Math.log1p(paper.influentialCitationCount) * 0.04
    for (const author of paper.authors) {
      const held = relevance.get(author.id) ?? { name: author.name, papers: new Set<number>(), score: 0 }
      held.papers.add(at)
      held.score += paperWeight
      relevance.set(author.id, held)
    }
  })
  const maxRelevance = Math.max(1, ...[...relevance.values()].map((item) => item.score))
  const maxHIndex = Math.max(1, ...impacts.map((item) => Math.log1p(item.hIndex)))
  const maxCitations = Math.max(1, ...impacts.map((item) => Math.log1p(item.citationCount)))
  return impacts.flatMap((impact) => {
    const topical = relevance.get(impact.id)
    if (topical === undefined) return []
    const score = topical.score / maxRelevance * 0.7
      + Math.log1p(impact.hIndex) / maxHIndex * 0.2
      + Math.log1p(impact.citationCount) / maxCitations * 0.1
    return [{
      ...impact,
      name: impact.name || topical.name,
      relatedPapers: topical.papers.size,
      score,
    }]
  }).sort((left, right) => (
    right.score - left.score
    || right.relatedPapers - left.relatedPapers
    || right.hIndex - left.hIndex
    || right.citationCount - left.citationCount
    || left.name.localeCompare(right.name)
  )).slice(0, RESULT_LIMIT).map((author) => ({
    source: author.source,
    id: author.id,
    name: author.name,
    affiliations: author.affiliations,
    paperCount: author.paperCount,
    citationCount: author.citationCount,
    hIndex: author.hIndex,
    relatedPapers: author.relatedPapers,
  }))
}

export type WatchSuggestions = {
  suggest(input: { focus: string; seedTopics?: string[] }): Promise<WatchSuggestionResult>
}

/** Where suggestions read papers and author impact from. */
export type SuggestionSource = {
  searchPapers(query: string): Promise<SearchPaper[]>
  authorImpacts(ids: readonly string[]): Promise<AuthorCandidate[]>
}

/**
 * Suggests watches with scholarly search plus deterministic extraction and ranking. It performs
 * no model calls, owns no durable state, and returns only candidates for explicit user review.
 * When the source fails and the same request was answered before, it returns that answer marked `stale`.
 */
export function createWatchSuggestions(deps: {
  source: SuggestionSource
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
      const key = `${focus.toLocaleLowerCase()}\n${seedTopics.map((topic) => topic.toLocaleLowerCase()).sort().join('\n')}`
      const now = (deps.now ?? Date.now)()
      const held = cache.get(key)
      if (held !== undefined && now - held.at < (deps.cacheMs ?? CACHE_MS)) {
        return Promise.resolve(structuredClone(held.value))
      }
      const running = pending.get(key)
      if (running !== undefined) return running.then((value) => structuredClone(value))

      const request = deps.source.searchPapers(focus)
        .then(async (papers) => {
          const authorIds = [...new Set(papers.flatMap((paper) => paper.authors.map((author) => author.id)))]
          const impacts = await deps.source.authorImpacts(authorIds)
          return WatchSuggestionResultSchema.parse({
            topics: topicSuggestions(focus, seedTopics, papers),
            authors: authorSuggestions(papers, impacts),
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
