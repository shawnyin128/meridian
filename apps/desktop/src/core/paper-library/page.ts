import type { PaperSnapshot } from '../vault/records.js'
import { removeKey, writeKey } from '../vault/page-lines.js'

/** Number of title characters used in the filename of a newly created paper page. */
const STEM_CHARS = 60

/**
 * Returns the file name a new paper page takes from `title`: the runs of
 * letters and digits in it joined by hyphens, cut to at most STEM_CHARS
 * characters, or `fallback` when the title holds neither. A name `taken`
 * already answers true for takes a number after it until one is free.
 */
export function freePageStem(
  title: string, fallback: string, taken: (stem: string) => boolean,
): string {
  const base = title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, STEM_CHARS)
    || fallback
  let stem = base
  let n = 1
  while (taken(stem)) {
    n += 1
    stem = `${base}-${n}`
  }
  return stem
}

/**
 * Fields written to a paper page in one operation. A null `readState` removes the reading-state line;
 * an absent property leaves it untouched.
 */
type OptionalMetadata = 'shortTitle' | 'authors' | 'year' | 'rating' | 'identifier' | 'submitted'
export type PaperWrite = Partial<Omit<PaperSnapshot, 'readState' | OptionalMetadata>> & {
  readState?: PaperSnapshot['readState'] | null
  shortTitle?: string | null
  authors?: string[] | null
  year?: number | null
  rating?: number | null
  identifier?: string | null
  submitted?: string | null
  abstract?: string
  pageCount?: number
}

/**
 * Writes the given fields onto the paper page at `file`. Each field replaces
 * only the lines its frontmatter key occupies, leaving every other byte of the
 * page untouched: the keys already there keep their order and their bytes, and
 * so does everything else the frontmatter holds. A null reading state takes
 * that key off the page instead. `custom` replaces the whole map; an empty map
 * removes the key. Each write is staged under `staging` and
 * renamed over the page, the way spliceLines has it. Throws if the page holds
 * no closed frontmatter.
 */
export function writePaperFields(file: string, fields: PaperWrite, staging: string): void {
  if (fields.title !== undefined) writeKey(file, 'title', fields.title, staging, ['type'])
  if (fields.shortTitle === null || fields.shortTitle === '') removeKey(file, 'short', staging)
  else if (fields.shortTitle !== undefined) writeKey(file, 'short', fields.shortTitle, staging, ['title'])
  if (fields.authors === null || fields.authors?.length === 0) removeKey(file, 'authors', staging)
  else if (fields.authors !== undefined) writeKey(file, 'authors', fields.authors, staging, ['short', 'title'])
  if (fields.year === null) removeKey(file, 'year', staging)
  else if (fields.year !== undefined) writeKey(file, 'year', fields.year, staging, ['authors', 'short', 'title'])
  if (fields.venue !== undefined) {
    if (fields.venue === '') removeKey(file, 'venue', staging)
    else writeKey(file, 'venue', fields.venue, staging, ['year', 'authors', 'short', 'title'])
  }
  if (fields.rating === null) removeKey(file, 'rating', staging)
  else if (fields.rating !== undefined) writeKey(file, 'rating', fields.rating, staging, ['venue', 'year', 'authors'])
  if (fields.identifier === null || fields.identifier === '') removeKey(file, 'identifier', staging)
  else if (fields.identifier !== undefined) writeKey(file, 'identifier', fields.identifier, staging, ['venue', 'year'])
  if (fields.submitted === null) removeKey(file, 'submitted', staging)
  else if (fields.submitted !== undefined) writeKey(file, 'submitted', fields.submitted, staging, ['identifier', 'venue'])
  if (fields.pageCount !== undefined) writeKey(file, 'page_count', fields.pageCount, staging, ['read_state', 'memberships'])
  if (fields.abstract !== undefined) writeKey(file, 'abstract', fields.abstract, staging, ['memberships'])
  if (fields.topics !== undefined) writeKey(file, 'topics', fields.topics, staging, ['memberships'])
  if (fields.readState === null) removeKey(file, 'read_state', staging)
  else if (fields.readState !== undefined) {
    writeKey(file, 'read_state', fields.readState, staging, ['topics', 'memberships'])
  }
  if (fields.custom !== undefined) {
    if (Object.keys(fields.custom).length === 0) removeKey(file, 'custom', staging)
    else writeKey(file, 'custom', fields.custom, staging, ['topics', 'memberships'])
  }
  if (fields.updated !== undefined) writeKey(file, 'updated', fields.updated, staging, ['topics', 'memberships'])
}
