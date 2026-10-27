import type { InboxEntry } from '../../shared/contract.js'
import type { DiscoveryPaper, RecommendationIntent, RecommendationMatch } from './types.js'

export type IntentResult = { intent: RecommendationIntent; papers: DiscoveryPaper[] }

/** Longest text a reason quotes, so a long title or label never makes the reason unreadable. */
const QUOTE_LIMIT = 200

const quote = (text: string): string => text.trim().slice(0, QUOTE_LIMIT)

const TAKEN_LABEL = { library: '你入库的', later: '你稍后阅读的', rated: '你评 5 星的' } as const

/**
 * The reasons a discovery card shows, strongest first: the direction it scored best under; the
 * positive example nearest to it, a seed or a paper the user `taken` from the feed, by its short
 * title; and a Wiki term of that direction the paper contains.
 */
export function discoveryReasons(basis: {
  direction: string
  near?: { paperId: string; title: string; taken?: keyof typeof TAKEN_LABEL | undefined } | undefined
  wikiTerm?: string | undefined
}): InboxEntry['reasons'] {
  const { direction, near, wikiTerm } = basis
  return [
    ...(quote(direction) === '' ? [] : [{ kind: 'intent' as const, label: `方向「${quote(direction)}」` }]),
    ...(near === undefined || quote(near.title) === '' ? [] : [near.taken === undefined
      ? { kind: 'seed' as const, label: `接近《${quote(near.title)}》`, paperId: near.paperId }
      : { kind: 'feedback' as const, label: `接近${TAKEN_LABEL[near.taken]}《${quote(near.title)}》`, paperId: near.paperId }]),
    ...(wikiTerm === undefined || quote(wikiTerm) === '' ? [] : [{ kind: 'wiki' as const, label: `Wiki「${quote(wikiTerm)}」` }]),
  ]
}

const paperKey = (paper: DiscoveryPaper): string => (
  paper.semanticId !== '' ? `semantic:${paper.semanticId}` : `arxiv:${paper.id}`
)

const withMatch = (
  paper: DiscoveryPaper, match: RecommendationMatch, matches: RecommendationMatch[],
  incoming?: DiscoveryPaper,
): DiscoveryPaper => {
  const origins = [...(paper.origins ?? [])]
  for (const origin of incoming?.origins ?? []) {
    if (!origins.some((held) => (
      held.source === origin.source && held.provider === origin.provider
      && held.seedPaperIds.join('\n') === origin.seedPaperIds.join('\n')
    ))) origins.push(origin)
  }
  const wikiTerms = [...new Set([...(paper.wikiTerms ?? []), ...(incoming?.wikiTerms ?? [])])]
  return {
    ...paper,
    matches: [...matches, match],
    ...(origins.length === 0 ? {} : { origins }),
    ...(wikiTerms.length === 0 ? {} : { wikiTerms }),
  }
}

/** Round-robin merge keeps every project intent visible while deduplicating cross-intent hits. */
export function mergeIntentResults(results: IntentResult[], limit = 20): DiscoveryPaper[] {
  const merged: DiscoveryPaper[] = []
  const byKey = new Map<string, number>()
  const maxLength = Math.max(0, ...results.map((result) => result.papers.length))
  for (let rank = 0; rank < maxLength; rank += 1) {
    for (const { intent, papers } of results) {
      const paper = papers[rank]
      if (paper === undefined) continue
      const match = {
        intentId: intent.id,
        intentLabel: intent.label,
        seedPaperIds: intent.seeds.map((seed) => seed.paperId),
        core: intent.core,
      }
      const key = paperKey(paper)
      const existing = byKey.get(key)
      if (existing !== undefined) {
        const held = merged[existing]!
        if (!(held.matches ?? []).some((item) => item.intentId === match.intentId)) {
          merged[existing] = withMatch(held, match, held.matches ?? [], paper)
        }
        continue
      }
      if (merged.length >= limit) continue
      byKey.set(key, merged.length)
      merged.push(withMatch(paper, match, []))
    }
  }
  return merged
}
