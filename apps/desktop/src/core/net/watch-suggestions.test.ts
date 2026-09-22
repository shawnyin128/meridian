import { describe, expect, it } from 'vitest'
import type { AuthorCandidate } from '../../shared/contract.js'
import type { SearchPaper } from './openalex.js'
import { createWatchSuggestions, type SuggestionSource } from './watch-suggestions.js'

const papers: SearchPaper[] = [
  {
    title: 'Speculative Decoding with Adaptive Draft Trees', citationCount: 140, influentialCitationCount: 18,
    authors: [{ id: 'a1', name: 'Ada Expert' }, { id: 'a2', name: 'Ben Researcher' }],
  },
  {
    title: 'Efficient Speculative Decoding for Batched Inference', citationCount: 80, influentialCitationCount: 9,
    authors: [{ id: 'a1', name: 'Ada Expert' }, { id: 'a3', name: 'Cy Scholar' }],
  },
  {
    title: 'Draft Tree Verification for Efficient Inference', citationCount: 20, influentialCitationCount: 2,
    authors: [{ id: 'a3', name: 'Cy Scholar' }],
  },
]

const impacts: AuthorCandidate[] = [
  { source: 'openalex', id: 'a1', name: 'Ada Expert', affiliations: ['MIT'], paperCount: 120, citationCount: 8_000, hIndex: 42 },
  { source: 'openalex', id: 'a2', name: 'Ben Researcher', affiliations: ['Stanford'], paperCount: 500, citationCount: 50_000, hIndex: 95 },
  { source: 'openalex', id: 'a3', name: 'Cy Scholar', affiliations: ['CMU'], paperCount: 70, citationCount: 2_000, hIndex: 28 },
]

const setup = (options: { cacheMs?: number } = {}) => {
  const calls: { searched: string[]; impacted: string[][] } = { searched: [], impacted: [] }
  let failing = false
  const source: SuggestionSource = {
    async searchPapers(query) {
      calls.searched.push(query)
      if (failing) throw new Error('offline')
      return structuredClone(papers)
    },
    async authorImpacts(ids) {
      calls.impacted.push([...ids])
      return structuredClone(impacts)
    },
  }
  let clock = 1_000
  const service = createWatchSuggestions({ source, now: () => clock, ...options })
  return { service, calls, fail: () => { failing = true }, advance: (ms: number) => { clock += ms } }
}

describe('watch suggestions', () => {
  it('proposes supported topics and ranks authors by relevance plus impact', async () => {
    const { service, calls } = setup()
    const result = await service.suggest({
      focus: 'I want to focus on efficient inference with speculative decoding',
      seedTopics: ['batch-aware verification'],
    })

    expect(result.paperCount).toBe(3)
    expect(result.topics).toEqual(expect.arrayContaining([
      { name: 'batch-aware verification', relatedPapers: 0 },
      { name: 'speculative decoding', relatedPapers: 2 },
    ]))
    expect(result.authors[0]).toMatchObject({
      source: 'openalex', id: 'a1', name: 'Ada Expert', relatedPapers: 2, hIndex: 42,
    })
    expect(calls.impacted).toEqual([['a1', 'a2', 'a3']])
    expect(result.stale).toBeUndefined()
  })

  it('caches identical requests and returns isolated values', async () => {
    const { service, calls } = setup()
    const input = { focus: 'speculative decoding', seedTopics: ['draft trees'] }
    const first = await service.suggest(input)
    first.topics[0]!.name = 'changed by caller'
    const second = await service.suggest(input)

    expect(calls.searched).toHaveLength(1)
    expect(second.topics[0]!.name).not.toBe('changed by caller')
  })

  it('falls back to the last answer, marked stale, when the source fails after the cache expires', async () => {
    const { service, fail, advance } = setup({ cacheMs: 10 })
    const input = { focus: 'speculative decoding' }
    const fresh = await service.suggest(input)
    advance(11)
    fail()
    const fallback = await service.suggest(input)
    expect(fallback).toEqual({ ...fresh, stale: true })
  })

  it('fails when the source fails and nothing was answered before', async () => {
    const { service, fail } = setup()
    fail()
    await expect(service.suggest({ focus: 'speculative decoding' })).rejects.toThrow('offline')
  })
})
