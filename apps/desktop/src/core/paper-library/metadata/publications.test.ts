import { describe, expect, it } from 'vitest'
import { createFixtureStore } from '../../fixture-store.js'
import { minimalPdf } from '../../net/minimal-pdf.js'
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
    const paper = { venue: 'arXiv' }
    expect(publicationFill(paper, undefined, { venue: 'ICLR', year: 2026 })).toEqual({ venue: 'ICLR 2026' })
    expect(publicationFill({ venue: '' }, undefined, { venue: 'ICLR', year: 2026 })).toEqual({ venue: 'ICLR 2026' })
    expect(publicationFill(paper, undefined, { venue: 'ICLR' })).toEqual({ venue: 'ICLR' })
    expect(publicationFill({ venue: 'ICML 2025' }, undefined, { venue: 'ICLR', year: 2026 })).toEqual({})
    expect(publicationFill({ venue: 'ICML' }, { venue: 'ICML', year: 2024 }, { venue: 'ICML', year: 2024 })).toEqual({ venue: 'ICML 2024' })
    expect(publicationFill({ venue: 'ICML 2024' }, { venue: 'ICML 2024' }, { venue: 'ICML', year: 2024 })).toEqual({})
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
