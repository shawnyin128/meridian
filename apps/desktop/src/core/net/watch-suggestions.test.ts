import { describe, expect, it, vi } from 'vitest'
import type { HttpGet } from './http.js'
import {
  createWatchSuggestions,
  parseSuggestionAuthors,
  parseSuggestionPapers,
  semanticAuthorBatchUrl,
  semanticPaperSearchUrl,
} from './watch-suggestions.js'

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value))

const papers = {
  data: [
    {
      paperId: 'p1', title: 'Speculative Decoding with Adaptive Draft Trees',
      citationCount: 140, influentialCitationCount: 18,
      authors: [{ authorId: 'a1', name: 'Ada Expert' }, { authorId: 'a2', name: 'Ben Researcher' }],
    },
    {
      paperId: 'p2', title: 'Efficient Speculative Decoding for Batched Inference',
      citationCount: 80, influentialCitationCount: 9,
      authors: [{ authorId: 'a1', name: 'Ada Expert' }, { authorId: 'a3', name: 'Cy Scholar' }],
    },
    {
      paperId: 'p3', title: 'Draft Tree Verification for Efficient Inference',
      citationCount: 20, influentialCitationCount: 2,
      authors: [{ authorId: 'a3', name: 'Cy Scholar' }],
    },
  ],
}

const authors = [
  {
    authorId: 'a1', name: 'Ada Expert', affiliations: ['MIT'],
    paperCount: 120, citationCount: 8_000, hIndex: 42,
  },
  {
    authorId: 'a2', name: 'Ben Researcher', affiliations: ['Stanford'],
    paperCount: 500, citationCount: 50_000, hIndex: 95,
  },
  {
    authorId: 'a3', name: 'Cy Scholar', affiliations: ['CMU'],
    paperCount: 70, citationCount: 2_000, hIndex: 28,
  },
]

const setup = () => {
  const calls: Array<{ url: string; method: string; body?: string }> = []
  const get: HttpGet = vi.fn(async (url, options) => {
    calls.push({
      url,
      method: options.method ?? 'GET',
      ...(options.body === undefined ? {} : { body: options.body }),
    })
    return { status: 200, body: encode(options.method === 'POST' ? authors : papers) }
  })
  const service = createWatchSuggestions({
    get, sleep: async () => {}, now: () => 1_000,
  })
  return { service, calls }
}

describe('watch suggestions', () => {
  it('builds a plain-text scholarly search URL with only the required fields', () => {
    const url = new URL(semanticPaperSearchUrl('fast inference & draft trees'))
    expect(url.pathname).toBe('/graph/v1/paper/search')
    expect(url.searchParams.get('query')).toBe('fast inference & draft trees')
    expect(url.searchParams.get('limit')).toBe('24')
    expect(url.searchParams.get('fields')).toBe(
      'paperId,title,authors,citationCount,influentialCitationCount',
    )
    expect(semanticAuthorBatchUrl()).toContain('/graph/v1/author/batch?')
  })

  it('rejects malformed provider payloads at the network boundary', () => {
    expect(() => parseSuggestionPapers(encode({ results: [] }))).toThrow('paper result')
    expect(() => parseSuggestionAuthors(encode({ data: [] }))).toThrow('author details')
  })

  it('proposes supported topics and ranks authors by relevance plus impact', async () => {
    const { service, calls } = setup()
    const result = await service.suggest({
      focus: 'I want to focus on efficient inference with speculative decoding',
      seedTopics: ['batch-aware verification'],
    })

    expect(result.paperCount).toBe(3)
    expect(result.topics).toEqual(expect.arrayContaining([
      { name: 'batch aware verification', relatedPapers: 0 },
      { name: 'speculative decoding', relatedPapers: 2 },
    ]))
    expect(result.authors[0]).toMatchObject({
      id: 'a1', name: 'Ada Expert', relatedPapers: 2, hIndex: 42,
    })
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ method: 'GET' })
    expect(calls[1]).toMatchObject({ method: 'POST' })
    expect(JSON.parse(calls[1]!.body!)).toEqual({ ids: ['a1', 'a2', 'a3'] })
  })

  it('caches identical requests and returns isolated values', async () => {
    const { service, calls } = setup()
    const input = { focus: 'speculative decoding', seedTopics: ['draft trees'] }
    const first = await service.suggest(input)
    first.topics[0]!.name = 'changed by caller'
    const second = await service.suggest(input)

    expect(calls).toHaveLength(2)
    expect(second.topics[0]!.name).not.toBe('changed by caller')
  })
})
