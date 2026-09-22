import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HttpGet } from './http.js'
import { minimalPdf } from './minimal-pdf.js'

export type CannedResponse = {
  status: number
  delayMs?: number
  file?: string
  pdf?: { title?: string; lines: string[] }
  atom?: string
  text?: string
  /** Dynamic author response used only by fixtures; production networking never passes through here. */
  kind?: 'author-papers' | 'openalex-author-search' | 'openalex-author-works'
}
export type CannedTable = Record<string, CannedResponse>

const wildcard = (pattern: string, value: string): boolean => {
  const expression = pattern.split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
  return new RegExp(`^${expression}$`).test(value)
}

const fixtureAuthorSearch = (url: string): Uint8Array => {
  const query = new URL(url).searchParams.get('search')?.trim() || '同名作者'
  const slug = [...query].map((char) => char.codePointAt(0)?.toString(16) ?? '').join('-')
  const affiliations = [
    'Massachusetts Institute of Technology',
    'Stanford University',
    'Carnegie Mellon University',
  ]
  return new TextEncoder().encode(JSON.stringify({
    results: affiliations.map((affiliation, at) => ({
      id: `https://openalex.org/fixture-${slug}-${at + 1}`,
      display_name: query,
      last_known_institutions: [{ display_name: affiliation }],
      works_count: 46 - at * 11,
      cited_by_count: 1280 - at * 360,
      summary_stats: { h_index: 19 - at * 4 },
    })),
  }))
}

/** Builds a deterministic HttpGet for tests and fixture mode without network access. */
export function createCannedGet(table: CannedTable, root: string): HttpGet {
  return async (url, { signal: given, timeoutMs, onProgress }) => {
    const signal = given ?? (timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs))
    const canned = table[url] ?? Object.entries(table)
      .find(([pattern]) => pattern.includes('*') && wildcard(pattern, url))?.[1]
    if (canned === undefined) return { status: 404, body: new Uint8Array() }
    const body = canned.kind === 'openalex-author-search' ? fixtureAuthorSearch(url)
      : canned.kind === 'openalex-author-works' ? new TextEncoder().encode('{"results":[]}')
      : canned.kind === 'author-papers' ? new TextEncoder().encode('{"data":[]}')
      : canned.file !== undefined ? new Uint8Array(readFileSync(join(root, canned.file)))
      : canned.pdf !== undefined ? minimalPdf(canned.pdf)
        : new TextEncoder().encode(canned.atom ?? canned.text ?? '')
    if (canned.delayMs !== undefined) {
      onProgress?.(Math.floor(body.byteLength / 2), body.byteLength)
      await new Promise<void>((done, fail) => {
        const timer = setTimeout(done, canned.delayMs)
        signal?.addEventListener('abort', () => { clearTimeout(timer); fail(signal.reason) }, { once: true })
      })
    }
    onProgress?.(body.byteLength, body.byteLength)
    return { status: canned.status, body }
  }
}
