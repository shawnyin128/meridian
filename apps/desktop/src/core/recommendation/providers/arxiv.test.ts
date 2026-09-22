import { describe, expect, it } from 'vitest'
import type { Arxiv, RemotePaper, TopicalOrder } from '../../net/arxiv.js'
import type { RecommendationSeed } from '../types.js'
import { createArxivRecommendations } from './arxiv.js'
import { keyPhrases, seedSimilarity } from './seed-text.js'

const NOW = Date.UTC(2026, 8, 22)

const seed = (paperId: string, title: string, abstract: string): RecommendationSeed => ({
  paperId, title, abstract, source: 'project',
})

const paper = (id: string, title: string, abstract: string, authors: string[] = ['Someone']): RemotePaper => ({
  id, title, abstract, authors, submitted: '2025-05-01', journalRef: null, pdf: `https://arxiv.org/pdf/${id}`,
})

const seeds = [
  seed('ARXIV:2101.03961', 'Switch Transformers: sparse mixture of experts',
    'We route tokens with a sparse mixture of experts layer and simplify expert routing.'),
  seed('ARXIV:2401.04088', 'Mixtral of Experts',
    'Mixtral is a sparse mixture of experts model; a router picks two experts per token.'),
]

const fakeArxiv = (found: RemotePaper[], known: RemotePaper[] = []) => {
  const asked: { query: string; sinceYear: number; order: TopicalOrder }[] = []
  const looked: string[][] = []
  const arxiv: Pick<Arxiv, 'searchTopical' | 'lookupMany'> & Arxiv = {
    search: async () => [],
    lookup: async () => null,
    lookupMany: async (ids) => {
      looked.push([...ids])
      return new Map(known.map((item) => [item.id, item]))
    },
    searchTopical: async (query, sinceYear, order) => {
      asked.push({ query, sinceYear, order })
      return structuredClone(found)
    },
  }
  return { arxiv, asked, looked }
}

const onTopic = paper('2402.00001', 'Expert choice routing for sparse mixture of experts',
  'A router assigns tokens to experts in a sparse mixture of experts layer.')
const offTopic = paper('2402.00002', 'Protein folding with diffusion', 'We fold proteins using diffusion models.')
const ownSeed = paper('2401.04088', 'Mixtral of Experts', 'Mixtral is a sparse mixture of experts model.')

describe('arXiv recommendations', () => {
  it('相似论文：用种子共有的关键短语按相关度搜近五年，剔除跑题的和种子本身，并标明来自 arXiv', async () => {
    const { arxiv, asked } = fakeArxiv([ownSeed, offTopic, onTopic])
    const provider = createArxivRecommendations({ arxiv, now: () => NOW })
    const found = await provider.recommend(seeds, [], 'similarity')

    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({ sinceYear: 2022, order: 'relevance' })
    expect(asked[0]!.query).toContain('abs:"mixture of experts"')
    expect(found.map((item) => item.id)).toEqual(['2402.00001'])
    expect(found[0]).toMatchObject({
      semanticId: 'ARXIV:2402.00001',
      origins: [{ source: 'similarity', seedPaperIds: ['ARXIV:2101.03961', 'ARXIV:2401.04088'], provider: 'arxiv' }],
    })
    expect(found[0]!.ranking!.relevance).toBeGreaterThan(0)
  })

  it('arXiv 没有引用数据：引用和参考文献改取同主题的最新论文，按相似论文标注', async () => {
    const { arxiv, asked } = fakeArxiv([onTopic])
    const provider = createArxivRecommendations({ arxiv, now: () => NOW })
    const found = await provider.recommend(seeds, [], 'citation')
    expect(asked[0]).toMatchObject({ sinceYear: 2025, order: 'submittedDate' })
    expect(found[0]!.origins).toEqual([expect.objectContaining({ source: 'similarity', provider: 'arxiv' })])
  })

  it('同作者：查出第一篇种子的第一和最后作者，按姓名搜近两年并过相似度门槛', async () => {
    const { arxiv, asked, looked } = fakeArxiv(
      [onTopic, offTopic],
      [paper('2101.03961', 'Switch Transformers', '', ['William Fedus', 'Barret Zoph', 'Noam Shazeer'])],
    )
    const provider = createArxivRecommendations({ arxiv, now: () => NOW })
    const found = await provider.recommend(seeds, [], 'author')
    expect(looked).toEqual([['2101.03961']])
    expect(asked[0]).toEqual({ query: 'au:"William Fedus" OR au:"Noam Shazeer"', sinceYear: 2025, order: 'submittedDate' })
    expect(found.map((item) => [item.id, item.origins?.[0]?.source])).toEqual([['2402.00001', 'author']])
  })

  it('按姓名找到的论文要更贴题才留下：同一篇擦边论文，相似论文里保留、同作者里剔除', async () => {
    const edge = paper('2402.00003', 'Routing packets in data center networks', '')
    const fillers = [
      'A benchmark of protein structures and molecular docking with graph networks.',
      'Robotic grasping policies learned from human video demonstrations.',
      'Weather forecasting with neural operators over global grids.',
    ].map((abstract, at) => paper(`2402.0010${at}`, `Paper ${at}`, abstract))
    const pool = [edge, offTopic, ...fillers]
    const author = paper('2101.03961', 'Switch Transformers', '', ['William Fedus'])
    const similar = await createArxivRecommendations({ arxiv: fakeArxiv(pool).arxiv, now: () => NOW })
      .recommend(seeds, [], 'similarity')
    const sameAuthor = await createArxivRecommendations({ arxiv: fakeArxiv(pool, [author]).arxiv, now: () => NOW })
      .recommend(seeds, [], 'author')
    expect(similar.map((item) => item.id)).toEqual(['2402.00003'])
    expect(sameAuthor).toEqual([])
  })

  it('没有 arXiv 种子时不搜同作者', async () => {
    const { arxiv, asked } = fakeArxiv([onTopic])
    const provider = createArxivRecommendations({ arxiv, now: () => NOW })
    await expect(provider.recommend([seed('s2-hash', 'Mixtral of Experts', '')], [], 'author')).resolves.toEqual([])
    expect(asked).toEqual([])
  })
})

describe('seed text', () => {
  it('关键短语：多篇种子共有的多词短语优先，中间可以有 of；单个词只取标题里出现过的', () => {
    const phrases = keyPhrases(seeds, 3)
    expect(phrases[0]).toBe('mixture of experts')
    expect(phrases).not.toContain('token')
    expect(keyPhrases([seed('x', 'Routing', 'tokens tokens tokens')], 3)).toEqual(['routing'])
    expect(keyPhrases([
      seed('a', 'Mixtral', 'Mixtral beats Llama 2 70B. Mixtral beats Llama 2 70B.'),
    ], 3).some((phrase) => /\d/.test(phrase))).toBe(false)
  })

  it('相似度：同主题的候选明显高于跑题的', () => {
    const [near, far] = seedSimilarity(seeds, [onTopic, offTopic])
    expect(near!).toBeGreaterThan(0.05)
    expect(far!).toBeLessThan(0.05)
  })
})
