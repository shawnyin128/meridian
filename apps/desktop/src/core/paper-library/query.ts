import type { Facet, ListParams, ListResult, PaperRow, SortKey } from '../../shared/contract.js'
import { cellValues } from './columns.js'

/**
 * All values of a paper for a groupable field. Built-ins use their corresponding property; custom
 * columns use the values stored in the cell. The store validates groupability before calling this
 * function, so unknown field names are treated as custom columns.
 */
function valuesOf(paper: PaperRow, field: string): string[] {
  if (field === 'readState') return [paper.readState]
  if (field === 'topics') return paper.topics
  if (field === 'projects') return paper.projects.map((project) => project.name)
  return cellValues(paper, field)
}

/** Whether the lowercased needle occurs in a paper's title, short title, author, topic, or linked project name. */
function matches(paper: PaperRow, needle: string): boolean {
  return [
    paper.title, paper.shortTitle ?? '', ...(paper.authors ?? []), ...paper.topics,
    ...paper.projects.map((project) => project.name),
  ].join('\n').toLowerCase().includes(needle)
}

/**
 * Orders two papers by `sort` in the direction `dir` (1 or -1): by title when
 * `sort` is absent or title; by date added, year or first author otherwise,
 * with papers lacking the selected value after every paper carrying one in
 * both directions.
 */
function compare(a: PaperRow, b: PaperRow, sort: SortKey | undefined, dir: number): number {
  if (sort === undefined || sort === 'title') return a.title.localeCompare(b.title) * dir
  const x = sort === 'addedAt' ? a.addedAt : sort === 'year' ? a.year : a.authors?.[0]
  const y = sort === 'addedAt' ? b.addedAt : sort === 'year' ? b.year : b.authors?.[0]
  if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1
  return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir
}

/**
 * Returns one page of the given papers, and how many of them that page was
 * drawn from. Filtering, faceting, sorting and paging follow
 * VaultStore.listPapers; `rows` are the caller's own objects, so a store
 * returning them across the contract copies them first.
 */
export function listPapers(papers: Iterable<PaperRow>, params: ListParams): ListResult {
  const { page, size, sort, direction, filter, facet } = params
  let rows = [...papers]
  if (filter) {
    const needle = filter.toLowerCase()
    rows = rows.filter((r) => matches(r, needle))
  }
  if (facet) rows = rows.filter((r) => valuesOf(r, facet.field).includes(facet.value))
  const dir = direction === 'desc' ? -1 : 1
  rows.sort((a, b) => compare(a, b, sort, dir))
  const start = (page - 1) * size
  return { rows: rows.slice(start, start + size), total: rows.length }
}

/**
 * Returns every value the given field takes across the given papers, sorted by
 * value, each with the number of papers carrying it and the title of the newest
 * of those papers, as VaultStore.facetPapers describes.
 */
export function facetPapers(
  papers: Iterable<PaperRow>, field: string, filter?: string,
): Facet[] {
  const needle = filter?.toLowerCase()
  const byValue = new Map<string, Facet & { newestYear: number | undefined }>()
  for (const paper of papers) {
    if (needle && !matches(paper, needle)) continue
    for (const value of valuesOf(paper, field)) {
      const seen = byValue.get(value)
      if (!seen) {
        byValue.set(value, { value, count: 1, newestTitle: paper.title, newestYear: paper.year })
        continue
      }
      seen.count++
      if (paper.year !== undefined && (seen.newestYear === undefined || paper.year > seen.newestYear)) {
        seen.newestTitle = paper.title
        seen.newestYear = paper.year
      }
    }
  }
  return [...byValue.values()]
    .sort((a, b) => a.value.localeCompare(b.value))
    .map(({ value, count, newestTitle }) => ({ value, count, newestTitle }))
}
