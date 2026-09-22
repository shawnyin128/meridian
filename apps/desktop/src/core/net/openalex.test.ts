import { describe, expect, it } from 'vitest'
import {
  openAlexAuthorBatchUrl, openAlexAuthorWorksUrl, openAlexWorkSearchUrl, parseOpenAlexAuthors,
  parseOpenAlexAuthorWorks, parseOpenAlexWorks,
} from './openalex.js'

const body = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

describe('OpenAlex', () => {
  it('论文搜索只保留有标题的，作者 id 去掉 URL 前缀', () => {
    expect(parseOpenAlexWorks(body({ results: [
      {
        id: 'https://openalex.org/W1', title: 'QLoRA', cited_by_count: 510, publication_year: 2023,
        authorships: [{ author: { id: 'https://openalex.org/A1', display_name: 'Tim Dettmers' } }, { author: null }],
      },
      { id: 'https://openalex.org/W2', title: '' },
    ] }))).toEqual([{
      title: 'QLoRA', year: 2023, authors: [{ id: 'A1', name: 'Tim Dettmers' }], citationCount: 510, influentialCitationCount: 0,
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
    ] }), 2026)).toEqual([{
      candidate: {
        source: 'openalex', id: 'A5070926896', name: 'Song Han', affiliations: ['MIT'],
        paperCount: 222, citationCount: 33_073, hIndex: 58,
      },
      activeYear: null,
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

  it('机构按近 5 年出现的年数排，只留前两个；第二个要近 5 年里至少出现 3 年，总年数也不少于第一个的一半', () => {
    const affiliated = (affiliations: [string, number[]][]) => parseOpenAlexAuthors(body({ results: [{
      id: 'https://openalex.org/A1', display_name: 'Song Han',
      affiliations: affiliations.map(([name, years]) => ({ institution: { display_name: name }, years })),
      last_known_institutions: [{ display_name: 'Central Intelligence Agency' }],
    }] }), 2026)[0]!.candidate.affiliations
    expect(affiliated([
      ['Tsinghua University', [2021, 2016, 2011]],
      ['Nvidia', [2026, 2025, 2024]],
      ['Central Intelligence Agency', [2026]],
      ['Massachusetts Institute of Technology', [2025, 2024, 2023, 2022, 2021, 2020]],
    ])).toEqual(['Massachusetts Institute of Technology', 'Nvidia'])
    expect(affiliated([
      ['University of Connecticut', [2025, 2024, 2023, 2022]],
      ['University of Southern California', [2025, 2024]],
    ])).toEqual(['University of Connecticut'])
    expect(affiliated([
      ['Tsinghua University', [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017]],
      ['Research Center for Information Technology in Agriculture', [2025, 2024, 2023, 2022]],
    ])).toEqual(['Tsinghua University'])
  })

  it('没有带年份的机构时退回最后已知机构，最多两个', () => {
    const [author] = parseOpenAlexAuthors(body({ results: [{
      id: 'https://openalex.org/A1', display_name: 'Song Han',
      last_known_institutions: ['MIT', 'Nvidia', 'Tsinghua'].map((name) => ({ display_name: name })),
    }] }), 2026)
    expect(author!.candidate.affiliations).toEqual(['MIT', 'Nvidia'])
  })

  it('带出研究领域和前两个主题，活跃年份取有论文的最近一年', () => {
    const [author] = parseOpenAlexAuthors(body({ results: [{
      id: 'https://openalex.org/A1', display_name: 'Song Han',
      topics: [
        { display_name: 'Advanced Neural Network Applications', field: { display_name: 'Computer Science' } },
        { display_name: 'Domain Adaptation and Few-Shot Learning', field: { display_name: 'Computer Science' } },
        { display_name: 'Adversarial Robustness in Machine Learning', field: { display_name: 'Computer Science' } },
      ],
      counts_by_year: [{ year: 2026, works_count: 0 }, { year: 2025, works_count: 4 }, { year: 2024, works_count: 9 }],
    }] }), 2026)
    expect(author!.candidate).toMatchObject({
      field: 'Computer Science',
      topics: ['Advanced Neural Network Applications', 'Domain Adaptation and Few-Shot Learning'],
    })
    expect(author!.activeYear).toBe(2025)
  })

  it('拒绝无法识别的返回结构', () => {
    expect(() => parseOpenAlexWorks(body({ data: [] }))).toThrow('无法识别的论文结果')
    expect(() => parseOpenAlexAuthors(body({ data: [] }), 2026)).toThrow('无法识别的作者结果')
    expect(() => parseOpenAlexAuthorWorks(body({ data: [] }))).toThrow('无法识别的作者论文结果')
  })

  it('论文搜索只取给定年份之后发表的', () => {
    expect(new URL(openAlexWorkSearchUrl('qlora', 2022)).searchParams.get('filter')).toBe('from_publication_date:2022-01-01')
  })

  it('批量取作者与按作者取论文用 OpenAlex 的过滤语法', () => {
    expect(new URL(openAlexAuthorBatchUrl(['A1', 'A2'])).searchParams.get('filter')).toBe('openalex:A1|A2')
    const works = new URL(openAlexAuthorWorksUrl('A1'))
    expect(works.searchParams.get('filter')).toBe('author.id:A1')
    expect(works.searchParams.get('sort')).toBe('publication_date:desc')
  })
})
