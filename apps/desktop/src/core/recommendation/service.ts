import type { DiscoveryFetchResult } from '../../shared/contract.js'
import type { VaultStore } from '../vault.js'
import { mergeIntentResults, type IntentResult } from './merge.js'
import { POOL_LIMIT, poolFirst, shareCap } from './pool.js'
import {
  QUERY_SOURCES, recommendationFingerprint, recommendationQuery, selectRecommendationIntents,
} from './profile.js'
import { applyRecommendationSignals } from './signals.js'
import type {
  DiscoveryPaper, DiscoverySchedule, RecommendationIntent, RecommendationProfile, RecommendationProvider,
} from './types.js'

const MAX_GLOBAL_CALLS = 12
const MAX_PROJECT_CALLS = 3
export const DISCOVERY_COOLDOWN_MS = 6 * 60 * 60 * 1_000

type ProjectPlan = {
  id: string
  profile: RecommendationProfile
  negative: string[]
  excluded: Set<string>
  intents: RecommendationIntent[]
  /** Every direction of the project, enabled or not; rotation steps are kept for these only. */
  directionIds: string[]
  selected: RecommendationIntent[]
  nextCursor: number
  schedule: DiscoverySchedule
  steps: Record<string, number>
  /** The pooled candidates the feed would still deliver as new cards. */
  pool: DiscoveryPaper[]
  /** The candidates this run offered to the feed. */
  offered: DiscoveryPaper[]
  favouredAt: number | null
  /** Whether a run served the project from its pool and delivered nothing, and no run delivered since. */
  poolStalled: boolean
  results: IntentResult[]
  successfulRequests: Record<string, { fingerprint: string; fetchedAt: number }>
  failed: number
}

/** The fingerprint a direction's cooldown is kept under: its anchor seed and the negatives. */
const cooldownFingerprint = (intent: RecommendationIntent, negative: string[]): string => (
  recommendationFingerprint(recommendationQuery(intent, 0).intent, negative)
)

/**
 * The rotation step of a direction with no stored step: one past each source, in QUERY_SOURCES order,
 * that `schedule` records as already run with the direction's anchor seed and `negative`.
 */
const firstStep = (intent: RecommendationIntent, negative: string[], schedule: DiscoverySchedule): number => {
  let step = 0
  for (; step < QUERY_SOURCES.length; step += 1) {
    const query = recommendationQuery(intent, step)
    const held = schedule.requests[`${intent.id}@${query.source}`]
      ?? (query.source === 'similarity' ? schedule.requests[intent.id] : undefined)
    if (held?.fingerprint !== recommendationFingerprint(query.intent, negative, query.source)) break
  }
  return step
}

/**
 * The first rotation step from `step` on whose query `provider` does not already make at an earlier
 * step of the same cycle, the cycle being one pass of every seed through every source at one page.
 */
