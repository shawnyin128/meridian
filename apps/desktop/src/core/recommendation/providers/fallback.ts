import { firstAnswer } from '../../net/scholar-sources.js'
import type { RecommendationProvider } from '../types.js'

/**
 * Asks `providers()` in order for each request and returns the first answer, so one provider's
 * failure falls through to the next. Throws the last provider's error when all fail.
 */
export function createFallbackRecommendations(
  providers: () => readonly RecommendationProvider[],
): RecommendationProvider {
  return {
    recommend: (positive, negativePaperIds, source) => firstAnswer(
      providers(), (provider) => provider.recommend(positive, negativePaperIds, source),
    ),
  }
}
