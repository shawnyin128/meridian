import type { AuthorCandidate, AuthorIdentity } from '../../shared/contract.js'

const AUTHOR_SEARCH_CACHE_MS = 24 * 60 * 60 * 1_000

/** A searched paper reduced to what topic and author ranking read. */
export type SearchPaper = {
  title: string
  year: number | null
  authors: { id: string; name: string }[]
  citationCount: number
  influentialCitationCount: number
}

/** An author record plus the latest year the source saw them publish, or null when it does not say. */
export type ScholarAuthor = { candidate: AuthorCandidate; activeYear: number | null }

/** One scholarly graph that watch suggestions and author search can read. Ids only mean something within `name`. */
export type ScholarSource = {
  name: AuthorIdentity['source']
  /** Relevance-ranked papers published since `sinceYear`. */
  searchPapers(query: string, sinceYear: number): Promise<SearchPaper[]>
  authorImpacts(ids: readonly string[]): Promise<ScholarAuthor[]>
  searchAuthors(query: string): Promise<AuthorCandidate[]>
}

/**
 * Asks each source in order and returns the first answer. Throws the last source's error when all
 * fail, or an error when `sources` is empty.
 */
export async function firstAnswer<S, T>(sources: readonly S[], ask: (source: S) => Promise<T>): Promise<T> {
  let failure: unknown = new Error('没有可用的学术数据源')
  for (const source of sources) {
    try {
      return await ask(source)
    } catch (error) {
      failure = error
    }
  }
  throw failure
}

export type AuthorSearch = {
  search(query: string): Promise<AuthorCandidate[]>
}

/**
 * Author search over `sources()` in order, falling back to the next source when one fails. A
 * successful answer for the same name and source order is reused for a day, and concurrent lookups merge.
 */
export function createAuthorSearch(deps: {
  sources: () => readonly ScholarSource[]
  now?: () => number
  cacheMs?: number
}): AuthorSearch {
  const cache = new Map<string, { at: number; value: AuthorCandidate[] }>()
  const pending = new Map<string, Promise<AuthorCandidate[]>>()
  const now = deps.now ?? Date.now
  return {
    search(query) {
      const sources = deps.sources()
      const key = `${sources.map((source) => source.name).join('>')}\n${query.trim().replace(/\s+/g, ' ').toLocaleLowerCase()}`
      const held = cache.get(key)
      if (held !== undefined && now() - held.at < (deps.cacheMs ?? AUTHOR_SEARCH_CACHE_MS)) {
        return Promise.resolve(structuredClone(held.value))
      }
      const running = pending.get(key)
      if (running !== undefined) return running.then((value) => structuredClone(value))
      const request = firstAnswer(sources, (source) => source.searchAuthors(query))
        .then((value) => {
          cache.set(key, { at: now(), value: structuredClone(value) })
          return value
        })
        .finally(() => pending.delete(key))
      pending.set(key, request)
      return request.then((value) => structuredClone(value))
    },
  }
}
