import { describe, expect, it } from 'vitest'
import type { HttpGet, HttpRequestOptions } from './http.js'
import {
  createSemanticSearch, parseSemanticAuthorBatch, parseSemanticAuthorSearch, parseSemanticPapers,
  semanticPaperSearchUrl,
} from './semantic-search.js'

const body = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

describe('Semantic Scholar search', () => {
  it('论文搜索按年份起点过滤，并保留年份与作者 id', () => {
    expect(new URL(semanticPaperSearchUrl('qlora', 2022)).searchParams.get('year')).toBe('2022-')
    expect(parseSemanticPapers(body({ data: [
      {
        title: 'QLoRA', year: 2023, citationCount: 510, influentialCitationCount: 60,
        authors: [{ authorId: '1', name: 'Tim Dettmers' }, { authorId: null, name: 'Nobody' }],
      },
      { title: '' },
    ] }))).toEqual([{
      title: 'QLoRA', year: 2023, authors: [{ id: '1', name: 'Tim Dettmers' }],
      citationCount: 510, influentialCitationCount: 60,
    }])
  })

  it('作者带 semantic-scholar 来源，机构去重后最多两个；批量结果里未知 id 是 null', () => {
    const row = {
      authorId: '1', name: 'Song Han', affiliations: ['MIT', 'MIT', 'Nvidia', 'Stanford'],
      paperCount: 200, citationCount: 30_000, hIndex: 60,
    }
    const expected = {
      source: 'semantic-scholar', id: '1', name: 'Song Han', affiliations: ['MIT', 'Nvidia'],
      paperCount: 200, citationCount: 30_000, hIndex: 60,
    }
    expect(parseSemanticAuthorSearch(body({ data: [row] }))).toEqual([expected])
    expect(parseSemanticAuthorBatch(body([null, row]))).toEqual([expected])
    expect(() => parseSemanticAuthorBatch(body({ data: [] }))).toThrow('无法识别的作者结果')
  })

  it('批量取作者用 POST 发 id；被限流时重试一次再放弃，好让 arXiv 接手', async () => {
    const sent: { url: string; options: HttpRequestOptions }[] = []
    const get: HttpGet = async (url, options) => {
      sent.push({ url, options })
      return url.includes('/author/batch')
        ? { status: 200, body: body([{ authorId: '1', name: 'Song Han' }]) }
        : { status: 429, body: body({}) }
    }
    const search = createSemanticSearch({ get, sleep: async () => {} })
    await expect(search.authorImpacts!(['1'])).resolves.toMatchObject([{ id: '1', source: 'semantic-scholar' }])
    expect(sent[0]!.options).toMatchObject({ method: 'POST', body: JSON.stringify({ ids: ['1'] }) })
    await expect(search.searchPapers('qlora', 2022)).rejects.toThrow()
    expect(sent).toHaveLength(3)
  })
})
