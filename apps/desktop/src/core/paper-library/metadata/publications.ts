import type { DblpPaper, DblpSource } from '../../net/dblp.js'
import { netReason } from '../../net/http.js'
import type { Publication, PublicationSource } from '../../net/semantic-metadata.js'
import type { VaultStore } from '../../vault.js'

/** A DOI as a paper's identifier or a link may give it, with any `doi:` or doi.org prefix. */
const DOI = /^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/\S+)$/i

/**
 * Returns the Semantic Scholar id the paper identifier `identifier` names: `ARXIV:<id>` for
 * `arXiv:<id>`, `DOI:<doi>` for a DOI, null for anything else or no identifier.
 */
export function publicationIdOf(identifier: string | undefined): string | null {
  const text = identifier?.trim() ?? ''
  const arxiv = /^arxiv:\s*(\S+)$/i.exec(text)
  if (arxiv) return `ARXIV:${arxiv[1]}`
  const doi = DOI.exec(text)
  return doi ? `DOI:${doi[1]}` : null
}

/**
 * Returns the lookup one fill run uses for a paper: `found` when it gives the year of its venue, else
 * the venue `dblp` finds for the paper's title and authors, else `found`. After `dblp` fails once,
 * which never fails the run, it is not asked again in this run.
 */
export function dblpRun(dblp: DblpSource | undefined): (paper: DblpPaper, found: Publication | undefined) => Promise<Publication | undefined> {
  let failed = false
  return async (paper, found) => {
    if (dblp === undefined || failed || found?.year !== undefined || paper.title.trim() === '') return found
    try {
      return await dblp.venueOf(paper) ?? found
    } catch (error) {
      failed = true
      console.error(`[metadata] DBLP 发表信息没查到：${netReason(error)}`)
      return found
    }
  }
}

/**
 * Looks up, in one pass of `source`, where every paper of `store` whose identifier names an arXiv id or
 * a DOI was published, and refreshes each one (refreshPaperPublication): the venue, with its year,
 * where it may take it, and a year the App filled over an arXiv submission year, even for a paper
 * nothing was found for. A paper `source` gives no venue year for is looked up in `dblp`, one at a
 * time (dblpRun). Returns how many papers changed. Throws when the `source` lookup fails, having
 * written nothing.
 */
export async function fillPublications(store: VaultStore, source: PublicationSource, dblp?: DblpSource): Promise<number> {
  const papers = store.listPapers({ page: 1, size: Number.MAX_SAFE_INTEGER }).rows.flatMap((paper) => {
    const id = publicationIdOf(paper.identifier)
    return id === null ? [] : [{ paper, id }]
  })
  if (papers.length === 0) return 0
  const found = await source.lookup([...new Set(papers.map((p) => p.id))])
  const withDblp = dblpRun(dblp)
  let updated = 0
  for (const { paper, id } of papers) {
    const publication = await withDblp({ title: paper.title, authors: paper.authors ?? [] }, found.get(id))
    if (store.refreshPaperPublication(paper.id, publication).length > 0) updated += 1
  }
  return updated
}
