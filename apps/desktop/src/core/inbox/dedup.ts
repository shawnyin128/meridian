import type { Watch } from '../../shared/contract.js'
import { WATCH_KINDS } from '../../shared/vocabulary.js'
import type { RemotePaper } from '../net/arxiv.js'

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
