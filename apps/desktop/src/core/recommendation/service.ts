import type { DiscoveryFetchResult } from '../../shared/contract.js'
import type { VaultStore } from '../vault.js'
import { mergeIntentResults, type IntentResult } from './merge.js'
import {
  recommendationFingerprint, recommendationQueryIntent, selectRecommendationIntents,
} from './profile.js'
import { applyRecommendationSignals } from './signals.js'
import type {
  DiscoverySchedule, RecommendationIntent, RecommendationProfile, RecommendationProvider,
  RecommendationSource,
} from './types.js'

const MAX_GLOBAL_CALLS = 12
const MAX_PROJECT_CALLS = 3
export const DISCOVERY_COOLDOWN_MS = 6 * 60 * 60 * 1_000
const CORE_SOURCE_CYCLE: RecommendationSource[] = [
  'similarity', 'citation', 'reference', 'author',
]

type ProjectPlan = {
  id: string
  profile: RecommendationProfile
  negative: string[]
  excluded: Set<string>
  intents: RecommendationIntent[]
  selected: RecommendationIntent[]
  nextCursor: number
  schedule: DiscoverySchedule
  results: IntentResult[]
  successfulRequests: Record<string, { fingerprint: string; fetchedAt: number }>
  failed: number
}

const sourceKey = (intentId: string, source: RecommendationSource): string => (
  `${intentId}@${source}`
)

/**
 * The direction cooldown remains the request-rate gate. Once due, the core direction uses the
 * least-covered source; secondary directions stay on similarity so exploration cannot displace
 * project coverage or multiply the global provider-call budget.
 */
const recommendationSource = (
  intent: RecommendationIntent, negative: string[], schedule: DiscoverySchedule,
): RecommendationSource => {
  if (!intent.core) return 'similarity'
  const ranked = CORE_SOURCE_CYCLE.map((source, order) => {
    const fingerprint = recommendationFingerprint(intent, negative, source)
    const explicit = schedule.requests[sourceKey(intent.id, source)]
    const legacy = source === 'similarity' ? schedule.requests[intent.id] : undefined
    const cached = explicit ?? legacy
    return {
      source, order,
      fetchedAt: cached?.fingerprint === fingerprint ? cached.fetchedAt : Number.NEGATIVE_INFINITY,
    }
  })
  ranked.sort((left, right) => left.fetchedAt - right.fetchedAt || left.order - right.order)
  return ranked[0]!.source
}

export type RecommendationService = {
  discover(projectId?: string, force?: boolean): Promise<DiscoveryFetchResult>
}

/**
 * Project discovery orchestration. The service owns profile selection, seed/feedback projection,
 * provider calls and durable publication; UI and Background only call this boundary.
 */
