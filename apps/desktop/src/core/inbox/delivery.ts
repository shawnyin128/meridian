import type { InboxEntry, InboxListParams, InboxStream } from '../../shared/contract.js'
import { listingsOf } from '../../shared/inbox-streams.js'
import { orderInbox, recommendationScore, type ScopeRanking } from '../recommendation/index.js'
import { createPaperIndex, type PaperIdentity } from './identity.js'

type Reason = InboxEntry['reasons'][number]

/** A stream that delivered a paper besides the one that delivered it first, with the reasons it gave. */
export type StoredStream = InboxStream & { reasons: Reason[] }

/** The fields every stored inbox entry carries that say which streams list it. */
export type StreamEntry = Pick<InboxEntry, 'kind' | 'watch' | 'project' | 'source' | 'reasons'> & {
  also?: StoredStream[] | undefined
}

/** Returns every stream that lists `entry`: the one that delivered it first, then the others in order. */
export function streamsOf(entry: StreamEntry): StoredStream[] {
  return [
    {
      kind: entry.kind, id: entry.kind === 'discovery' ? entry.project : entry.watch, source: entry.source,
      reasons: entry.reasons,
    },
    ...(entry.also ?? []),
  ]
}

/** Returns whether `entry` is listed under a stream of `kind`, and under the one with id `id` when given. */
export function listedUnder(entry: StreamEntry, kind: InboxStream['kind'], id?: string): boolean {
  return streamsOf(entry).some((stream) => stream.kind === kind && (id === undefined || stream.id === id))
}

/** Returns the reasons of every stream that lists `entry`, each label once, in stream order. */
export function combinedReasons(entry: StreamEntry): Reason[] {
  const seen = new Set<string>()
  return streamsOf(entry).flatMap((stream) => stream.reasons).filter((reason) => {
    if (seen.has(reason.label)) return false
    seen.add(reason.label)
    return true
  })
}

/**
 * Orders the entries `listInbox(params)` lists in `params.sort` order inside each group: the one watch
 * or project `params` names, or else the first stream of `params.kind` that lists an entry, or else
 * the stream that delivered it first.
 */
export function orderListing(rows: InboxEntry[], params: InboxListParams): InboxEntry[] {
  const scope = params.watch ?? params.project
  return orderInbox(rows, params.sort, (entry) => {
    if (scope !== undefined) return scope
    const kind = params.kind ?? entry.kind
    return `${kind}:${listingsOf(entry, kind)[0]!.id}`
  })
}

/** Returns `entry` with `stream` added to the streams that list it, or `entry` itself when it already does. */
export function withStream<E extends StreamEntry>(entry: E, stream: StoredStream): E {
  if (listedUnder(entry, stream.kind, stream.id)) return entry
  return { ...entry, also: [...(entry.also ?? []), stream] }
}

/**
 * Returns `entry` no longer listed under the streams `gone` names: when the stream that delivered it
 * first is one of them, the next stream takes its place, with its own source and reasons. Returns null
 * when no stream lists it anymore, and `entry` itself when `gone` names none of them.
 */
export function withoutStreams<E extends StreamEntry>(entry: E, gone: (stream: InboxStream) => boolean): E | null {
  const streams = streamsOf(entry)
  const kept = streams.filter((stream) => !gone(stream))
  if (kept.length === streams.length) return entry
  const [first, ...rest] = kept
  if (first === undefined) return null
  const next: E = {
    ...entry, kind: first.kind, watch: first.kind === 'watch' ? first.id : '',
    project: first.kind === 'discovery' ? first.id : '', source: first.source, reasons: first.reasons, also: rest,
  }
  if (rest.length === 0) delete next.also
  return next
}

/**
 * Cuts a refresh of one scope to `shown` cards besides those given `more` feedback. `live` are the
 * cards the scope shows and `fresh` the papers it found to deliver; a live card given `more` feedback
 * always stays and takes no place, and the rest are ranked by recommendation score, ties keeping live
 * cards first, each list in its own order. Returns the fresh papers that make the cut, in their order,
 * and the ids of the live cards that do not.
 */
export function cutBelow<P extends Pick<InboxEntry, 'ranking'>>(
  live: Pick<InboxEntry, 'id' | 'feedback' | 'ranking'>[], fresh: P[], shown: number,
): { kept: P[]; folded: Set<string> } {
  const ranked: { card?: string; paper?: P; score: number }[] = [
    ...live.filter((card) => card.feedback !== 'more').map((card) => ({ card: card.id, score: recommendationScore(card) })),
    ...fresh.map((paper) => ({ paper, score: recommendationScore(paper) })),
  ]
  const order = new Map(ranked.map((item, at) => [item, at]))
  ranked.sort((left, right) => right.score - left.score || order.get(left)! - order.get(right)!)
  const kept = new Set(ranked.slice(0, shown).flatMap(({ paper }) => (paper === undefined ? [] : [paper])))
  return {
    kept: fresh.filter((paper) => kept.has(paper)),
    folded: new Set(ranked.slice(shown).flatMap(({ card }) => (card === undefined ? [] : [card]))),
  }
}

/**
 * Cuts a refresh of one scope to the papers `ranking` shows of the scope's `live` cards and the
 * `fresh` papers it found, each named by its batch id, a card `ranking` did not score ranking by its
 * stored relevance. Returns the fresh papers shown, in their order, and the ids of the live cards not.
 */
export function cutByRanking<P>(
  live: { id: string; paperId: string; ranking?: { relevance: number } | undefined }[], fresh: P[],
  paperIdOf: (paper: P) => string, ranking: ScopeRanking,
): { kept: P[]; folded: Set<string> } {
  const shown = ranking.shown([
    ...live.map((card) => ({ paperId: card.paperId, relevance: card.ranking?.relevance ?? 0 })),
    ...fresh.map((paper) => ({ paperId: paperIdOf(paper), relevance: 0 })),
  ])
  return {
    kept: fresh.filter((paper) => shown.has(paperIdOf(paper))),
    folded: new Set(live.filter((card) => !shown.has(card.paperId)).map((card) => card.id)),
  }
}

/** What a found paper turns out to be: in the library, delivered before, or the live card with id `id`. */
type Known = { kind: 'owned' } | { kind: 'seen' } | { kind: 'live'; id: string }

/**
 * Sorts the papers a stream found: `fresh` are those to deliver as new cards, in found order and each
 * paper once, and `merged` maps the id of each live card the stream found again to the first paper
 * that found it. A found paper is matched by identity against, in this order, `owned` (the library),
 * `live` (cards in the feed, by id), and `seen` (everything delivered before, gone cards and the
 * delivery history alike); an owned or seen paper is skipped.
 */
export function sortFound<P>(found: P[], identityOf: (paper: P) => PaperIdentity, known: {
  owned: PaperIdentity[]; live: { id: string; identity: PaperIdentity }[]; seen: PaperIdentity[]
}): { fresh: P[]; merged: Map<string, P> } {
  const index = createPaperIndex<Known>()
  for (const identity of known.owned) index.add(identity, { kind: 'owned' })
  for (const { id, identity } of known.live) index.add(identity, { kind: 'live', id })
  for (const identity of known.seen) index.add(identity, { kind: 'seen' })
  const fresh: P[] = []
  const merged = new Map<string, P>()
  for (const paper of found) {
    const identity = identityOf(paper)
    const match = index.find(identity)
    if (match?.kind === 'live' && !merged.has(match.id)) merged.set(match.id, paper)
    if (match !== undefined) continue
    fresh.push(paper)
    index.add(identity, { kind: 'seen' })
  }
  return { fresh, merged }
}
