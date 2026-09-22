import type { DiscoveryPaper, RecommendationIntent } from './types.js'

export type RecommendationEvaluationCase = {
  name: string
  seedPaperIds: string[]
  negativePaperIds: string[]
  intents: RecommendationIntent[]
  expectedRelevantIds: string[]
  expectedIntents: Record<string, string[]>
  results: DiscoveryPaper[]
}

export type RecommendationMetrics = {
  candidateRecall: number
  projectRelevance: number
  novelty: number
  reasonCorrectness: number
  sourceDiversity: number
  feedbackResponsiveness: number
}

const ratio = (value: number, total: number): number => total === 0 ? 1 : value / total

/** Inspectable offline metrics; no metric mutates recommendation or Wiki state. */
export function evaluateRecommendations(sample: RecommendationEvaluationCase): RecommendationMetrics {
  const returned = new Set(sample.results.map((paper) => paper.semanticId))
  const expected = new Set(sample.expectedRelevantIds)
  const relevantReturned = sample.results.filter((paper) => expected.has(paper.semanticId))
  const seedIds = new Set(sample.seedPaperIds)
  const negativeIds = new Set(sample.negativePaperIds)
  const correctReasons = relevantReturned.filter((paper) => {
    const wanted = new Set(sample.expectedIntents[paper.semanticId] ?? [])
    const actual = new Set((paper.matches ?? []).map((match) => match.intentId))
    return wanted.size > 0 && [...wanted].every((id) => actual.has(id))
  }).length
  const covered = new Set(relevantReturned.flatMap((paper) => (
    (paper.matches ?? []).map((match) => match.intentId)
  )))
  return {
    candidateRecall: ratio([...expected].filter((id) => returned.has(id)).length, expected.size),
    projectRelevance: ratio(relevantReturned.length, sample.results.length),
    novelty: ratio(sample.results.filter((paper) => (
      !seedIds.has(paper.semanticId) && !seedIds.has(`ARXIV:${paper.id}`)
    )).length, sample.results.length),
    reasonCorrectness: ratio(correctReasons, relevantReturned.length),
    sourceDiversity: ratio(covered.size, sample.intents.length),
    feedbackResponsiveness: ratio(sample.results.filter((paper) => (
      !negativeIds.has(paper.semanticId) && !negativeIds.has(`ARXIV:${paper.id}`)
    )).length, sample.results.length),
  }
}

export const STAGE_TWO_THRESHOLDS: RecommendationMetrics = {
  candidateRecall: 0.8,
  projectRelevance: 0.6,
  novelty: 1,
  reasonCorrectness: 1,
  sourceDiversity: 1,
  feedbackResponsiveness: 1,
}

export function passesRecommendationGate(
  metrics: RecommendationMetrics, thresholds = STAGE_TWO_THRESHOLDS,
): boolean {
  return (Object.keys(thresholds) as Array<keyof RecommendationMetrics>)
    .every((metric) => metrics[metric] >= thresholds[metric])
}
