export {
  createSemanticRecommendations,
  createSemanticScholar,
  parseSemanticAuthorNeighbors,
  parseSemanticRelations,
  parsePaperImpact,
  parseSemanticRecommendations,
  semanticAuthorNeighborsUrl,
  semanticCitationUrl,
  semanticRecommendationsUrl,
  semanticReferenceUrl,
  semanticScholarBatchUrl,
} from './providers/semantic-scholar.js'
export {
  orderInbox,
  rankedPaper,
  recommendationScore,
  relevanceOf,
} from './scoring.js'
export { discoveryReasons, mergeIntentResults } from './merge.js'
export type { IntentResult } from './merge.js'
export { applyRecommendationSignals } from './signals.js'
export {
  evaluateRecommendations, passesRecommendationGate, STAGE_TWO_THRESHOLDS,
} from './evaluation.js'
export type { RecommendationEvaluationCase, RecommendationMetrics } from './evaluation.js'
export {
  applyRecommendationPreferences, buildRecommendationProfile, clusterRecommendationProfile,
  recommendationFingerprint, recommendationQueryIntent, recommendationSeedIds,
  selectRecommendationIntents,
} from './profile.js'
export { createRecommendationService } from './service.js'
export type { RecommendationService } from './service.js'
export type {
  DiscoveryPaper,
  DiscoveryPreferences,
  DiscoverySchedule,
  PaperImpact,
  RecommendationIntent,
  RecommendationMatch,
  RecommendationOrigin,
  RecommendationProfile,
  RecommendationProvider,
  RecommendationSeed,
  RecommendationSource,
  ScholarlyMetadata,
} from './types.js'
