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
export { createArxivRecommendations } from './providers/arxiv.js'
export { createFallbackRecommendations } from './providers/fallback.js'
export {
  orderInbox,
  rankedPaper,
  recommendationScore,
  relevanceOf,
} from './scoring.js'
export { discoveryReasons, mergeIntentResults } from './merge.js'
export { POOL_LIMIT, poolFirst, shareCap } from './pool.js'
export type { IntentResult } from './merge.js'
export { matchingWikiTerms } from './signals.js'
export {
  evaluateRecommendations, passesRecommendationGate, STAGE_TWO_THRESHOLDS,
} from './evaluation.js'
export type { RecommendationEvaluationCase, RecommendationMetrics } from './evaluation.js'
export {
  applyRecommendationPreferences, buildRecommendationProfile, clusterRecommendationProfile,
  recommendationFingerprint, recommendationQuery, recommendationSeedIds,
  selectRecommendationIntents,
} from './profile.js'
export {
  directionBasis, directionIntents, directionLabel, directionsAfter, migratedDirections, mirroredDisabled,
  scannedDirections, shortTitleOf,
} from './directions.js'
export type { DirectionPaper, DirectionRecord, ProjectDirections } from './directions.js'
export { createRecommendationService, scoringBackground, textCollector } from './service.js'
export {
  createEmbeddings, EMBEDDING_BATCH_LIMIT, EMBEDDING_CACHE_LIMIT, semanticEmbeddingUrl,
} from './embeddings.js'
export type { EmbeddingFallbackReason, EmbeddingLookup, EmbeddingRun, Embeddings } from './embeddings.js'
export type { RecommendationService } from './service.js'
export { batchIdOf, createScorer } from './scorer.js'
export type { GroupScore, RunScores, ScoreGap, ScoredText, Scorer, ScoreGroup, ScorePath } from './scorer.js'
export { trainingExamples } from './examples.js'
export { feedMeasures, logFeedMeasures, logGaps, rankingGap } from './measures.js'
export type { PathMeasures, RankingGap } from './measures.js'
export type { ExampleScope, ExampleStore, TrainingExample } from './examples.js'
export { SCORE_THRESHOLD, selectShown } from './selection.js'
export type {
  DiscoveryPaper,
  DiscoveryPreferences,
  DiscoverySchedule,
  KnownPaper,
  PaperImpact,
  PaperScore,
  RecommendationIntent,
  RecommendationMatch,
  RecommendationOrigin,
  RecommendationProfile,
  RecommendationProvider,
  RecommendationSeed,
  RecommendationSource,
  RefreshProgress,
  RefreshScope,
  ScholarlyMetadata,
  ScopeCard,
  ScopeRanking,
  ScopeSignals,
} from './types.js'
