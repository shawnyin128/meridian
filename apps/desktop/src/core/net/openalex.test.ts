import { describe, expect, it } from 'vitest'
import type { HttpGet } from './http.js'
import {
  createOpenAlex, openAlexAuthorBatchUrl, openAlexAuthorWorksUrl, parseOpenAlexAuthors,
  parseOpenAlexAuthorWorks, parseOpenAlexWorks,
} from './openalex.js'

const body = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

describe('OpenAlex', () => {
  it('论文搜索只保留有标题的，作者 id 去掉 URL 前缀', () => {
    expect(parseOpenAlexWorks(body({ results: [
      {
        id: 'https://openalex.org/W1', title: 'QLoRA', cited_by_count: 510,
        authorships: [{ author: { id: 'https://openalex.org/A1', display_name: 'Tim Dettmers' } }, { author: null }],
      },
      { id: 'https://openalex.org/W2', title: '' },
    ] }))).toEqual([{
      title: 'QLoRA', authors: [{ id: 'A1', name: 'Tim Dettmers' }], citationCount: 510, influentialCitationCount: 0,
    }])
  })

  it('作者带来源、机构去重、h-index 取自 summary_stats', () => {
    expect(parseOpenAlexAuthors(body({ results: [
      {
        id: 'https://openalex.org/A5070926896', display_name: 'Song Han', works_count: 222, cited_by_count: 33_073,
        summary_stats: { h_index: 58 },
        last_known_institutions: [{ display_name: 'MIT' }, { display_name: 'MIT' }, { display_name: '' }],
      },
      { id: '', display_name: 'Broken' },
    ] }))).toEqual([{
      source: 'openalex', id: 'A5070926896', name: 'Song Han', affiliations: ['MIT'],
      paperCount: 222, citationCount: 33_073, hIndex: 58,
    }])
  })

  it('作者论文只保留能拿到 arXiv 编号的，去重、还原摘要并按日期倒排', () => {
    const papers = parseOpenAlexAuthorWorks(body({ results: [
      {
        title: 'Journal only', publication_date: '2026-03-10', type: 'article',
        ids: { doi: 'https://doi.org/10.1145/1' }, locations: [{ landing_page_url: 'https://dl.acm.org/1' }],
      },
      {
        title: 'Older', publication_date: '2025-10-19', type: 'conference-paper', cited_by_count: 9,
        ids: { doi: 'https://doi.org/10.1109/iccv' }, locations: [{ landing_page_url: 'http://arxiv.org/abs/2507.04947v2' }],
        abstract_inverted_index: { Fast: [0], models: [1] },
        authorships: [{ author: { id: 'https://openalex.org/A1', display_name: 'Song Han' } }],
      },
      {
        title: 'Newer', publication_date: '2025-12-01', type: 'preprint',
        ids: { doi: 'https://doi.org/10.48550/arxiv.2512.01278' },
      },
      {
        title: 'Duplicate', publication_date: '2025-01-01', type: 'preprint',
        ids: { doi: 'https://doi.org/10.48550/ARXIV.2512.01278' },
      },
    ] }))
    expect(papers.map((paper) => paper.id)).toEqual(['2512.01278', '2507.04947'])
    expect(papers[0]!.ranking?.published).toBe(false)
    expect(papers[1]).toMatchObject({
      abstract: 'Fast models', authors: ['Song Han'], pdf: 'https://arxiv.org/pdf/2507.04947',
      ranking: { published: true, citationCount: 9 },
    })
  })

  it('作者机构最多留前三个，免得把历年所有挂靠都列出来', () => {
    const [author] = parseOpenAlexAuthors(body({ results: [{
      id: 'https://openalex.org/A1', display_name: 'Song Han',
      last_known_institutions: ['MIT', 'Nvidia', 'Tsinghua', 'Stanford', 'CIA'].map((name) => ({ display_name: name })),
    }] }))
    expect(author!.affiliations).toEqual(['MIT', 'Nvidia', 'Tsinghua'])
  })

  it('拒绝无法识别的返回结构', () => {
    expect(() => parseOpenAlexWorks(body({ data: [] }))).toThrow('无法识别的论文结果')
    expect(() => parseOpenAlexAuthors(body({ data: [] }))).toThrow('无法识别的作者结果')
    expect(() => parseOpenAlexAuthorWorks(body({ data: [] }))).toThrow('无法识别的作者论文结果')
  })

  it('批量取作者与按作者取论文用 OpenAlex 的过滤语法', () => {
    expect(new URL(openAlexAuthorBatchUrl(['A1', 'A2'])).searchParams.get('filter')).toBe('openalex:A1|A2')
    const works = new URL(openAlexAuthorWorksUrl('A1'))
    expect(works.searchParams.get('filter')).toBe('author.id:A1')
    expect(works.searchParams.get('sort')).toBe('publication_date:desc')
  })

  it('相同名字复用成功缓存，并合并同时发生的查询', async () => {
    let calls = 0
    let release: (() => void) | undefined
    const blocked = new Promise<void>((done) => { release = done })
    const get: HttpGet = async () => {
      calls += 1
      await blocked
      return { status: 200, body: body({ results: [{ id: 'https://openalex.org/A1', display_name: 'Song Han' }] }) }
    }
    const openAlex = createOpenAlex({ get, sleep: async () => {}, now: () => 100 })
    const one = openAlex.searchAuthors('Song  Han')
    const two = openAlex.searchAuthors(' song han ')
    release?.()
    await expect(Promise.all([one, two])).resolves.toHaveLength(2)
    await expect(openAlex.searchAuthors('SONG HAN')).resolves.toMatchObject([{ source: 'openalex', id: 'A1' }])
    expect(calls).toBe(1)
  })
})
