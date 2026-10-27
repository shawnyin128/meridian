import { DEFAULT_DELIVERY_SETTINGS, type DiscoveryFetchResult } from '../../shared/contract.js'
import type { VaultStore } from '../vault.js'
import { shortTitleOf } from './directions.js'
import { trainingExamples, type ExampleStore } from './examples.js'
import { discoveryReasons, mergeIntentResults, type IntentResult } from './merge.js'
import { POOL_LIMIT, poolFirst, shareCap } from './pool.js'
import {
  QUERY_SOURCES, recommendationFingerprint, recommendationQuery, selectRecommendationIntents,
} from './profile.js'
import { batchIdOf, type GroupScore, type RunScores, type ScoredText, type Scorer, type ScoreGroup } from './scorer.js'
import { SCORE_THRESHOLD, selectShown } from './selection.js'
import { matchingWikiTerms } from './signals.js'
import type {
  DiscoveryPaper, DiscoverySchedule, KnownPaper, RecommendationIntent, RecommendationProfile, RecommendationProvider,
  ScopeRanking,
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

/** The Semantic Scholar batch id of a found paper. */
const batchId = (paper: DiscoveryPaper): string => batchIdOf(paper.semanticId, paper.id)

/** The key of a direction's scope model. */
const directionKey = (projectId: string, directionId: string): string => `direction:${projectId}:${directionId}`

/**
 * The papers of every scope outside a run, by owner, for the scorer's background: the seeds of each
 * confirmed direction and the cards of every active project, and the cards of every watch, whose group
 * id `inRun` does not hold; each paper's text is handed to `text`.
 */
export function scoringBackground(
  store: Pick<VaultStore, 'listDiscoveryProfiles' | 'discoveryIntents' | 'scopeCards' | 'listWatches'>,
  inRun: ReadonlySet<string>, text: (paperId: string, title: string, abstract: string) => void,
): { paperId: string; owner: string }[] {
  const cardsOf = (kind: 'project' | 'watch', id: string) => store.scopeCards({ kind, id }).map((card) => {
    text(card.paperId, card.title, card.abstract)
    return { paperId: card.paperId, owner: `${kind}:${id}` }
  })
  return [
    ...store.listDiscoveryProfiles().filter((profile) => !inRun.has(`project:${profile.id}`)).flatMap((profile) => [
      ...store.discoveryIntents(profile.id).flatMap((intent) => intent.seeds.map((seed) => {
        text(seed.paperId, seed.title, seed.abstract)
        return { paperId: seed.paperId, owner: directionKey(profile.id, intent.id) }
      })),
      ...cardsOf('project', profile.id),
    ]),
    ...store.listWatches().filter((watch) => !inRun.has(`watch:${watch.id}`)).flatMap((watch) => cardsOf('watch', watch.id)),
  ]
}

/** Collects paper texts by batch id, a text with an abstract winning over one without. */
export function textCollector(): { papers: Map<string, ScoredText>; text: (paperId: string, title: string, abstract: string) => void } {
  const papers = new Map<string, ScoredText>()
  return {
    papers,
    text(paperId, title, abstract) {
      if (!papers.has(paperId) || papers.get(paperId)!.abstract === '') papers.set(paperId, { paperId, title, abstract })
    },
  }
}

/**
 * How a project's discovery ranks under `scores`: each paper by the direction it scored best under,
 * with that direction, the nearest positive example and a Wiki term of the direction the paper
 * contains as its reasons; shown by `selectShown` over the project's enabled directions.
 */
function projectRanking(
  plan: { id: string; intents: RecommendationIntent[] }, scores: RunScores, papers: ReadonlyMap<string, ScoredText>,
  known: ReadonlyMap<string, KnownPaper>, shown: number,
): ScopeRanking {
  const group = `project:${plan.id}`
  const intentOf = new Map(plan.intents.map((intent) => [directionKey(plan.id, intent.id), intent]))
  const reasonsOf = (paperId: string, score: GroupScore) => {
    const intent = intentOf.get(score.scope)!
    const seeds = new Map(intent.seeds.map((seed) => [seed.paperId, seed]))
    const near = scores.nearest(score.scope, paperId).flatMap((exampleId) => {
      const seed = seeds.get(exampleId)
      const held = known.get(exampleId)
      if (seed !== undefined) return [{ paperId: exampleId, title: held?.shortTitle ?? shortTitleOf(seed.title) }]
      return held?.taken === undefined ? [] : [{ paperId: exampleId, title: held.shortTitle, taken: held.taken }]
    })[0]
    const text = papers.get(paperId)
    const wikiTerm = text === undefined ? undefined
      : matchingWikiTerms(text, [...new Set(intent.seeds.flatMap((seed) => seed.wikiTerms ?? []))])[0]
    return discoveryReasons({ direction: intent.label, near, wikiTerm })
  }
  return {
    scoreOf(paperId) {
      const score = scores.scoreOf(group, paperId)
      return score === undefined ? undefined : { relevance: score.score, path: score.path, reasons: reasonsOf(paperId, score) }
    },
    shown: (candidates) => new Set(selectShown(candidates.map(({ paperId, relevance }) => {
      const score = scores.scoreOf(group, paperId)
      return score === undefined ? { paperId, score: relevance } : { paperId, score: score.score, direction: intentOf.get(score.scope)!.id }
    }), plan.intents.map((intent) => ({ id: intent.id, core: intent.core })), shown, scores.similarity)),
  }
}

/**
 * Project discovery orchestration. The service owns profile selection, seed/feedback projection,
 * provider calls and durable publication; UI and Background only call this boundary.
 */
export function createRecommendationService(deps: {
  store: Pick<VaultStore,
    'listDiscoveryProfiles' | 'discoveryIntents' | 'discoveryProfile' | 'discoverySchedule'
    | 'setDiscoverySchedule' | 'refreshProgress' | 'setRefreshProgress' | 'addDiscoveryEntries'
    | 'undelivered' | 'deliverySettings' | 'scanDiscoveryDirections' | 'scopeCards' | 'knownPapers' | 'listWatches'>
    & ExampleStore
  provider: RecommendationProvider
  scorer: Scorer
  onWrite: () => void
  now: () => number
}): RecommendationService {
  return {
    async discover(projectId, force = false) {
      const now = deps.now()
      const settings = deps.store.deliverySettings()
      const cap = settings.maxItemsPerRun
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
          const papers = found.filter((paper) => (
            !plan.excluded.has(paper.semanticId) && !plan.excluded.has(`ARXIV:${paper.id}`)
          ))
          plan.results.push({ intent: query.intent, papers })
          plan.successfulRequests[intent.id] = { fingerprint, fetchedAt: now }
          plan.steps[intent.id] = step + 1
          successfulIntents += 1
        } catch {
          plan.failed += 1
        }
      }
      const fetched = new Set(plans.filter((plan) => Object.keys(plan.successfulRequests).length > 0))
      const candidates = plans.map((plan) => poolFirst(plan.pool, mergeIntentResults(plan.results, POOL_LIMIT)))
      const { papers, text } = textCollector()
      const cards = plans.map((plan) => deps.store.scopeCards({ kind: 'project', id: plan.id }))
      const groups: ScoreGroup[] = plans.map((plan, at) => {
        for (const paper of candidates[at]!) text(batchId(paper), paper.title, paper.abstract)
        for (const card of cards[at]!) text(card.paperId, card.title, card.abstract)
        return {
          id: `project:${plan.id}`,
          items: [...new Set([...candidates[at]!.map(batchId), ...cards[at]!.map((card) => card.paperId)])],
          scopes: plan.intents.map((intent) => {
            for (const seed of intent.seeds) text(seed.paperId, seed.title, seed.abstract)
            return {
              key: directionKey(plan.id, intent.id),
              examples: trainingExamples({ kind: 'direction', projectId: plan.id, directionId: intent.id }, deps.store),
              prior: intent.seeds.map((seed) => seed.paperId),
              retrieved: candidates[at]!.filter((paper) => paper.matches?.some((match) => match.intentId === intent.id)).map(batchId),
            }
          }),
        }
      })
      const background = scoringBackground(deps.store, new Set(groups.map((group) => group.id)), text)
      const known = deps.store.knownPapers(groups.flatMap((group) => group.scopes.flatMap((scope) => [
        ...scope.prior, ...scope.examples.map((example) => example.paperId),
      ])))
      for (const [paperId, paper] of known) text(paperId, paper.title, paper.abstract)
      const scores = await deps.scorer.score({ groups, papers, background })
      const shown = settings.maxShownPerScope ?? DEFAULT_DELIVERY_SETTINGS.maxShownPerScope
      const rankings = plans.map((plan) => projectRanking(plan, scores, papers, known, shown))
      const scoreOf = (plan: ProjectPlan, paper: DiscoveryPaper): number => (
        scores.scoreOf(`project:${plan.id}`, batchId(paper))?.score ?? Number.NEGATIVE_INFINITY
      )
      try {
        const shares = await shareCap(plans.map((plan, at) => ({
          favouredAt: plan.favouredAt,
          candidates: async () => candidates[at]!.map((paper, order) => ({ paper, order, score: scoreOf(plan, paper) }))
            .sort((left, right) => right.score - left.score || left.order - right.order).map(({ paper }) => paper),
          deliver: (batch: DiscoveryPaper[]) => {
            plan.offered.push(...batch)
            return deps.store.addDiscoveryEntries(plan.id, batch, batch.length, rankings[at]!)
          },
        })), cap)
        let wrote = false
        // A project offered nothing new still ranks its cards again: they are rescored and cut the same way.
        for (const [at, plan] of plans.entries()) {
          if (plan.offered.length > 0 || cards[at]!.length === 0) continue
          deps.store.addDiscoveryEntries(plan.id, [], 0, rankings[at]!)
          wrote = true
        }
        let lastFetchedAt: number | null = null
        for (const [at, plan] of plans.entries()) {
          const { delivered, rest, favoured } = shares[at]!
          const pool = deps.store.undelivered([...plan.offered, ...rest])
            .filter((paper) => scoreOf(plan, paper) >= SCORE_THRESHOLD)
            .sort((left, right) => scoreOf(plan, right) - scoreOf(plan, left))
            .slice(0, POOL_LIMIT)
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
