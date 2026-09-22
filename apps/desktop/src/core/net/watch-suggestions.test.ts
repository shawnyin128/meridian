import { describe, expect, it } from 'vitest'
import type { AuthorCandidate } from '../../shared/contract.js'
import type { ScholarAuthor, SearchPaper } from './scholar-sources.js'
import { createWatchSuggestions, type SuggestionSource } from './watch-suggestions.js'

const NOW = Date.UTC(2026, 8, 22)

const papers: SearchPaper[] = [
  {
    title: 'Speculative Decoding with Adaptive Draft Trees', year: 2025, citationCount: 140, influentialCitationCount: 18,
    authors: [{ id: 'a1', name: 'Ada Expert' }, { id: 'a2', name: 'Ben Researcher' }],
  },
  {
    title: 'Efficient Speculative Decoding for Batched Inference', year: 2024, citationCount: 80, influentialCitationCount: 9,
    authors: [{ id: 'a1', name: 'Ada Expert' }, { id: 'a3', name: 'Cy Scholar' }],
  },
  {
    title: 'Draft Tree Verification for Efficient Inference', year: 2023, citationCount: 20, influentialCitationCount: 2,
    authors: [{ id: 'a3', name: 'Cy Scholar' }],
  },
]

const author = (candidate: Omit<AuthorCandidate, 'source'>, activeYear: number | null = 2026): ScholarAuthor => ({
  candidate: { source: 'openalex', ...candidate }, activeYear,
})

const impacts: ScholarAuthor[] = [
  author({ id: 'a1', name: 'Ada Expert', affiliations: ['MIT'], paperCount: 120, citationCount: 8_000, hIndex: 42 }),
  author({ id: 'a2', name: 'Ben Researcher', affiliations: ['Stanford'], paperCount: 500, citationCount: 50_000, hIndex: 95 }),
  author({ id: 'a3', name: 'Cy Scholar', affiliations: ['CMU'], paperCount: 70, citationCount: 2_000, hIndex: 28 }),
]

const fakeSource = (name: SuggestionSource['name'], found: SearchPaper[], known: ScholarAuthor[]) => {
  const calls: { searched: { query: string; sinceYear: number }[]; impacted: string[][] } = { searched: [], impacted: [] }
  const state = { failing: false }
  const source: SuggestionSource = {
    name,
    async searchPapers(query, sinceYear) {
      calls.searched.push({ query, sinceYear })
      if (state.failing) throw new Error(`${name} offline`)
      return structuredClone(found)
    },
    async authorImpacts(ids) {
      calls.impacted.push([...ids])
      return structuredClone(known)
    },
  }
  return { source, calls, fail: () => { state.failing = true } }
}

