import { describe, expect, it } from 'vitest'
import { createFixtureStore } from '../../fixture-store.js'
import type { DblpPaper } from '../../net/dblp.js'
import { HttpStatusError } from '../../net/http.js'
import { minimalPdf } from '../../net/minimal-pdf.js'
import type { Publication } from '../../net/semantic-metadata.js'
import type { VaultStore } from '../../vault.js'
import { publicationFill } from './fill.js'
import { fillPublications, publicationIdOf } from './publications.js'

const ARXIV_FILL = { title: 'Draft Trees', year: 2025, venue: 'arXiv', identifier: 'arXiv:2509.01234', submitted: '2025-09-02' }

/** A fixture paper filled from arXiv the way an upload fills it, recorded as filled by the App. */
function arxivPaper(): { store: VaultStore; id: string } {
  const store = createFixtureStore(() => '2026-08-25')
  const id = store.importPaper('draft.pdf', minimalPdf({ lines: ['draft'] })).paper.id
  store.fillPaperMetadata(id, ARXIV_FILL, store.getPaper(id).title)
  return { store, id }
}

describe('发表信息只改 App 填的值，用户改过的不动', () => {
  it('会场写成会场名加那次发表的年份，年份栏留着论文自己的年份；App 填的光秃会场下次补成带年份的', () => {
    const { store, id } = arxivPaper()
    expect(store.fillPaperPublication(id, { venue: 'ICLR', year: 2026 })).toEqual(['venue'])
    expect(store.getPaper(id)).toMatchObject({ venue: 'ICLR 2026', year: 2025 })
    expect(store.fillPaperPublication(id, { venue: 'NeurIPS', year: 2026 })).toEqual(['venue'])
    expect(store.getPaper(id)).toMatchObject({ venue: 'NeurIPS 2026', year: 2025 })

    const bare = arxivPaper()
    expect(bare.store.fillPaperPublication(bare.id, { venue: 'ICML' })).toEqual(['venue'])
    expect(bare.store.getPaper(bare.id)).toMatchObject({ venue: 'ICML', year: 2025 })
    expect(bare.store.fillPaperPublication(bare.id, { venue: 'ICML', year: 2024 })).toEqual(['venue'])
    expect(bare.store.getPaper(bare.id)).toMatchObject({ venue: 'ICML 2024', year: 2025 })
  })

  it('用户改过会场时什么都不动；用户改过年份时只换会场，年份照旧', () => {
    const edited = arxivPaper()
    edited.store.updatePaper(edited.id, { venue: 'MLSys Workshop' })
    expect(edited.store.fillPaperPublication(edited.id, { venue: 'ICLR', year: 2026 })).toEqual([])
    expect(edited.store.getPaper(edited.id)).toMatchObject({ venue: 'MLSys Workshop', year: 2025 })
    const year = arxivPaper()
    year.store.updatePaper(year.id, { year: 2024 })
    expect(year.store.fillPaperPublication(year.id, { venue: 'ICLR', year: 2026 })).toEqual(['venue'])
    expect(year.store.getPaper(year.id)).toMatchObject({ venue: 'ICLR 2026', year: 2024 })
  })

  it('没有记录的旧论文：会场是空的或 arXiv 时才换，从不写年份', () => {
    const paper = { venue: 'arXiv', year: 2026, identifier: 'arXiv:2509.01234', submitted: '2025-09-02' }
    expect(publicationFill(paper, undefined, { venue: 'ICLR', year: 2026 })).toEqual({ venue: 'ICLR 2026' })
    expect(publicationFill({ ...paper, venue: '' }, undefined, { venue: 'ICLR', year: 2026 })).toEqual({ venue: 'ICLR 2026' })
    expect(publicationFill(paper, undefined, { venue: 'ICLR' })).toEqual({ venue: 'ICLR' })
    expect(publicationFill({ ...paper, venue: 'ICML 2025' }, undefined, { venue: 'ICLR', year: 2026 })).toEqual({})
    expect(publicationFill({ ...paper, venue: 'ICML' }, { venue: 'ICML' }, { venue: 'ICML', year: 2024 })).toEqual({ venue: 'ICML 2024' })
    expect(publicationFill({ ...paper, venue: 'ICML 2024' }, { venue: 'ICML 2024' }, { venue: 'ICML', year: 2024 })).toEqual({})
  })
})

