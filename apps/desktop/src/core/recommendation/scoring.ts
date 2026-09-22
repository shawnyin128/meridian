import type { InboxEntry, InboxListParams, Watch } from '../../shared/contract.js'
import type { RemotePaper } from '../net/arxiv.js'
import type { PaperImpact } from './types.js'

const words = (text: string): string[] => text.toLocaleLowerCase()
  .match(/[\p{L}\p{N}]+/gu)?.filter((word) => word.length > 1) ?? []

const normalized = (text: string): string => words(text).join(' ')

/** Topic coverage favours a phrase in the title, then title tokens, then abstract tokens. */
export function relevanceOf(watch: Pick<Watch, 'type' | 'name'>, paper: RemotePaper): number {
  const query = normalized(watch.name)
  if (query === '') return 0
  if (watch.type === 'author') {
    const authors = paper.authors.map(normalized)
    if (authors.includes(query)) return 1
    const terms = words(query)
    return authors.some((author) => terms.every((term) => author.includes(term))) ? 0.85 : 0
  }
  const title = normalized(paper.title)
  const abstract = normalized(paper.abstract)
  if (title.includes(query)) return 1
  const terms = words(query)
  const titleHits = terms.filter((term) => title.includes(term)).length / terms.length
  const abstractHits = terms.filter((term) => abstract.includes(term)).length / terms.length
  return Math.min(1, titleHits * 0.75 + abstractHits * 0.25)
}

/** Adds compact ranking metadata without changing the source record. */
export function rankedPaper(
  watch: Pick<Watch, 'type' | 'name'>, paper: RemotePaper, impact?: PaperImpact,
): RemotePaper {
  const published = paper.journalRef !== null || impact?.published === true
  return {
    ...paper,
    ...(paper.journalRef === null && impact?.published === true && impact.venue !== ''
      ? { journalRef: impact.venue } : {}),
    ranking: {
      relevance: relevanceOf(watch, paper),
      published,
      citationCount: impact?.citationCount ?? 0,
      influentialCitationCount: impact?.influentialCitationCount ?? 0,
      submitted: paper.submitted,
    },
  }
}

const impactScore = (entry: InboxEntry): number => {
  const rank = entry.ranking
  if (rank === undefined) return 0
  const citations = Math.min(1, Math.log10(rank.citationCount + 1) / 3)
  const influential = Math.min(1, Math.log10(rank.influentialCitationCount + 1) / 2)
  return citations * 0.75 + influential * 0.25
}

type RankValues = {
  recommended: number
  impact: number
  published: number
  submitted: string
}

/** One score shared by every recommendation UI projection. Relevance remains dominant. */
export function recommendationScore(entry: InboxEntry, now = Date.now()): number {
  const rank = entry.ranking
  if (rank === undefined) return 0
  const submitted = Date.parse(`${rank.submitted}T00:00:00Z`)
  const ageDays = Number.isNaN(submitted) ? 1095 : Math.max(0, (now - submitted) / 86_400_000)
  const freshness = Math.max(0, 1 - ageDays / 1095)
  return rank.relevance * 0.55 + Number(rank.published) * 0.2
    + impactScore(entry) * 0.15 + freshness * 0.1
}

const valuesOf = (entry: InboxEntry, now: number): RankValues => ({
  recommended: recommendationScore(entry, now),
  impact: impactScore(entry),
  published: Number(entry.ranking?.published ?? false),
  submitted: entry.ranking?.submitted ?? '',
})

const compare = (mode: NonNullable<InboxListParams['sort']>) => (
  a: { entry: InboxEntry; values: RankValues }, b: { entry: InboxEntry; values: RankValues },
): number => {
  if (mode === 'latest') return b.values.submitted.localeCompare(a.values.submitted)
  if (mode === 'impact') {
    return b.values.impact - a.values.impact
      || (b.entry.ranking?.citationCount ?? 0) - (a.entry.ranking?.citationCount ?? 0)
  }
  if (mode === 'published') {
    return b.values.published - a.values.published
      || b.values.recommended - a.values.recommended
  }
  return b.values.recommended - a.values.recommended
}

/** Sorts inside each source group while preserving group order and stable ties. */
export function orderInbox(
  entries: InboxEntry[], mode: NonNullable<InboxListParams['sort']> = 'recommended', now = Date.now(),
): InboxEntry[] {
  const groups = new Map<string, { entry: InboxEntry; values: RankValues }[]>()
  for (const entry of entries) {
    const key = entry.kind === 'discovery' ? entry.project : entry.watch
    const ranked = { entry, values: valuesOf(entry, now) }
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [ranked])
    else group.push(ranked)
  }
  return [...groups.values()].flatMap((group) => group.sort(compare(mode)).map(({ entry }) => entry))
}
