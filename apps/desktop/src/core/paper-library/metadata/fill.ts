import type { PaperRow } from '../../../shared/contract.js'
import type { RemotePaper } from '../../net/arxiv.js'
import type { MetadataFill } from '../../vault.js'
import type { LaterRecord } from '../../vault/records.js'

/** Returns only metadata fields that are still absent from `paper`. */
export function missingMetadata(paper: PaperRow, fill: MetadataFill, replaceTitle: string | null): MetadataFill {
  return {
    ...(fill.title !== undefined && paper.title === replaceTitle ? { title: fill.title } : {}),
    ...(fill.authors !== undefined && paper.authors === undefined ? { authors: fill.authors } : {}),
    ...(fill.year !== undefined && paper.year === undefined ? { year: fill.year } : {}),
    ...(fill.venue !== undefined && paper.venue === '' ? { venue: fill.venue } : {}),
    ...(fill.identifier !== undefined && paper.identifier === undefined ? { identifier: fill.identifier } : {}),
    ...(fill.submitted !== undefined && paper.submitted === undefined ? { submitted: fill.submitted } : {}),
    ...(fill.abstract !== undefined && paper.abstract === undefined ? { abstract: fill.abstract } : {}),
    ...(fill.pageCount !== undefined && paper.pageCount === 0 ? { pageCount: fill.pageCount } : {}),
  }
}

/** Returns a later-queue entry enriched by metadata filled on its paper. */
export function laterWithMetadata<T extends LaterRecord>(entry: T, paper: PaperRow, titleReplaced: boolean): T {
  return {
    ...entry,
    ...(titleReplaced ? { title: paper.title } : {}),
    ...(entry.authors === '' && paper.authors !== undefined ? { authors: paper.authors.join(', ') } : {}),
    ...(entry.venue === '' ? { venue: paper.venue } : {}),
    ...(entry.abstract === '' && paper.abstract !== undefined ? { abstract: paper.abstract } : {}),
  }
}

/** Converts an arXiv result into the fields eligible for metadata filling. */
export function remoteMetadata(paper: Omit<RemotePaper, 'pdf'>): MetadataFill {
  return {
    title: paper.title,
    authors: paper.authors,
    year: Number(paper.submitted.slice(0, 4)),
    venue: paper.journalRef ?? 'arXiv',
    identifier: `arXiv:${paper.id}`,
    submitted: paper.submitted,
    abstract: paper.abstract,
  }
}
