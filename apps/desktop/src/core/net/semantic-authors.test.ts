import { describe, expect, it } from 'vitest'
import type { HttpGet } from './http.js'
import { createSemanticAuthors, parseAuthorPapers } from './semantic-authors.js'

const body = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

describe('Semantic Scholar authors', () => {
  it('按作者 id 取回的论文只保留 arXiv 项,去版本、去重并按日期倒排', () => {
    expect(parseAuthorPapers(body({ data: [
      {
        title: 'Older', publicationDate: '2024-02-03', externalIds: { ArXiv: '2402.00001v2' },
        authors: [{ name: 'Alex Kim' }], venue: 'ICLR', citationCount: 9,
        influentialCitationCount: 2, publicationTypes: ['Conference'],
      },
      { title: 'Not downloadable', publicationDate: '2026-01-01', externalIds: {} },
      {
        title: 'Newer', publicationDate: '2026-03-04', externalIds: { ArXiv: '2603.00002' },
        authors: [{ name: 'Alex Kim' }], venue: 'arXiv', publicationTypes: [],
      },
      { title: 'Duplicate', publicationDate: '2023-01-01', externalIds: { ArXiv: '2603.00002' } },
    ] })).map((paper) => paper.id)).toEqual(['2603.00002', '2402.00001'])
  })

  it('按作者取回的论文带上 externalIds 里的 DOI,没有 DOI 的不带这一项', async () => {
    const get: HttpGet = async () => ({ status: 200, body: body({ data: [
      { title: 'With DOI', publicationDate: '2026-03-04', externalIds: { ArXiv: '2603.00002', DOI: ' 10.1145/3600006.3613165 ' } },
      { title: 'Without DOI', publicationDate: '2026-02-01', externalIds: { ArXiv: '2602.00001' } },
    ] }) })
    const papers = await createSemanticAuthors({ get, sleep: async () => {} }).papers('s2-alex-kim')
    expect(papers.map((paper) => [paper.title, paper.doi])).toEqual([
      ['With DOI', '10.1145/3600006.3613165'], ['Without DOI', undefined],
    ])
    expect('doi' in papers[1]!).toBe(false)
  })

  it('拒绝无法识别的返回结构', () => {
    expect(() => parseAuthorPapers(body({ papers: [] }))).toThrow('无法识别的作者论文结果')
  })
})
