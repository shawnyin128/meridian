import { describe, expect, it } from 'vitest'
import { evaluateRecommendations, passesRecommendationGate } from './evaluation.js'
import { MIXED_PROJECT_PROFILE_FIXTURES } from './fixtures/mixed-projects.js'
import { mergeIntentResults } from './merge.js'
import { buildRecommendationProfile, clusterRecommendationProfile } from './profile.js'
import type { DiscoveryPaper, RecommendationIntent } from './types.js'

const candidate = (semanticId: string, id: string): DiscoveryPaper => ({
  semanticId, id, title: id, authors: [], abstract: '', submitted: '2026-09-17',
  journalRef: null, pdf: `https://arxiv.org/pdf/${id}`,
})
const intents: RecommendationIntent[] = [
  { id: 'intent-1', label: 'OPD', seeds: [{
    paperId: 'ARXIV:2605.29343', title: 'Draft-OPD', abstract: '', source: 'project',
  }], score: 1, core: true, enabled: true },
  { id: 'intent-2', label: 'KD', seeds: [{
    paperId: 'ARXIV:2510.15982', title: 'AMiD', abstract: '', source: 'project',
  }], score: 0.5, core: false, enabled: true },
]

describe('recommendation offline quality gate', () => {
  it('量化召回、相关、新颖、解释、方向覆盖与负反馈响应', () => {
    const results = mergeIntentResults([
      { intent: intents[0]!, papers: [candidate('osprey', '2609.09338'), candidate('noise', '1')] },
      { intent: intents[1]!, papers: [candidate('kd-new', '2')] },
    ])
    const metrics = evaluateRecommendations({
      name: 'on-policy distillation',
      seedPaperIds: ['ARXIV:2605.29343', 'ARXIV:2510.15982'],
      negativePaperIds: ['rejected'], intents,
      expectedRelevantIds: ['osprey', 'kd-new'],
      expectedIntents: { osprey: ['intent-1'], 'kd-new': ['intent-2'] },
      results,
    })
    expect(metrics).toEqual({
      candidateRecall: 1,
      projectRelevance: 2 / 3,
      novelty: 1,
      reasonCorrectness: 1,
      sourceDiversity: 1,
      feedbackResponsiveness: 1,
    })
    expect(passesRecommendationGate(metrics)).toBe(true)
  })

  it('负反馈论文重新出现时质量门槛失败', () => {
    const rejected = mergeIntentResults([{ intent: intents[0]!, papers: [candidate('rejected', '3')] }])
    const metrics = evaluateRecommendations({
      name: 'feedback regression', seedPaperIds: [], negativePaperIds: ['rejected'],
      intents: [intents[0]!], expectedRelevantIds: [], expectedIntents: {}, results: rejected,
    })
    expect(metrics.feedbackResponsiveness).toBe(0)
    expect(passesRecommendationGate(metrics)).toBe(false)
  })

  it.each(MIXED_PROJECT_PROFILE_FIXTURES)('$name', (sample) => {
    const profile = buildRecommendationProfile({
      projectId: sample.name,
      projectName: sample.projectName,
      anchorText: sample.anchorText,
      projectPapers: sample.seeds,
      feedbackPapers: [],
    })
    const clustered = clusterRecommendationProfile(profile)
    expect(clustered.map((intent) => intent.seeds.map((seed) => seed.paperId).sort()))
      .toEqual(sample.expectedClusters.map((ids) => [...ids].sort()))

    const expectedRelevantIds = clustered.map((intent, at) => `${sample.name}-relevant-${at}`)
    const merged = mergeIntentResults(clustered.map((intent, at) => ({
      intent,
      papers: [candidate(expectedRelevantIds[at]!, `${at + 10}`)],
    })))
    const metrics = evaluateRecommendations({
      name: sample.name,
      seedPaperIds: sample.seeds.map((seed) => seed.paperId),
      negativePaperIds: [],
      intents: clustered,
      expectedRelevantIds,
      expectedIntents: Object.fromEntries(clustered.map((intent, at) => (
        [expectedRelevantIds[at]!, [intent.id]]
      ))),
      results: merged,
    })
    expect(metrics).toEqual({
      candidateRecall: 1,
      projectRelevance: 1,
      novelty: 1,
      reasonCorrectness: 1,
      sourceDiversity: 1,
      feedbackResponsiveness: 1,
    })
    expect(passesRecommendationGate(metrics)).toBe(true)
  })
})
