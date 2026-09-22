import { describe, expect, it } from 'vitest'
import type { PaperRow } from '../../shared/contract.js'
import { facetPapers, listPapers } from './query.js'

/** Paper row with only fields used by these tests; all others use neutral empty values. */
const paper = (id: string, year?: number): PaperRow => ({
  id,
  title: id,
  ...(year === undefined ? {} : { year }),
  venue: '',
  topics: ['spec'],
  methods: [],
  datasets: [],
  metrics: [],
  pageState: 'draft',
  readState: '未读',
  projects: [],
  pageCount: 0,
  noteCount: 0,
  conclusionCount: 0,
  updated: '2026-05-20',
  custom: {},
})

/** Paper row that overlays the supplied fields onto `paper` defaults. */
const paperWith = (id: string, fields: Partial<PaperRow>): PaperRow => ({ ...paper(id), ...fields })

/** Mix dated and undated papers, including undated rows in the middle, so ordering is observable. */
const MIXED = [paper('a', 2024), paper('b'), paper('c', 2026), paper('d')]

describe('paper query', () => {
  it('筛选词也按作者匹配,分组取值跟着同一条筛选', () => {
    const rows = [paperWith('alpha', { authors: ['Tri Dao'] }), paperWith('beta', { authors: ['Chen'] })]
    expect(listPapers(rows, { page: 1, size: 10, filter: 'dao' }).rows.map((r) => r.id)).toEqual(['alpha'])
    expect(facetPapers(rows, 'topics', 'dao')).toEqual([{ value: 'spec', count: 1, newestTitle: 'alpha' }])
  })

  it('按项目分组时一篇挂在两个项目下就在两组里各算一次,筛选也认项目名', () => {
    const rows = [
      paperWith('a', { projects: [{ id: 'p1', name: 'Kernel' }, { id: 'p2', name: 'Wide' }] }),
      paper('b'),
    ]
    expect(facetPapers(rows, 'projects').map((facet) => [facet.value, facet.count]))
      .toEqual([['Kernel', 1], ['Wide', 1]])
    expect(listPapers(rows, { page: 1, size: 10, filter: 'wide' }).rows.map((row) => row.id))
      .toEqual(['a'])
    expect(listPapers(rows, {
      page: 1, size: 10, facet: { field: 'projects', value: 'Kernel' },
    }).rows.map((row) => row.id)).toEqual(['a'])
  })

  it('标题的末尾接上作者的开头不算命中', () => {
    expect(listPapers([paperWith('ab', { authors: ['cd'] })], {
      page: 1, size: 10, filter: 'bc',
    }).total).toBe(0)
  })

  it('筛选词按自定义短标题命中,即便短标题不是正文的前缀', () => {
    const rows = [
      paperWith('aqlm', { title: 'Extreme Compression of Large Language Models', shortTitle: 'AQLM' }),
      paper('other'),
    ]
    expect(listPapers(rows, { page: 1, size: 10, filter: 'aqlm' }).rows.map((row) => row.id))
      .toEqual(['aqlm'])
  })

  it('按作者排序看第一作者,没有作者的升序降序都排在最后', () => {
    const rows = [
      paperWith('z', { authors: ['Zhang'] }),
      paperWith('none', {}),
      paperWith('c', { authors: ['Chen', 'Zhou'] }),
    ]
    const ids = (direction: 'asc' | 'desc') =>
      listPapers(rows, { page: 1, size: 10, sort: 'authors', direction }).rows.map((r) => r.id)
    expect(ids('asc')).toEqual(['c', 'z', 'none'])
    expect(ids('desc')).toEqual(['z', 'c', 'none'])
  })

  it('按年排序时没有年份的排在最后,升序降序都一样', () => {
    const ids = (direction: 'asc' | 'desc') =>
      listPapers(MIXED, { page: 1, size: 10, sort: 'year', direction }).rows.map((r) => r.id)
    expect(ids('asc')).toEqual(['a', 'c', 'b', 'd'])
    expect(ids('desc')).toEqual(['c', 'a', 'b', 'd'])
  })

  it('按入库时间降序时新加入的论文在最前,缺少时间的老记录仍排在最后', () => {
    const rows = [
      paperWith('older', { addedAt: '2026-09-14T09:00:00.000Z' }),
      paperWith('legacy', {}),
      paperWith('newer', { addedAt: '2026-09-15T10:00:00.000Z' }),
    ]
    expect(listPapers(rows, {
      page: 1, size: 10, sort: 'addedAt', direction: 'desc',
    }).rows.map((row) => row.id)).toEqual(['newer', 'older', 'legacy'])
  })

  it('分组里最新的那一篇不会是没有年份的那些', () => {
    expect(facetPapers(MIXED, 'topics')[0]!.newestTitle).toBe('c')
  })

  it('一个年份都没有时,最新的那一篇是次序上的第一篇', () => {
    expect(facetPapers([paper('b'), paper('d')], 'topics')[0]!.newestTitle).toBe('b')
  })

  it('按自定义列分组:多选的每个取值各算一次,没填的不进任何取值', () => {
    const filled = (id: string, custom: PaperRow['custom']): PaperRow => ({ ...paper(id), custom })
    const rows = [
      filled('a', { 'du-fa': '精读', tags: ['综述', '必读'] }),
      filled('b', { 'du-fa': '精读' }),
      filled('c', {}),
    ]
    expect(facetPapers(rows, 'du-fa').map((f) => [f.value, f.count])).toEqual([['精读', 2]])
    expect(facetPapers(rows, 'tags').map((f) => [f.value, f.count]))
      .toEqual([['必读', 1], ['综述', 1]])
    expect(listPapers(rows, { page: 1, size: 10, facet: { field: 'tags', value: '综述' } })
      .rows.map((r) => r.id)).toEqual(['a'])
  })
})