describe('上一版补全换掉的年份换回 arXiv 投稿年份', () => {
  /** An arXiv paper whose year an earlier fill replaced: the App recorded writing 2026 over its 2025 submission. */
  function replacedYear(): { store: VaultStore; id: string } {
    const store = createFixtureStore(() => '2026-08-25')
    const id = store.importPaper('draft.pdf', minimalPdf({ lines: ['draft'] })).paper.id
    const { title, venue, identifier, submitted } = ARXIV_FILL
    store.fillPaperMetadata(id, { title, venue, identifier, submitted }, store.getPaper(id).title)
    store.fillPaperMetadata(id, { year: 2026 }, null)
    return { store, id }
  }

  it('有 arXiv 编号、年份是 App 写的：下次补全把年份换回投稿年份，会场照常补上', () => {
    const { store, id } = replacedYear()
    expect(store.fillPaperPublication(id, { venue: 'ICLR', year: 2026 })).toEqual(['year', 'venue'])
    expect(store.getPaper(id)).toMatchObject({ venue: 'ICLR 2026', year: 2025 })
    expect(store.fillPaperPublication(id, { venue: 'ICLR', year: 2026 })).toEqual([])
  })

  it('查不到发表信息的论文也换回年份，每篇记一条能撤销的变动', async () => {
    const { store, id } = replacedYear()
    expect(await fillPublications(store, { lookup: async () => new Map() })).toBe(1)
    expect(store.getPaper(id)).toMatchObject({ venue: 'arXiv', year: 2025 })
    const changes = store.listChanges().filter((c) => c.title.includes('补全了发表信息'))
    expect(changes).toHaveLength(1)
    store.undoChange(changes[0]!.id)
    expect(store.getPaper(id).year).toBe(2026)
  })

  it('用户填的年份、没有 arXiv 编号的论文和没有记录的旧论文，年份都不动', () => {
    const typed = replacedYear()
    typed.store.updatePaper(typed.id, { year: 2024 })
    expect(typed.store.fillPaperPublication(typed.id, { venue: 'ICLR', year: 2026 })).toEqual(['venue'])
    expect(typed.store.getPaper(typed.id).year).toBe(2024)

    const doi = replacedYear()
    doi.store.updatePaper(doi.id, { identifier: 'doi:10.1145/3600006.3613165' })
    expect(doi.store.fillPaperPublication(doi.id, { venue: 'SOSP', year: 2023 })).toEqual(['venue'])
    expect(doi.store.getPaper(doi.id).year).toBe(2026)

    const unrecorded = { venue: 'ICLR', year: 2026, identifier: 'arXiv:2509.01234', submitted: '2025-09-02' }
    expect(publicationFill(unrecorded, undefined, undefined)).toEqual({})
    expect(publicationFill(unrecorded, { year: 2026 }, undefined)).toEqual({ year: 2025 })
  })
})

