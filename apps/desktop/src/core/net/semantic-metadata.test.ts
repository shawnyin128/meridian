import { describe, expect, it } from 'vitest'
import type { HttpGet, HttpRequestOptions } from './http.js'
import { createSemanticPublications, parseSemanticPublications } from './semantic-metadata.js'

const body = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

/** Batch rows shaped as the Graph API answers `fields=venue,publicationVenue,year`. */
const NEURIPS = {
  paperId: 'a', venue: 'Neural Information Processing Systems', year: 2020,
  publicationVenue: { name: 'Neural Information Processing Systems', alternate_names: ['Neural Inf Process Syst', 'NeurIPS', 'NIPS'] },
}
const ICLR = {
  paperId: 'b', venue: 'International Conference on Learning Representations', year: 2021,
  publicationVenue: { name: 'International Conference on Learning Representations', alternate_names: ['Int Conf Learn Represent', 'ICLR'] },
}
const WORKSHOP = { paperId: 'c', venue: 'Workshop on Efficient Systems', year: 2023, publicationVenue: { name: 'Workshop on Efficient Systems', alternate_names: [] } }
const PREPRINT = { paperId: 'd', venue: 'arXiv.org', year: 2024, publicationVenue: { name: 'arXiv.org', alternate_names: ['ArXiv'] } }

describe('Semantic Scholar 的发表信息', () => {
  it('会场取简称（NeurIPS、ICLR），没有简称就用全名；只发在 arXiv 上的、没有会场的和查不到的都不算发表', () => {
    expect([...parseSemanticPublications(body([NEURIPS, ICLR, WORKSHOP, PREPRINT, { paperId: 'e', venue: '', year: 2022 }, null]),
      ['ARXIV:1', 'ARXIV:2', 'DOI:10.1/x', 'ARXIV:4', 'ARXIV:5', 'ARXIV:6'])]).toEqual([
      ['ARXIV:1', { venue: 'NeurIPS', year: 2020 }],
      ['ARXIV:2', { venue: 'ICLR', year: 2021 }],
      ['DOI:10.1/x', { venue: 'Workshop on Efficient Systems', year: 2023 }],
    ])
  })

  it('一次 POST 最多 500 个 id，字段只要会场和年份；带上 x-api-key 的事交给共用的限速队列', async () => {
    const sent: { url: string; options: HttpRequestOptions }[] = []
    const get: HttpGet = async (url, options) => {
      sent.push({ url, options })
      const ids = (JSON.parse(options.body!) as { ids: string[] }).ids
      return { status: 200, body: body(ids.map(() => null)) }
    }
    const ids = Array.from({ length: 501 }, (_, i) => `ARXIV:2401.${String(i).padStart(5, '0')}`)
    await createSemanticPublications({ get, sleep: async () => {} }).lookup(ids)
    expect(sent.map((s) => (JSON.parse(s.options.body!) as { ids: string[] }).ids.length)).toEqual([500, 1])
    expect(sent[0]!.options.method).toBe('POST')
    expect(new URL(sent[0]!.url).pathname).toBe('/graph/v1/paper/batch')
    expect(new URL(sent[0]!.url).searchParams.get('fields')).toBe('venue,publicationVenue,year')
  })
})