export function createRecommendationService(deps: {
  store: Pick<VaultStore,
    'listDiscoveryProfiles' | 'discoveryIntents' | 'discoveryProfile' | 'discoverySchedule'
    | 'setDiscoverySchedule' | 'addDiscoveryEntries' | 'deliverySettings'>
  provider: RecommendationProvider
  onWrite: () => void
  now: () => number
}): RecommendationService {
  return {
    async discover(projectId, force = false) {
      const now = deps.now()
      const profiles = deps.store.listDiscoveryProfiles()
        .filter((profile) => projectId === undefined || profile.id === projectId)
        .filter((profile) => profile.seedCount + profile.positiveCount > 0)
        .sort((left, right) => {
          if (left.lastFetchedAt === null) return right.lastFetchedAt === null ? 0 : -1
          if (right.lastFetchedAt === null) return 1
          return left.lastFetchedAt - right.lastFetchedAt
        })
      const budget = projectId === undefined ? MAX_GLOBAL_CALLS : MAX_PROJECT_CALLS
      const plans: ProjectPlan[] = profiles.map((profile) => {
        const context = deps.store.discoveryProfile(profile.id)
        const schedule = deps.store.discoverySchedule(profile.id)
        const negative = context.negative.map((seed) => seed.paperId).slice(0, 5)
        return {
          id: profile.id, profile: context, negative,
          excluded: new Set([
            ...negative, ...context.positive.map((seed) => seed.paperId),
          ]),
          intents: deps.store.discoveryIntents(profile.id).filter((intent) => intent.enabled),
          selected: [], nextCursor: schedule.cursor, schedule, results: [],
          successfulRequests: {}, failed: 0,
        }
      })

      // Give every project one turn before assigning a second or third. This uses spare budget
      // without letting an early project's secondary directions crowd out another project's core.
      const allocations = new Map<ProjectPlan, number>()
      let remaining = budget
      for (let slot = 0; slot < MAX_PROJECT_CALLS && remaining > 0; slot += 1) {
        for (const plan of plans) {
          const held = allocations.get(plan) ?? 0
          if (held >= plan.intents.length || remaining === 0) continue
          allocations.set(plan, held + 1)
          remaining -= 1
        }
      }
      for (const plan of plans) {
        const selected = selectRecommendationIntents(
          plan.intents, allocations.get(plan) ?? 0, plan.nextCursor,
        )
        plan.selected = selected.selected
        plan.nextCursor = selected.nextCursor
      }
      const tasks = Array.from({ length: MAX_PROJECT_CALLS }, (_, slot) => (
        plans.flatMap((plan) => {
          const intent = plan.selected[slot]
          return intent === undefined ? [] : [{ plan, intent }]
        })
      )).flat()
      let added = 0
      let remainingItems = deps.store.deliverySettings().maxItemsPerRun
      let cachedIntents = 0
      let successfulIntents = 0
      for (const { plan, intent } of tasks) {
        const queryIntent = recommendationQueryIntent(intent)
        const fingerprint = recommendationFingerprint(queryIntent, plan.negative)
        const cached = plan.schedule.requests[intent.id]
        if (!force && cached?.fingerprint === fingerprint
          && now - cached.fetchedAt < DISCOVERY_COOLDOWN_MS) {
          cachedIntents += 1
          continue
        }
        try {
          const source = recommendationSource(queryIntent, plan.negative, plan.schedule)
          const found = await deps.provider.recommend(
            queryIntent.seeds.map((seed) => seed.paperId), plan.negative, source,
          )
          const papers = applyRecommendationSignals(plan.profile, queryIntent, found.filter((paper) => (
            !plan.excluded.has(paper.semanticId) && !plan.excluded.has(`ARXIV:${paper.id}`)
          )))
          plan.results.push({ intent: queryIntent, papers })
          plan.successfulRequests[intent.id] = { fingerprint, fetchedAt: now }
          plan.successfulRequests[sourceKey(intent.id, source)] = {
            fingerprint: recommendationFingerprint(queryIntent, plan.negative, source),
            fetchedAt: now,
          }
          successfulIntents += 1
        } catch {
          plan.failed += 1
        }
      }
      const touched = plans.filter((plan) => Object.keys(plan.successfulRequests).length > 0)
      try {
        for (const plan of touched) {
          if (remainingItems > 0) {
            const published = deps.store.addDiscoveryEntries(
              plan.id, mergeIntentResults(plan.results), remainingItems,
            )
            added += published
            remainingItems -= published
          }
          deps.store.setDiscoverySchedule(plan.id, {
            lastFetchedAt: plan.failed === 0 ? now : plan.schedule.lastFetchedAt,
            cursor: plan.failed === 0 ? plan.nextCursor : plan.schedule.cursor,
            requests: { ...plan.schedule.requests, ...plan.successfulRequests },
          })
        }
        if (touched.length > 0) deps.onWrite()
        return {
          projects: touched.length,
          intents: successfulIntents,
          added,
          deferredProjects: plans.filter((plan) => (
            plan.intents.length > 0 && plan.selected.length === 0
          )).length,
          cachedIntents,
          failedIntents: plans.reduce((total, plan) => total + plan.failed, 0),
        }
      } catch (error) {
        throw new Error(`没能保存论文发现:${error instanceof Error ? error.message : String(error)}`)
      }
    },
  }
}