const distinctStep = (intent: RecommendationIntent, step: number, provider: RecommendationProvider): number => {
  const keyOf = (at: number): string | undefined => {
    const query = recommendationQuery(intent, at)
    return provider.queryKey?.(query.intent.seeds, query.source, query.page)
  }
  const cycle = intent.seeds.length * QUERY_SOURCES.length
  for (let at = step; ; at += 1) {
    const key = keyOf(at)
    let repeated = false
    for (let earlier = at - (at % cycle); key !== undefined && earlier < at && !repeated; earlier += 1) {
      repeated = keyOf(earlier) === key
    }
    if (!repeated) return at
  }
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
    | 'setDiscoverySchedule' | 'refreshProgress' | 'setRefreshProgress' | 'addDiscoveryEntries'
    | 'undelivered' | 'deliverySettings' | 'scanDiscoveryDirections'>
  provider: RecommendationProvider
  onWrite: () => void
  now: () => number
}): RecommendationService {
  return {
    async discover(projectId, force = false) {
      const now = deps.now()
      const cap = deps.store.deliverySettings().maxItemsPerRun
      const scoped = deps.store.listDiscoveryProfiles()
        .filter((profile) => projectId === undefined || profile.id === projectId)
      // A scan only offers candidates, so the confirmed directions every plan below reads stay as they were.
      const directions = scoped.filter((profile) => profile.seedCount + profile.positiveCount > 0)
        .flatMap((profile) => deps.store.scanDiscoveryDirections(profile.id).map((found) => ({ projectId: profile.id, ...found })))
      const profiles = scoped
        .filter((profile) => profile.seedCount + profile.positiveCount > 0 || profile.intentCount > 0)
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
        const directions = deps.store.discoveryIntents(profile.id)
        const progress = deps.store.refreshProgress({ kind: 'project', id: profile.id })
        return {
          id: profile.id, profile: context, negative,
          excluded: new Set([
            ...negative, ...context.positive.map((seed) => seed.paperId),
          ]),
          intents: directions.filter((intent) => intent.enabled),
          directionIds: directions.map((intent) => intent.id),
          selected: [], nextCursor: schedule.cursor, schedule,
          steps: progress.steps, pool: deps.store.undelivered(progress.candidates), offered: [],
          favouredAt: progress.favouredAt, poolStalled: progress.poolStalled,
          results: [], successfulRequests: {}, failed: 0,
        }
      })

      // A project whose pool covers a whole run is served from it without provider calls, unless forced
      // or a run served that way delivered nothing and no run has delivered since.
      const fetching = plans.filter((plan) => force || plan.pool.length < cap || plan.poolStalled)
      // Give every project one turn before assigning a second or third. This uses spare budget
      // without letting an early project's secondary directions crowd out another project's core.
      const allocations = new Map<ProjectPlan, number>()
      let remaining = budget
      for (let slot = 0; slot < MAX_PROJECT_CALLS && remaining > 0; slot += 1) {
        for (const plan of fetching) {
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
      let cachedIntents = 0
      let successfulIntents = 0
      for (const { plan, intent } of tasks) {
        const fingerprint = cooldownFingerprint(intent, plan.negative)
        const cached = plan.schedule.requests[intent.id]
        if (!force && cached?.fingerprint === fingerprint
          && now - cached.fetchedAt < DISCOVERY_COOLDOWN_MS) {
          cachedIntents += 1
          continue
        }
        const step = distinctStep(
          intent, plan.steps[intent.id] ?? firstStep(intent, plan.negative, plan.schedule), deps.provider,
        )
        const query = recommendationQuery(intent, step)
        try {
          const found = await deps.provider.recommend(query.intent.seeds, plan.negative, query.source, query.page)
          const papers = applyRecommendationSignals(plan.profile, query.intent, found.filter((paper) => (
            !plan.excluded.has(paper.semanticId) && !plan.excluded.has(`ARXIV:${paper.id}`)
          )))
          plan.results.push({ intent: query.intent, papers })
          plan.successfulRequests[intent.id] = { fingerprint, fetchedAt: now }
          plan.steps[intent.id] = step + 1
          successfulIntents += 1
        } catch {
          plan.failed += 1
        }
      }
      const fetched = new Set(plans.filter((plan) => Object.keys(plan.successfulRequests).length > 0))
      try {
        const shares = await shareCap(plans.map((plan) => ({
          favouredAt: plan.favouredAt,
          candidates: async () => poolFirst(plan.pool, mergeIntentResults(plan.results, POOL_LIMIT)),
          deliver: (batch: DiscoveryPaper[]) => {
            plan.offered.push(...batch)
            return deps.store.addDiscoveryEntries(plan.id, batch, batch.length)
          },
        })), cap)
        let wrote = false
        let lastFetchedAt: number | null = null
        for (const [at, plan] of plans.entries()) {
          const { delivered, rest, favoured } = shares[at]!
          const pool = [...deps.store.undelivered(plan.offered), ...rest].slice(0, POOL_LIMIT)
          const refreshed = fetched.has(plan) || delivered > 0
          const poolStalled = delivered === 0 && (plan.poolStalled || !fetching.includes(plan))
          const fetchedAt = plan.failed === 0 && refreshed ? now : plan.schedule.lastFetchedAt
          // A project whose selected directions were all cooling still moves its cursor on to the next ones.
          if (refreshed || (plan.failed === 0 && plan.nextCursor !== plan.schedule.cursor)) {
            deps.store.setDiscoverySchedule(plan.id, {
              lastFetchedAt: fetchedAt,
              cursor: plan.failed === 0 ? plan.nextCursor : plan.schedule.cursor,
              requests: { ...plan.schedule.requests, ...plan.successfulRequests },
            })
            wrote = true
          }
          if (refreshed || pool.length !== plan.pool.length || poolStalled !== plan.poolStalled) {
            deps.store.setRefreshProgress({ kind: 'project', id: plan.id }, {
              steps: Object.fromEntries(plan.directionIds.flatMap((id) => (
                plan.steps[id] === undefined ? [] : [[id, plan.steps[id]]]
              ))),
              candidates: pool,
              favouredAt: favoured ? now : plan.favouredAt,
              newest: [],
              poolStalled,
            })
            wrote = true
          }
          added += delivered
          if (fetchedAt !== null) lastFetchedAt = Math.max(lastFetchedAt ?? fetchedAt, fetchedAt)
        }
        if (wrote || directions.length > 0) deps.onWrite()
        const deferredProjects = fetching.filter((plan) => (
          plan.intents.length > 0 && plan.selected.length === 0
        )).length
        const failedIntents = plans.reduce((total, plan) => total + plan.failed, 0)
        return {
          projects: plans.filter((plan, at) => fetched.has(plan) || shares[at]!.delivered > 0).length,
          intents: successfulIntents,
          added,
          deferredProjects,
          cachedIntents,
          failedIntents,
          nothingNew: plans.length > 0 && added === 0 && deferredProjects === 0 && failedIntents === 0,
          lastFetchedAt,
          directions,
        }
      } catch (error) {
        throw new Error(`没能保存论文发现：${error instanceof Error ? error.message : String(error)}`, { cause: error })
      }
    },
  }
}
