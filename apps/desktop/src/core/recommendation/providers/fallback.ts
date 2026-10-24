import { firstAnswer } from '../../net/scholar-sources.js'
import type { RecommendationProvider } from '../types.js'

/**
 * Asks `providers()` in order for each request and returns the first answer, so one provider's
 * failure falls through to the next. Throws the last provider's error when all fail. Query keys are
 * those of the first provider, the one that answers while it works.
 */
export function createFallbackRecommendations(
  providers: () => readonly RecommendationProvider[],
): RecommendationProvider {
  return {
    recommend: (positive, negativePaperIds, source, page) => firstAnswer(
      providers(), (provider) => provider.recommend(positive, negativePaperIds, source, page),
    ),
    queryKey: (positive, source, page) => providers()[0]?.queryKey?.(positive, source, page),
  }
}
