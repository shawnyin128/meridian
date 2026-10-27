import type { PublicationSource } from '../../net/semantic-metadata.js'
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
 * Looks up, in one pass of `source`, where every paper of `store` whose identifier names an arXiv id or
 * a DOI was published, and refreshes each one (refreshPaperPublication): the venue, with its year,
 * where it may take it, and a year the App filled over an arXiv submission year, even for a paper
 * nothing was found for. Returns how many papers changed. Throws when the lookup fails, having
 * written nothing.
 */
export async function fillPublications(store: VaultStore, source: PublicationSource): Promise<number> {
  const papers = store.listPapers({ page: 1, size: Number.MAX_SAFE_INTEGER }).rows.flatMap((paper) => {
    const id = publicationIdOf(paper.identifier)
    return id === null ? [] : [{ paper: paper.id, id }]
  })
  if (papers.length === 0) return 0
  const found = await source.lookup([...new Set(papers.map((p) => p.id))])
  let updated = 0
  for (const { paper, id } of papers) {
    if (store.refreshPaperPublication(paper, found.get(id)).length > 0) updated += 1
  }
  return updated
}
