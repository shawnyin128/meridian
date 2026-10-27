import { selectShown, type ScopeRanking } from '../recommendation/index.js'

/**
 * A refresh's ranking for tests that deliver by hand: every paper scores `score` of its batch id
 * (1 by default) on `path` (the fallback by default), with one direction reason, and a scope
 * shows at most `shown` (20 by default) of its papers, best first, none below the threshold.
 */
export function fixedRanking(
  options: { score?: (paperId: string) => number; shown?: number; path?: 'api' | 'fallback' } = {},
): ScopeRanking {
  const score = options.score ?? (() => 1)
  return {
    scoreOf: (paperId) => ({
      relevance: score(paperId), path: options.path ?? 'fallback', reasons: [{ kind: 'intent', label: '方向「测试」' }],
    }),
    shown: (candidates) => new Set(selectShown(
      candidates.map(({ paperId }) => ({ paperId, score: score(paperId), direction: 'test' })),
      [{ id: 'test', core: true }], options.shown ?? 20, () => 0,
    )),
  }
}