describe('设置里 Semantic Scholar 卡片的补全发表信息', () => {
  it('按 arXiv 编号和 DOI 一次查完库里的论文，只改查到发表信息的那几篇，每篇记一条能撤销的变动', async () => {
    const { store, id } = arxivPaper()
    const doi = store.importPaper('doi.pdf', minimalPdf({ lines: ['doi'] })).paper.id
    store.updatePaper(doi, { identifier: 'doi:10.1145/3600006.3613165' })
    const asked: string[][] = []
    const updated = await fillPublications(store, {
      lookup: async (ids) => {
        asked.push([...ids])
        return new Map([['ARXIV:2509.01234', { venue: 'ICLR', year: 2026 }], ['DOI:10.1145/3600006.3613165', { venue: 'SOSP', year: 2023 }]])
      },
    })
    expect(asked).toHaveLength(1)
    expect(asked[0]).toEqual(expect.arrayContaining(['ARXIV:2509.01234', 'DOI:10.1145/3600006.3613165']))
    expect(updated).toBe(2)
    expect(store.getPaper(id)).toMatchObject({ venue: 'ICLR 2026', year: 2025 })
    expect(store.getPaper(doi).venue).toBe('SOSP 2023')
    expect(store.getPaper(doi).year).toBeUndefined()
    const change = store.listChanges().find((c) => c.title.includes('补全了发表信息') && c.title.includes('Draft Trees'))!
    store.undoChange(change.id)
    expect(store.getPaper(id)).toMatchObject({ venue: 'arXiv', year: 2025 })
  })

  it('identifier 写成 arXiv 编号或 DOI 都认得，别的不查', () => {
    expect(publicationIdOf('arXiv:2509.01234')).toBe('ARXIV:2509.01234')
    expect(publicationIdOf('doi:10.1145/3600006.3613165')).toBe('DOI:10.1145/3600006.3613165')
    expect(publicationIdOf('https://doi.org/10.1145/3600006.3613165')).toBe('DOI:10.1145/3600006.3613165')
    expect(publicationIdOf('10.1145/3600006.3613165')).toBe('DOI:10.1145/3600006.3613165')
    expect(publicationIdOf('ISBN 978-0')).toBeNull()
    expect(publicationIdOf(undefined)).toBeNull()
  })
})

describe('补全发表信息时没有会场年份的论文去问 DBLP', () => {
  /** A DBLP stand-in answering `answer` for every paper it is asked about, recording the titles asked. */
  function dblp(answer: (paper: DblpPaper) => Promise<Publication | undefined>) {
    const asked: string[] = []
    return { asked, venueOf: (paper: DblpPaper) => { asked.push(paper.title); return answer(paper) } }
  }

  /** A store with three papers: two arXiv papers and one with a DOI. */
  function library() {
    const { store, id } = arxivPaper()
    const other = store.importPaper('other.pdf', minimalPdf({ lines: ['other'] })).paper.id
    store.fillPaperMetadata(other, { ...ARXIV_FILL, title: 'Wide Trees', identifier: 'arXiv:2509.05678' }, store.getPaper(other).title)
    const doi = store.importPaper('doi.pdf', minimalPdf({ lines: ['doi'] })).paper.id
    store.updatePaper(doi, { title: 'Serving at Scale', identifier: 'doi:10.1145/3600006.3613165' })
    return { store, id, other, doi }
  }
  const S2 = new Map([['ARXIV:2509.01234', { venue: 'ICLR' }], ['DOI:10.1145/3600006.3613165', { venue: 'SOSP', year: 2023 }]])

  it('Semantic Scholar 没给出会场年份或没查到的论文按标题问 DBLP，会场写成 DBLP 的会场加年份；有年份的不问', async () => {
    const { store, id, other, doi } = library()
    const source = dblp(async (paper) => ({ venue: paper.title === 'Draft Trees' ? 'ICLR' : 'NeurIPS', year: 2024, source: 'dblp' }))
    expect(await fillPublications(store, { lookup: async () => S2 }, source)).toBe(3)
    expect(source.asked.sort()).toEqual(['Draft Trees', 'Wide Trees'])
    expect([store.getPaper(id).venue, store.getPaper(other).venue, store.getPaper(doi).venue]).toEqual(['ICLR 2024', 'NeurIPS 2024', 'SOSP 2023'])
  })

  it('DBLP 没有可信的结果时照用 Semantic Scholar 给的', async () => {
    const { store, id, other } = library()
    await fillPublications(store, { lookup: async () => S2 }, dblp(async () => undefined))
    expect([store.getPaper(id).venue, store.getPaper(other).venue]).toEqual(['ICLR', 'arXiv'])
  })

  it.each([
    ['429', new HttpStatusError(429, 0)],
    ['超时', new DOMException('The operation timed out.', 'TimeoutError')],
  ])('DBLP %s 时补全照样完成，留着别的来源给的，这一轮不再问 DBLP', async (_name, error) => {
    const { store, id, doi } = library()
    const source = dblp(async () => { throw error })
    expect(await fillPublications(store, { lookup: async () => S2 }, source)).toBe(2)
    expect(source.asked).toHaveLength(1)
    expect([store.getPaper(id).venue, store.getPaper(doi).venue]).toEqual(['ICLR', 'SOSP 2023'])
  })
})
