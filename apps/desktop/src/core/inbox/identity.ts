import type { PaperRow } from '../../shared/contract.js'

/**
 * What one paper is known by: `keys` holds its version-less arXiv id, DOI and Semantic Scholar id
 * as `arxiv:`, `doi:` and `s2:` keys, `title` its normalized title, and `year` its year, null when
 * unknown.
 */
export type PaperIdentity = { keys: string[]; title: string; year: number | null }

/** Returns a title normalized for duplicate comparison. */
export const titleKey = (title: string): string =>
  title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/** The DOI arXiv registers for each of its papers names the paper's arXiv id after this prefix. */
const ARXIV_DOI = '10.48550/arxiv.'

/** Returns `doi` without a resolver address or `doi:` prefix, lowercased, or null when it is not a DOI. */
const doiKey = (doi: string): string | null => {
  const bare = doi.trim().toLowerCase().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/, '')
  return /^10\.\d{4,9}\/\S+$/.test(bare) ? bare : null
}

/** Returns the arXiv id `id` without an `arXiv:` prefix or version, lowercased, or null when empty. */
const arxivKey = (id: string): string | null => {
  const bare = id.trim().toLowerCase().replace(/^arxiv:\s*/, '').replace(/v\d+$/, '')
  return bare === '' ? null : bare
}

/**
 * Returns the identity of a paper from what a record holds: any of its arXiv id, DOI and Semantic
 * Scholar id, its title, and its year, or else the date it was submitted, as `YYYY-MM-DD`.
 */
export function paperIdentity(paper: {
  arxiv?: string; doi?: string; semanticId?: string; title: string; year?: number; submitted?: string
}): PaperIdentity {
  const keys = new Set<string>()
  const arxiv = paper.arxiv === undefined ? null : arxivKey(paper.arxiv)
  if (arxiv !== null) keys.add(`arxiv:${arxiv}`)
  const doi = paper.doi === undefined ? null : doiKey(paper.doi)
  if (doi !== null) {
    keys.add(`doi:${doi}`)
    if (doi.startsWith(ARXIV_DOI)) keys.add(`arxiv:${arxivKey(doi.slice(ARXIV_DOI.length))}`)
  }
  if (paper.semanticId !== undefined && paper.semanticId !== '') keys.add(`s2:${paper.semanticId}`)
  const submitted = Number(paper.submitted?.match(/^(\d{4})-/)?.[1])
  return {
    keys: [...keys], title: titleKey(paper.title),
    year: paper.year ?? (Number.isInteger(submitted) && submitted > 0 ? submitted : null),
  }
}

/**
 * Returns the version-less arXiv id of a library paper: the one its identifier names, or else its page
 * id when that is shaped like an arXiv id. Returns null when it has neither.
 */
export function libraryArxivId(paper: PaperRow | undefined): string | null {
  if (paper === undefined) return null
  const named = paper.identifier?.match(/^arXiv:(.+)$/i)?.[1]?.replace(/v\d+$/, '')
  if (named) return named
  return /^\d{4}\.\d{4,5}(?:v\d+)?$/.test(paper.id) ? paper.id.replace(/v\d+$/, '') : null
}

/** Returns the identity of a library paper, reading a DOI or an arXiv id from its identifier. */
export function libraryIdentity(paper: PaperRow): PaperIdentity {
  const arxiv = libraryArxivId(paper)
  return paperIdentity({
    ...(arxiv === null ? {} : { arxiv }),
    ...(paper.identifier === undefined ? {} : { doi: paper.identifier }),
    title: paper.title,
    ...(paper.year === undefined ? {} : { year: paper.year }),
  })
}

/**
 * Builds an index of the papers added to it, each with a value, that finds the value of the paper
 * an identity names: the first paper added that shares a key with it, or else the first whose title
 * is the same and whose year is the same or unknown on either side.
 */
export function createPaperIndex<T>(): {
  add(identity: PaperIdentity, value: T): void
  find(identity: PaperIdentity): T | undefined
} {
  const byKey = new Map<string, T>()
  const byTitle = new Map<string, { year: number | null; value: T }[]>()
  return {
    add(identity, value) {
      for (const key of identity.keys) if (!byKey.has(key)) byKey.set(key, value)
      if (identity.title === '') return
      byTitle.set(identity.title, [...(byTitle.get(identity.title) ?? []), { year: identity.year, value }])
    },
    find(identity) {
      for (const key of identity.keys) {
        const value = byKey.get(key)
        if (value !== undefined) return value
      }
      return byTitle.get(identity.title)?.find(({ year }) => (
        year === null || identity.year === null || year === identity.year
      ))?.value
    },
  }
}
