import {
  WatchSuggestionResultSchema,
  type WatchAuthorSuggestion,
  type WatchSuggestionResult,
  type WatchTopicSuggestion,
} from '../../shared/contract.js'
import { getWithRetry, requestWithRetry, type HttpGet } from './http.js'

const PAPER_FIELDS = [
  'paperId', 'title', 'authors', 'citationCount', 'influentialCitationCount',
].join(',')
const AUTHOR_FIELDS = ['name', 'affiliations', 'paperCount', 'citationCount', 'hIndex'].join(',')
const PAPER_LIMIT = 24
const RESULT_LIMIT = 6
const AUTHOR_BATCH_LIMIT = 30
const CACHE_MS = 24 * 60 * 60 * 1_000
const TIMEOUT_MS = 10_000

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'i', 'in',
  'is', 'it', 'language', 'large', 'llm', 'llms', 'model', 'models', 'of', 'on', 'or',
  'paper', 'papers', 'study', 'the', 'this', 'to', 'using', 'via', 'want', 'with',
])

type SearchAuthor = { id: string; name: string }
type SearchPaper = {
  title: string
  authors: SearchAuthor[]
  citationCount: number
  influentialCitationCount: number
}

type AuthorImpact = {
  id: string
  name: string
  affiliations: string[]
  paperCount: number
  citationCount: number
  hIndex: number
}

type TopicCandidate = {
  name: string
  score: number
  papers: Set<number>
  seeded: boolean
}

export const semanticPaperSearchUrl = (query: string): string => (
  `https://api.semanticscholar.org/graph/v1/paper/search?${new URLSearchParams({
    query, limit: String(PAPER_LIMIT), fields: PAPER_FIELDS,
  }).toString()}`
)

export const semanticAuthorBatchUrl = (): string => (
  `https://api.semanticscholar.org/graph/v1/author/batch?${new URLSearchParams({
    fields: AUTHOR_FIELDS,
  }).toString()}`
)

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const count = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
)

const decoded = (body: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(body))

/** Projects the loose paper-search payload into the fields used for deterministic ranking. */
export function parseSuggestionPapers(body: Uint8Array): SearchPaper[] {
  const payload = decoded(body)
  if (payload === null || typeof payload !== 'object'
    || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new Error('Semantic Scholar returned an unrecognized paper result')
  }
  return (payload as { data: unknown[] }).data.flatMap((item) => {
    if (item === null || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const title = text(row['title'])
    if (title === '') return []
    const authors = Array.isArray(row['authors']) ? row['authors'].flatMap((author) => {
      if (author === null || typeof author !== 'object') return []
      const value = author as Record<string, unknown>
      const id = text(value['authorId'])
      const name = text(value['name'])
      return id === '' || name === '' ? [] : [{ id, name }]
    }) : []
    return [{
      title, authors,
      citationCount: count(row['citationCount']),
      influentialCitationCount: count(row['influentialCitationCount']),
    }]
  })
}

/** Projects an author-batch response into stable identities and public impact metadata. */
export function parseSuggestionAuthors(body: Uint8Array): AuthorImpact[] {
  const payload = decoded(body)
  if (!Array.isArray(payload)) throw new Error('Semantic Scholar returned unrecognized author details')
  return payload.flatMap((item) => {
    if (item === null || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const id = text(row['authorId'])
    const name = text(row['name'])
    if (id === '' || name === '') return []
    const affiliations = Array.isArray(row['affiliations'])
      ? [...new Set(row['affiliations'].map(text).filter(Boolean))] : []
    return [{
      id, name, affiliations,
      paperCount: count(row['paperCount']),
      citationCount: count(row['citationCount']),
      hIndex: count(row['hIndex']),
    }]
  })
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
  papers: SearchPaper[], impacts: AuthorImpact[],
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

/**
 * Suggests watches with scholarly search plus deterministic extraction and ranking. It performs
 * no model calls, owns no durable state, and returns only candidates for explicit user review.
 */
export function createWatchSuggestions(deps: {
  get: HttpGet
  sleep: (ms: number) => Promise<void>
  now?: () => number
  cacheMs?: number
}): WatchSuggestions {
  const cache = new Map<string, { at: number; value: WatchSuggestionResult }>()
  const pending = new Map<string, Promise<WatchSuggestionResult>>()
  const policy = {
    timeoutMs: TIMEOUT_MS, tries: 2, backoffMs: 1_000,
    limit: 8 * 1024 * 1024, sleep: deps.sleep,
  }

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

      const request = getWithRetry(deps.get, semanticPaperSearchUrl(focus), policy)
        .then(parseSuggestionPapers)
        .then(async (papers) => {
          const authorIds = [...new Set(papers.flatMap((paper) => paper.authors.map((author) => author.id)))]
            .slice(0, AUTHOR_BATCH_LIMIT)
          const impacts = authorIds.length === 0 ? [] : parseSuggestionAuthors(await requestWithRetry(
            deps.get,
            semanticAuthorBatchUrl(),
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ ids: authorIds }),
            },
            policy,
          ))
          return WatchSuggestionResultSchema.parse({
            topics: topicSuggestions(focus, seedTopics, papers),
            authors: authorSuggestions(papers, impacts),
            paperCount: papers.length,
          })
        })
        .then((value) => {
          cache.set(key, { at: (deps.now ?? Date.now)(), value: structuredClone(value) })
          return value
        })
        .finally(() => pending.delete(key))
      pending.set(key, request)
      return request.then((value) => structuredClone(value))
    },
  }
}
