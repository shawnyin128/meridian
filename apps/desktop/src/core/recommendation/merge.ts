import type { DiscoveryPaper, RecommendationIntent, RecommendationMatch } from './types.js'

export type IntentResult = { intent: RecommendationIntent; papers: DiscoveryPaper[] }

export function discoveryReasons(projectName: string, fallbackSeedCount: number, paper: DiscoveryPaper) {
  const matches = paper.matches ?? []
  const matchedSeeds = new Set(matches.flatMap((match) => match.seedPaperIds))
  const sourceLabels = {
    similarity: '由相似论文召回',
    citation: '由后续引用召回',
    reference: '由参考文献召回',
    author: '由同作者论文召回',
  } as const
  const origins = paper.origins ?? []
  const sources = [...new Set(origins.map((origin) => origin.source))]
  const viaArxiv = (source: keyof typeof sourceLabels): boolean => origins.some((origin) => (
    origin.source === source && origin.provider === 'arxiv'
  ))
  return [
    { kind: 'project' as const, label: `来自项目「${projectName}」` },
    ...matches.slice(0, 2).map((match) => ({
      kind: 'intent' as const,
      label: `匹配${match.core ? '核心' : '轮换'}方向「${match.intentLabel}」`,
    })),
    ...sources.slice(0, 2).map((source) => ({
      kind: 'source' as const, label: viaArxiv(source) ? `${sourceLabels[source]} · arXiv` : sourceLabels[source],
    })),
    ...((paper.wikiTerms ?? []).length === 0 ? [] : [{
      kind: 'wiki' as const,
      label: `匹配 Wiki 主题/方法「${paper.wikiTerms!.slice(0, 3).join(' · ')}」`,
    }]),
    {
      kind: 'seed' as const,
      label: `基于 ${Math.max(1, matchedSeeds.size || fallbackSeedCount)} 篇相关论文`,
    },
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
