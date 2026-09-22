import type { PaperRow, Watch } from '../../shared/contract.js'
import { WATCH_KINDS } from '../../shared/vocabulary.js'
import type { RemotePaper } from '../net/arxiv.js'

/** Returns a title normalized for duplicate comparison. */
export const titleKey = (title: string): string =>
  title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/** Returns only results that neither inbox history nor the paper library already accounts for. */
export function unseenPapers<T extends RemotePaper>(
  found: T[], seenArxiv: Iterable<string>, papers: Iterable<PaperRow>,
): T[] {
  const ids = new Set(seenArxiv)
  const titles = new Set<string>()
  for (const paper of papers) {
    if (paper.identifier?.startsWith('arXiv:')) ids.add(paper.identifier.slice('arXiv:'.length))
    titles.add(titleKey(paper.title))
  }
  const unseen: T[] = []
  for (const paper of found) {
    const title = titleKey(paper.title)
    if (ids.has(paper.id) || titles.has(title)) continue
    ids.add(paper.id)
    titles.add(title)
    unseen.push(paper)
  }
  return unseen
}

/** Maps one arXiv result to the durable inbox fields carried under a watch. */
export function inboxFields(watch: Watch, paper: RemotePaper) {
  const source = `${WATCH_KINDS[watch.type]} · ${watch.name}`
  return {
    kind: 'watch' as const,
    project: '',
    source,
    title: paper.title,
    authors: paper.authors.join(', '),
    venue: paper.journalRef ?? `arXiv:${paper.id}`,
    abstract: paper.abstract,
    rec: '',
    reasons: [{ kind: 'watch' as const, label: `命中${WATCH_KINDS[watch.type]}「${watch.name}」` }],
    pdf: paper.pdf,
    ...(paper.ranking === undefined ? {} : { ranking: paper.ranking }),
    topic: watch.type === 'topic' ? watch.name : '',
    arxiv: paper.id,
    meta: { authors: paper.authors, submitted: paper.submitted, journalRef: paper.journalRef },
  }
}
