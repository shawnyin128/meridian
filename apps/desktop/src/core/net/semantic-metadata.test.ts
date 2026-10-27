import { describe, expect, it } from 'vitest'
import type { HttpGet, HttpRequestOptions } from './http.js'
import { createSemanticPublications, parseSemanticPublications } from './semantic-metadata.js'

const body = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

/** Batch rows shaped as the Graph API answers `fields=venue,publicationVenue,externalIds`, with S2's own `year` too. */
const NEURIPS = {
  paperId: 'a', venue: 'Neural Information Processing Systems', year: 2020, externalIds: { DBLP: 'conf/nips/HoJA20', ArXiv: '2006.11239' },
  publicationVenue: { name: 'Neural Information Processing Systems', alternate_names: ['Neural Inf Process Syst', 'NeurIPS', 'NIPS'] },
}
const ICLR = {
  paperId: 'b', venue: 'International Conference on Learning Representations', year: 2021, externalIds: { DBLP: 'journals/corr/abs-2106-09685' },
  publicationVenue: { name: 'International Conference on Learning Representations', alternate_names: ['Int Conf Learn Represent', 'ICLR'] },
}
const WORKSHOP = { paperId: 'c', venue: 'Workshop on Efficient Systems', year: 2023, publicationVenue: { name: 'Workshop on Efficient Systems', alternate_names: [] } }
const PREPRINT = { paperId: 'd', venue: 'arXiv.org', year: 2024, publicationVenue: { name: 'arXiv.org', alternate_names: ['ArXiv'] } }
/** Leviathan et al.: on arXiv in 2022, so S2's `year` is 2022, at ICML 2023. */
const ICML = {
  paperId: 'e', venue: 'International Conference on Machine Learning', year: 2022,
  externalIds: { DBLP: 'conf/icml/LeviathanKM23', ArXiv: '2211.17192' },
  publicationVenue: { name: 'International Conference on Machine Learning', alternate_names: ['ICML', 'Int Conf Mach Learn'] },
}
const NECO = {
  paperId: 'f', venue: 'Neural Computation', year: 1997, externalIds: { DBLP: 'journals/neco/HochreiterS97', DOI: '10.1162/neco.1997.9.8.1735' },
  publicationVenue: { name: 'Neural Computation', alternate_names: ['Neural Comput'] },
}
const JMLR = {
  paperId: 'g', venue: 'Journal of machine learning research', year: 2021, externalIds: { DBLP: 'journals/jmlr/FedusZS22', ArXiv: '2101.03961' },
  publicationVenue: { name: 'Journal of machine learning research', alternate_names: ['JMLR', 'J Mach Learn Res'] },
}

describe('Semantic Scholar 的发表信息', () => {
  it('会场取简称（NeurIPS、ICLR），没有简称就用全名；只发在 arXiv 上的、没有会场的和查不到的都不算发表', () => {
    expect([...parseSemanticPublications(body([NEURIPS, ICLR, WORKSHOP, PREPRINT, { paperId: 'e', venue: '', year: 2022 }, null]),
      ['ARXIV:1', 'ARXIV:2', 'DOI:10.1/x', 'ARXIV:4', 'ARXIV:5', 'ARXIV:6'])].map(([id, found]) => [id, found.venue])).toEqual([
      ['ARXIV:1', 'NeurIPS'], ['ARXIV:2', 'ICLR'], ['DOI:10.1/x', 'Workshop on Efficient Systems'],
    ])
  })

  it('会场的年份取 DBLP 会议或期刊编号末尾的两位数，不用 S2 的 year；CoRR 编号和没有 DBLP 编号时不带年份', () => {
    expect([...parseSemanticPublications(body([ICML, NECO, JMLR, NEURIPS, ICLR, WORKSHOP]),
      ['ARXIV:2211.17192', 'DOI:10.1162/neco.1997.9.8.1735', 'ARXIV:2101.03961', 'ARXIV:2006.11239', 'ARXIV:2106.09685', 'DOI:10.1/x'])]).toEqual([
      ['ARXIV:2211.17192', { venue: 'ICML', year: 2023 }],
      ['DOI:10.1162/neco.1997.9.8.1735', { venue: 'Neural Computation', year: 1997 }],
      ['ARXIV:2101.03961', { venue: 'JMLR', year: 2022 }],
      ['ARXIV:2006.11239', { venue: 'NeurIPS', year: 2020 }],
      ['ARXIV:2106.09685', { venue: 'ICLR' }],
      ['DOI:10.1/x', { venue: 'Workshop on Efficient Systems' }],
    ])
  })

  it('一次 POST 最多 500 个 id，字段只要会场和外部编号；带上 x-api-key 的事交给共用的限速队列', async () => {
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
    expect(new URL(sent[0]!.url).searchParams.get('fields')).toBe('venue,publicationVenue,externalIds')
  })
})