const setup = (options: { cacheMs?: number } = {}) => {
  const fake = fakeSource('openalex', papers, impacts)
  let clock = NOW
  const service = createWatchSuggestions({ sources: () => [fake.source], now: () => clock, ...options })
  return { service, calls: fake.calls, fail: fake.fail, advance: (ms: number) => { clock += ms } }
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
    expect(calls.impacted).toEqual([['a1', 'a3', 'a2']])
    expect(result.stale).toBeUndefined()
  })

  it('只搜近 5 年的论文', async () => {
    const { service, calls } = setup()
    await service.suggest({ focus: 'speculative decoding' })
    expect(calls.searched).toEqual([{ query: 'speculative decoding', sinceYear: 2022 }])
  })

  it('夸奖性的词不当主题的头尾，宽泛的词不单独成主题，单个词最多两个', async () => {
    const titles = [
      'Efficient and Accurate Quantized Kernels', 'Accurate Parallel Kernels', 'Efficient Quantized Attention',
      'Parallel Attention Kernels', 'Robust Sparse Routing', 'Sparse Routing Kernels', 'Scalable Mixture Routing',
      'Mixture Routing Attention', 'Adaptive Kernels', 'Adaptive Routing Kernels',
    ]
    const fake = fakeSource('openalex', titles.map((title) => ({
      title, year: 2025, authors: [], citationCount: 0, influentialCitationCount: 0,
    })), [])
    const service = createWatchSuggestions({ sources: () => [fake.source], now: () => NOW })
    const { topics } = await service.suggest({ focus: 'kernels' })
    const names = topics.map((topic) => topic.name)

    for (const name of names) {
      const words = name.split(' ')
      expect(['efficient', 'accurate', 'robust', 'scalable']).not.toContain(words[0])
      expect(['efficient', 'accurate', 'robust', 'scalable']).not.toContain(words.at(-1))
    }
    expect(names).not.toContain('quantized')
    expect(names).not.toContain('parallel')
    expect(names).not.toContain('adaptive')
    expect(names.filter((name) => !name.includes(' ')).length).toBeLessThanOrEqual(2)
    expect(names).toEqual(expect.arrayContaining(['sparse routing', 'mixture routing']))
  })

  it('短语不跨标点、不以动词开头，只在长短语里出现的片段让位给长短语', async () => {
    const titles = [
      'SpecInfer: Tree Search', 'Medusa: Tree Search', 'Accelerating Tree Search',
      'Unlocking Efficiency in Decoding', 'Unlocking Efficiency for Serving',
      'Convolutional Neural Networks for Routing', 'Convolutional Neural Networks at Scale',
    ]
    const fake = fakeSource('openalex', titles.map((title) => ({
      title, year: 2025, authors: [], citationCount: 0, influentialCitationCount: 0,
    })), [])
    const service = createWatchSuggestions({ sources: () => [fake.source], now: () => NOW })
    const names = (await service.suggest({ focus: 'moe' })).topics.map((topic) => topic.name)

    expect(names).toEqual(expect.arrayContaining(['tree search', 'convolutional neural networks']))
    expect(names.some((name) => name.includes('specinfer') || name.includes('medusa'))).toBe(false)
    expect(names.some((name) => name.includes('unlocking') || name.includes('accelerating'))).toBe(false)
    expect(names).not.toContain('efficiency')
    expect(names).not.toContain('convolutional neural')
    expect(names).not.toContain('neural networks')
  })

  it('冒号前的系统名不和后面的词拼成短语', async () => {
    const fake = fakeSource('openalex', ['Medusa: Draft Heads', 'Eagle: Feature Drafting'].map((title) => ({
      title, year: 2025, authors: [], citationCount: 0, influentialCitationCount: 0,
    })), [])
    const service = createWatchSuggestions({ sources: () => [fake.source], now: () => NOW })
    const names = (await service.suggest({ focus: 'moe' })).topics.map((topic) => topic.name)
    expect(names).toEqual(expect.arrayContaining(['draft heads', 'feature drafting']))
    expect(names.filter((name) => name.startsWith('medusa') || name.startsWith('eagle'))).toEqual([])
  })

  it('研究领域和多数相关作者不同的作者排在同档作者后面', async () => {
    const found: SearchPaper[] = ['A', 'B'].map((title) => ({
      title, year: 2025, citationCount: 0, influentialCitationCount: 0,
      authors: [{ id: 'merged', name: 'Merged' }, { id: 'cs1', name: 'Cs One' }, { id: 'cs2', name: 'Cs Two' }],
    }))
    const known = [
      author({ id: 'merged', name: 'Merged', affiliations: [], paperCount: 900, citationCount: 90_000, hIndex: 90, field: 'Chemistry' }),
      author({ id: 'cs1', name: 'Cs One', affiliations: [], paperCount: 9, citationCount: 90, hIndex: 5, field: 'Computer Science' }),
      author({ id: 'cs2', name: 'Cs Two', affiliations: [], paperCount: 9, citationCount: 80, hIndex: 4, field: 'Computer Science' }),
    ]
    const fake = fakeSource('openalex', found, known)
    const service = createWatchSuggestions({ sources: () => [fake.source], now: () => NOW })
    const { authors } = await service.suggest({ focus: 'moe' })
    expect(authors.map((item) => item.id)).toEqual(['cs1', 'cs2', 'merged'])
  })

  it('只有单个词可选时也最多给两个', async () => {
    const titles = ['Kernels', 'Kernels', 'Attention', 'Attention', 'Routing', 'Routing', 'Sparsity', 'Sparsity']
    const fake = fakeSource('openalex', titles.map((title) => ({
      title, year: 2025, authors: [], citationCount: 0, influentialCitationCount: 0,
    })), [])
    const service = createWatchSuggestions({ sources: () => [fake.source], now: () => NOW })
    const { topics } = await service.suggest({ focus: 'moe' })
    expect(topics).toHaveLength(2)
  })

  it('只合写过一篇的作者排在合写多篇的作者后面，哪怕那篇排第一、影响力更高', async () => {
    const paper = (title: string, ids: string[], influentialCitationCount = 0): SearchPaper => ({
      title, year: 2025, citationCount: 0, influentialCitationCount,
      authors: ids.map((id) => ({ id, name: id })),
    })
    const found = [
      paper('Speculative Decoding', ['star'], 500),
      ...['One', 'Two', 'Three', 'Four', 'Five'].map((title) => paper(`Filler ${title}`, [])),
      paper('Draft Trees', ['steady']), paper('Tree Verification', ['steady']),
    ]
    const known = [
      author({ id: 'star', name: 'Star', affiliations: [], paperCount: 400, citationCount: 90_000, hIndex: 84 }),
      author({ id: 'steady', name: 'Steady', affiliations: [], paperCount: 30, citationCount: 900, hIndex: 12 }),
    ]
    const fake = fakeSource('openalex', found, known)
    const service = createWatchSuggestions({ sources: () => [fake.source], now: () => NOW })
    const { authors } = await service.suggest({ focus: 'speculative decoding' })
    expect(authors.map((item) => item.id)).toEqual(['steady', 'star'])
  })

  it('不推荐近两年没有论文的作者；来源不报活跃年份时看搜到的论文年份', async () => {
    const found: SearchPaper[] = [
      { title: 'Speculative Decoding', year: 2023, citationCount: 0, influentialCitationCount: 0,
        authors: [{ id: 'old', name: 'Retired' }, { id: 'quiet', name: 'Quiet' }, { id: 'fresh', name: 'Fresh' }] },
      { title: 'Draft Trees', year: 2025, citationCount: 0, influentialCitationCount: 0,
        authors: [{ id: 'fresh', name: 'Fresh' }] },
    ]
    const known = [
      author({ id: 'old', name: 'Retired', affiliations: [], paperCount: 9, citationCount: 900, hIndex: 9 }, 2021),
      author({ id: 'quiet', name: 'Quiet', affiliations: [], paperCount: 9, citationCount: 900, hIndex: 9 }, null),
      author({ id: 'fresh', name: 'Fresh', affiliations: [], paperCount: 9, citationCount: 900, hIndex: 9 }, null),
    ]
    const fake = fakeSource('semantic-scholar', found, known)
    const service = createWatchSuggestions({ sources: () => [fake.source], now: () => NOW })
    const { authors } = await service.suggest({ focus: 'speculative decoding' })
    expect(authors.map((item) => item.id)).toEqual(['fresh'])
  })

  it('第一个来源失败时整份建议改由下一个来源给出', async () => {
    const semantic = fakeSource('semantic-scholar', papers, impacts)
    semantic.fail()
    const openAlex = fakeSource('openalex', papers, impacts)
    const service = createWatchSuggestions({ sources: () => [semantic.source, openAlex.source], now: () => NOW })
    const result = await service.suggest({ focus: 'speculative decoding' })

    expect(semantic.calls.searched).toHaveLength(1)
    expect(semantic.calls.impacted).toEqual([])
    expect(openAlex.calls.impacted).toHaveLength(1)
    expect(result.authors[0]).toMatchObject({ source: 'openalex', id: 'a1' })
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

  it('换了来源顺序就不复用旧缓存', async () => {
    const semantic = fakeSource('semantic-scholar', papers, impacts)
    const openAlex = fakeSource('openalex', papers, impacts)
    let withKey = false
    const service = createWatchSuggestions({
      sources: () => (withKey ? [semantic.source, openAlex.source] : [openAlex.source]), now: () => NOW,
    })
    await service.suggest({ focus: 'speculative decoding' })
    withKey = true
    await service.suggest({ focus: 'speculative decoding' })
    expect(semantic.calls.searched).toHaveLength(1)
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
    await expect(service.suggest({ focus: 'speculative decoding' })).rejects.toThrow('openalex offline')
  })
})
