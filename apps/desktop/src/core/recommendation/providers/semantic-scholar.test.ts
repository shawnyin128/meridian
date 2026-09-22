import { describe, expect, it, vi } from 'vitest'
import type { HttpGet } from '../../net/http.js'
import {
  createSemanticRecommendations,
  createSemanticScholar,
  parseSemanticAuthorNeighbors,
  parseSemanticRelations,
  parsePaperImpact,
  parseSemanticRecommendations,
  semanticAuthorNeighborsUrl,
  semanticCitationUrl,
  semanticReferenceUrl,
  semanticScholarBatchUrl,
} from './semantic-scholar.js'

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

describe('Semantic Scholar recommendations', () => {
  it('keeps only usable arXiv papers and preserves API relevance order', () => {
    const result = parseSemanticRecommendations(bytes({ recommendedPapers: [
      {
        paperId: 's1', title: 'First', abstract: 'A', authors: [{ name: 'Ada' }], venue: 'ICLR',
        publicationDate: '2026-09-01', citationCount: 12, influentialCitationCount: 2,
        externalIds: { ArXiv: '2609.00001v2' }, publicationTypes: ['Conference'],
      },
      { paperId: 's2', title: 'No arxiv', externalIds: {} },
      {
        paperId: 's3', title: 'Second', authors: [], year: 2025,
        externalIds: { ArXiv: '2501.00002' }, citationCount: null,
      },
    ] }))
    expect(result.map((paper) => paper.id)).toEqual(['2609.00001', '2501.00002'])
    expect(result[0]).toMatchObject({
      semanticId: 's1', authors: ['Ada'], journalRef: 'ICLR',
      ranking: { relevance: 1, published: true, citationCount: 12, submitted: '2026-09-01' },
    })
    expect(result[1]?.submitted).toBe('2025-01-01')
  })

  it('posts positive and negative seeds through the shared network boundary', async () => {
    const get = vi.fn(async (_url, options) => ({
      status: 200, body: bytes({ recommendedPapers: [] }), request: options.body,
    }))
    const client = createSemanticRecommendations({ get, sleep: async () => {} })
    await client.recommend(['ARXIV:1'], ['s2'])
    expect(JSON.parse(get.mock.calls[0]![1].body!)).toEqual({
      positivePaperIds: ['ARXIV:1'], negativePaperIds: ['s2'],
    })
  })

  it('normalizes citation and reference neighbors while keeping arXiv-resolvable papers', () => {
    const related = {
      paperId: 'neighbor', title: 'Graph Neighbor', abstract: 'draft verification',
      authors: [{ name: 'Ada' }], publicationDate: '2026-09-10',
      externalIds: { ArXiv: '2609.00123v1' }, citationCount: 8,
    }
    expect(parseSemanticRelations(bytes({
      data: [{ citingPaper: related }, { citingPaper: null }],
    }), 'citation')[0]).toMatchObject({
      semanticId: 'neighbor', id: '2609.00123', title: 'Graph Neighbor',
    })
    expect(parseSemanticRelations(bytes({
      data: [{ citedPaper: related }],
    }), 'reference')[0]?.semanticId).toBe('neighbor')
  })

  it('interleaves author branches instead of letting one prolific author monopolize results', () => {
    const paper = (paperId: string, arxiv: string) => ({
      paperId, title: paperId, externalIds: { ArXiv: arxiv }, year: 2026,
    })
    const result = parseSemanticAuthorNeighbors(bytes({ data: [
      { authorId: 'a', papers: [paper('a1', '2609.00001'), paper('a2', '2609.00002')] },
      { authorId: 'b', papers: [paper('b1', '2609.00003')] },
    ] }))
    expect(result.map((item) => item.semanticId)).toEqual(['a1', 'b1', 'a2'])
  })

  it('routes every exploration source through one bounded Graph API request', async () => {
    const urls: string[] = []
    const get: HttpGet = async (url) => {
      urls.push(url)
      if (url.includes('/authors?')) return { status: 200, body: bytes({ data: [] }) }
      return { status: 200, body: bytes({ data: [] }) }
    }
    const client = createSemanticRecommendations({ get, sleep: async () => {} })
    await client.recommend(['ARXIV:2605.29343'], [], 'citation')
    await client.recommend(['ARXIV:2605.29343'], [], 'reference')
    await client.recommend(['ARXIV:2605.29343'], [], 'author')
    expect(urls).toEqual([
      semanticCitationUrl('ARXIV:2605.29343'),
      semanticReferenceUrl('ARXIV:2605.29343'),
      semanticAuthorNeighborsUrl('ARXIV:2605.29343'),
    ])
  })
})

describe('Semantic Scholar paper batch', () => {
  it('只保留排名所需字段,忽略找不到的论文与坏数值', () => {
    const result = parsePaperImpact(bytes([
      {
        externalIds: { ArXiv: '2211.17192v2' }, citationCount: 413,
        influentialCitationCount: 37, venue: 'ICML', publicationTypes: ['Conference'],
      },
      null,
      { externalIds: { ArXiv: '2609.00001' }, citationCount: -2, venue: 'ArXiv' },
    ]))
    expect(result.get('2211.17192')).toEqual({
      citationCount: 413, influentialCitationCount: 37, venue: 'ICML', published: true,
    })
    expect(result.get('2609.00001')).toEqual({
      citationCount: 0, influentialCitationCount: 0, venue: 'ArXiv', published: false,
    })
  })

  it('一批论文只发一次 POST,使用 arXiv 外部编号', async () => {
    const calls: { url: string; method?: string; body?: string }[] = []
    const get: HttpGet = async (url, options) => {
      calls.push({
        url,
        ...(options.method === undefined ? {} : { method: options.method }),
        ...(options.body === undefined ? {} : { body: options.body }),
      })
      return { status: 200, body: bytes([]) }
    }
    const scholar = createSemanticScholar({ get, sleep: async () => {} })
    await scholar.lookup(['2211.17192', '2609.00001'])
    expect(calls).toEqual([{
      url: semanticScholarBatchUrl, method: 'POST',
      body: JSON.stringify({ ids: ['ARXIV:2211.17192', 'ARXIV:2609.00001'] }),
    }])
  })

  it('429 不在影响力补全上重试,避免把非必要请求叠成限流', async () => {
    let calls = 0
    const get: HttpGet = async () => { calls += 1; return { status: 429, body: bytes({}) } }
    const scholar = createSemanticScholar({ get, sleep: async () => { throw new Error('不应等待') } })
    await expect(scholar.lookup(['2211.17192'])).rejects.toThrow('服务器返回 429')
    expect(calls).toBe(1)
  })

  it('同一会话里 24 小时内复用影响力结果,手动连续检查不重复请求', async () => {
    let calls = 0
    let now = 1_000
    const get: HttpGet = async () => {
      calls += 1
      return { status: 200, body: bytes([{
        externalIds: { ArXiv: '2211.17192' }, citationCount: 10,
        influentialCitationCount: 1, venue: 'ICML', publicationTypes: ['Conference'],
      }]) }
    }
    const scholar = createSemanticScholar({ get, sleep: async () => {}, now: () => now })
    expect((await scholar.lookup(['2211.17192'])).get('2211.17192')?.citationCount).toBe(10)
    now += 60_000
    expect((await scholar.lookup(['2211.17192'])).get('2211.17192')?.citationCount).toBe(10)
    expect(calls).toBe(1)
  })
})
