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
  it('arXiv 填的占位会场和投稿年份换成发表的；App 后来填的值再刷新也能更新', () => {
    const { store, id } = arxivPaper()
    expect(store.fillPaperPublication(id, { venue: 'ICLR', year: 2026 })).toEqual(['year', 'venue'])
    expect(store.getPaper(id)).toMatchObject({ venue: 'ICLR', year: 2026 })
    expect(store.fillPaperPublication(id, { venue: 'NeurIPS', year: 2026 })).toEqual(['venue'])
    expect(store.getPaper(id).venue).toBe('NeurIPS')
  })

  it('用户改过会场时会场和年份都不动；只改过年份时只换会场', () => {
    const edited = arxivPaper()
    edited.store.updatePaper(edited.id, { venue: 'MLSys Workshop' })
    expect(edited.store.fillPaperPublication(edited.id, { venue: 'ICLR', year: 2026 })).toEqual([])
    expect(edited.store.getPaper(edited.id)).toMatchObject({ venue: 'MLSys Workshop', year: 2025 })
    const year = arxivPaper()
    year.store.updatePaper(year.id, { year: 2024 })
    expect(year.store.fillPaperPublication(year.id, { venue: 'ICLR', year: 2026 })).toEqual(['venue'])
    expect(year.store.getPaper(year.id)).toMatchObject({ venue: 'ICLR', year: 2024 })
  })

  it('没有记录的旧论文：会场是空的或 arXiv、年份等于投稿年份时才算 App 填的', () => {
    const paper = { venue: 'arXiv', year: 2025, submitted: '2025-09-02' }
    expect(publicationFill(paper, undefined, { venue: 'ICLR', year: 2026 })).toEqual({ year: 2026, venue: 'ICLR' })
    expect(publicationFill({ ...paper, year: 2024 }, undefined, { venue: 'ICLR', year: 2026 })).toEqual({ venue: 'ICLR' })
    expect(publicationFill({ ...paper, venue: 'ICML 2025' }, undefined, { venue: 'ICLR', year: 2026 })).toEqual({})
    expect(publicationFill({ venue: '', submitted: '2025-09-02' }, undefined, { venue: 'ICLR', year: 2026 })).toEqual({ year: 2026, venue: 'ICLR' })
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
    expect(store.getPaper(id).venue).toBe('ICLR')
    expect(store.getPaper(doi).venue).toBe('SOSP')
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
