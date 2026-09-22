import { describe, expect, it } from 'vitest'
import { createSemanticAuthors, parseAuthorCandidates, parseAuthorPapers } from './semantic-authors.js'
import type { HttpGet } from './http.js'

const body = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

describe('Semantic Scholar authors', () => {
  it('作者候选只保留可确认项,并清洗机构和统计', () => {
    expect(parseAuthorCandidates(body({ data: [
      {
        authorId: '123', name: 'Alex Kim', affiliations: ['MIT', 'MIT', ''],
        paperCount: 42, citationCount: 800, hIndex: 17,
      },
      { authorId: '', name: 'Broken' },
    ] }))).toEqual([{
      id: '123', name: 'Alex Kim', affiliations: ['MIT'],
      paperCount: 42, citationCount: 800, hIndex: 17,
    }])
  })

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

  it('拒绝无法识别的返回结构', () => {
    expect(() => parseAuthorCandidates(body({ authors: [] }))).toThrow('无法识别的作者结果')
    expect(() => parseAuthorPapers(body({ papers: [] }))).toThrow('无法识别的作者论文结果')
  })

  it('相同名字复用成功缓存，并合并同时发生的查询', async () => {
    let calls = 0
    let release: (() => void) | undefined
    const blocked = new Promise<void>((done) => { release = done })
    const get: HttpGet = async () => {
      calls += 1
      await blocked
      return { status: 200, body: body({ data: [{ authorId: '1', name: 'Song Han' }] }) }
    }
    const authors = createSemanticAuthors({ get, sleep: async () => {}, now: () => 100 })
    const one = authors.search('Song  Han')
    const two = authors.search(' song han ')
    release?.()
    await expect(Promise.all([one, two])).resolves.toHaveLength(2)
    await expect(authors.search('SONG HAN')).resolves.toMatchObject([{ id: '1' }])
    expect(calls).toBe(1)
  })
})
