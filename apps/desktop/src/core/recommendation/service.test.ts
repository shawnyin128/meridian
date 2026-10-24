import { describe, expect, it, vi } from 'vitest'
import { createFixtureStore } from '../fixture-store.js'
import { minimalPdf } from '../net/minimal-pdf.js'
import { ON_POLICY_DISTILLATION_SAMPLE, type DiscoverySamplePaper } from './fixtures/on-policy-distillation.js'
import { clusterRecommendationProfile, recommendationFingerprint } from './profile.js'
import { createArxivRecommendations } from './providers/arxiv.js'
import { createFallbackRecommendations } from './providers/fallback.js'
import { createRecommendationService, DISCOVERY_COOLDOWN_MS } from './service.js'
import type {
  DiscoveryPaper, DiscoverySchedule, RecommendationIntent, RecommendationProfile, RecommendationProvider,
  RecommendationSeed, RefreshProgress, RefreshScope,
} from './types.js'

/** Creates the project `name` in `store` with `seeds` imported as its papers, and returns its id. */
function seededProject(
  store: ReturnType<typeof createFixtureStore>, name: string, seeds: DiscoverySamplePaper[],
): string {
  store.createProject(name)
  const project = store.listProjects().find((item) => item.name === name)!
  for (const seed of seeds) {
    const imported = store.importPaper(`${seed.arxiv}.pdf`, minimalPdf({ lines: [seed.arxiv, seed.title] })).paper
    store.fillPaperMetadata(imported.id, {
      title: seed.title, authors: seed.authors, abstract: seed.abstract, identifier: `arXiv:${seed.arxiv}`,
    }, imported.title)
    store.addPaper(project.id, imported.id)
  }
  return project.id
}

/** Store methods for a fake store that keeps no refresh progress between runs. */
const noProgress = {
  refreshProgress: () => ({ steps: {}, candidates: [], favouredAt: null, newest: [], poolStalled: false }),
  setRefreshProgress: () => {},
}

/** The cooldown record an earlier fetch of `intent` leaves, keyed by its anchor seed and no negatives. */
const fetchedRecord = (intent: RecommendationIntent, fetchedAt: number) => ({
  fingerprint: recommendationFingerprint({ ...intent, seeds: intent.seeds.slice(0, 1) }, []), fetchedAt,
})

describe('project recommendation service', () => {
  it('用五篇 OPD/KD 论文建档后发布 provider 给出的 Osprey,并把正反馈并入下一轮', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    store.createProject('OPD 与 speculative drafter')
    const project = store.listProjects().find((item) => item.name === 'OPD 与 speculative drafter')!
    for (const seed of ON_POLICY_DISTILLATION_SAMPLE.seeds) {
      const imported = store.importPaper(
        `${seed.arxiv}.pdf`, minimalPdf({ lines: [seed.arxiv, seed.title] }),
      ).paper
      store.fillPaperMetadata(imported.id, {
        title: seed.title,
        authors: seed.authors,
        abstract: seed.abstract,
        identifier: `arXiv:${seed.arxiv}`,
      }, imported.title)
      store.addPaper(project.id, imported.id)
    }

    const recommend = vi.fn(async (positive: RecommendationSeed[]) => (
      positive.some((seed) => seed.paperId === 'ARXIV:2605.29343') ? [ON_POLICY_DISTILLATION_SAMPLE.expected] : []
    ))
    const onWrite = vi.fn()
    const service = createRecommendationService({ store, provider: { recommend }, onWrite, now: () => 1 })
    await expect(service.discover(project.id)).resolves.toEqual({
      projects: 1, intents: 2, added: 1, deferredProjects: 0,
      cachedIntents: 0, failedIntents: 0, nothingNew: false, lastFetchedAt: 1,
    })
    expect(recommend).toHaveBeenCalledTimes(2)
    // project.papers is newest-first, so a tie in cluster score goes to the most recently linked paper.
    expect(recommend.mock.calls.map(([positive]) => positive.map((seed) => seed.paperId))).toEqual([
      ['ARXIV:2605.29343'],
      ['ARXIV:2505.04560'],
    ])
    const found = store.listInbox({ kind: 'discovery', project: project.id })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      title: ON_POLICY_DISTILLATION_SAMPLE.expected.title,
      pdf: ON_POLICY_DISTILLATION_SAMPLE.expected.pdf,
      reasons: [
        { kind: 'project', label: '来自项目「OPD 与 speculative drafter」' },
        { kind: 'intent', label: expect.stringContaining('distillation') },
        { kind: 'seed', label: '基于 1 篇相关论文' },
      ],
    })
    expect(onWrite).toHaveBeenCalledOnce()

    store.feedbackDiscovery(found[0]!.id, 'more')
    expect(store.discoverySeeds(project.id).positive).toContain('ARXIV:2609.09338')
  })

  it('没有论文种子的项目不请求 provider', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    store.createProject('空项目')
    const project = store.listProjects().find((item) => item.name === '空项目')!
    const recommend = vi.fn(async () => [])
    const service = createRecommendationService({
      store, provider: { recommend }, onWrite: vi.fn(), now: () => 1,
    })
    await expect(service.discover(project.id)).resolves.toEqual({
      projects: 0, intents: 0, added: 0, deferredProjects: 0,
      cachedIntents: 0, failedIntents: 0, nothingNew: false, lastFetchedAt: null,
    })
    expect(recommend).not.toHaveBeenCalled()
  })

  it('项目发现发布的总量不超过公共单次推送上限', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    store.createProject('限量发现')
    const project = store.listProjects().find((item) => item.name === '限量发现')!
    const seed = ON_POLICY_DISTILLATION_SAMPLE.seeds[0]!
    const imported = store.importPaper(
      `${seed.arxiv}.pdf`, minimalPdf({ lines: [seed.arxiv, seed.title] }),
    ).paper
    store.fillPaperMetadata(imported.id, {
      title: seed.title, authors: seed.authors, abstract: seed.abstract,
      identifier: `arXiv:${seed.arxiv}`,
    }, imported.title)
    store.addPaper(project.id, imported.id)
    store.setDeliverySettings({ maxItemsPerRun: 1 })
    const papers = [0, 1, 2].map((at) => ({
      ...ON_POLICY_DISTILLATION_SAMPLE.expected,
      semanticId: `limited-${at}`, id: `2609.9999${at}`, title: `Limited candidate ${at}`,
    }))
    const service = createRecommendationService({
      store, provider: { recommend: async () => papers }, onWrite: vi.fn(), now: () => 1,
    })

    await expect(service.discover(project.id)).resolves.toMatchObject({ added: 1 })
    expect(store.listInbox({ kind: 'discovery', project: project.id })).toHaveLength(1)
  })

  it('provider 即使回传显式负反馈论文也不会重新发布', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    store.createProject('反馈项目')
    const project = store.listProjects().find((item) => item.name === '反馈项目')!
    const seed = ON_POLICY_DISTILLATION_SAMPLE.seeds[0]!
    const imported = store.importPaper(
      `${seed.arxiv}.pdf`, minimalPdf({ lines: [seed.arxiv, seed.title] }),
    ).paper
    store.fillPaperMetadata(imported.id, {
      title: seed.title, authors: seed.authors, abstract: seed.abstract,
      identifier: `arXiv:${seed.arxiv}`,
    }, imported.title)
    store.addPaper(project.id, imported.id)
    store.addDiscoveryEntries(project.id, [ON_POLICY_DISTILLATION_SAMPLE.expected])
    const rejected = store.listInbox({ kind: 'discovery', project: project.id })[0]!
    store.feedbackDiscovery(rejected.id, 'less')

    const next = {
      ...ON_POLICY_DISTILLATION_SAMPLE.expected,
      semanticId: 'new-paper', id: '2609.99999', title: 'A genuinely new candidate',
    }
    const recommend = vi.fn(async (positive: RecommendationSeed[], negative: string[]) => {
      expect(positive.map((seed) => seed.paperId)).toEqual(['ARXIV:2605.29343'])
      expect(negative).toEqual([ON_POLICY_DISTILLATION_SAMPLE.expected.semanticId])
      return [ON_POLICY_DISTILLATION_SAMPLE.expected, next]
    })
    const service = createRecommendationService({
      store, provider: { recommend }, onWrite: vi.fn(), now: () => 1,
    })
    await expect(service.discover(project.id)).resolves.toEqual({
      projects: 1, intents: 1, added: 1, deferredProjects: 0,
      cachedIntents: 0, failedIntents: 0, nothingNew: false, lastFetchedAt: 1,
    })
    expect(recommend.mock.calls[0]?.[1]).toEqual([ON_POLICY_DISTILLATION_SAMPLE.expected.semanticId])
    expect(store.listInbox({ kind: 'discovery', project: project.id }).map((paper) => paper.title))
      .toEqual(['A genuinely new candidate'])
  })

  it('相同方向在冷却期内不重复请求,过期或强制刷新才重新请求', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    store.createProject('冷却项目')
    const project = store.listProjects().find((item) => item.name === '冷却项目')!
    const seed = ON_POLICY_DISTILLATION_SAMPLE.seeds[0]!
    const imported = store.importPaper(
      `${seed.arxiv}.pdf`, minimalPdf({ lines: [seed.arxiv, seed.title] }),
    ).paper
    store.fillPaperMetadata(imported.id, {
      title: seed.title, authors: seed.authors, abstract: seed.abstract,
      identifier: `arXiv:${seed.arxiv}`,
    }, imported.title)
    store.addPaper(project.id, imported.id)
    let now = 1_000
    const recommend = vi.fn(async () => [])
    const service = createRecommendationService({
      store, provider: { recommend }, onWrite: vi.fn(), now: () => now,
    })

    await expect(service.discover(project.id)).resolves.toMatchObject({
      intents: 1, cachedIntents: 0, failedIntents: 0,
    })
    await expect(service.discover(project.id)).resolves.toMatchObject({
      intents: 0, cachedIntents: 1, failedIntents: 0,
    })
    expect(recommend).toHaveBeenCalledTimes(1)

    await service.discover(project.id, true)
    expect(recommend).toHaveBeenCalledTimes(2)
    now += DISCOVERY_COOLDOWN_MS + 1
    await service.discover(project.id)
    expect(recommend).toHaveBeenCalledTimes(3)
  })

  it('一个方向失败时发布其余结果,保留游标并在下轮只重试失败方向', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    store.createProject('部分失败项目')
    const project = store.listProjects().find((item) => item.name === '部分失败项目')!
    for (const seed of ON_POLICY_DISTILLATION_SAMPLE.seeds) {
      const imported = store.importPaper(
        `${seed.arxiv}.pdf`, minimalPdf({ lines: [seed.arxiv, seed.title] }),
      ).paper
      store.fillPaperMetadata(imported.id, {
        title: seed.title, authors: seed.authors, abstract: seed.abstract,
        identifier: `arXiv:${seed.arxiv}`,
      }, imported.title)
      store.addPaper(project.id, imported.id)
    }
    let round = 1
    let call = 0
    const recommend = vi.fn(async () => {
      call += 1
      if (round === 1 && call === 2) throw new Error('temporary 429')
      return call === 1 ? [ON_POLICY_DISTILLATION_SAMPLE.expected] : []
    })
    const service = createRecommendationService({
      store, provider: { recommend }, onWrite: vi.fn(), now: () => round,
    })

    await expect(service.discover(project.id)).resolves.toEqual({
      projects: 1, intents: 1, added: 1, deferredProjects: 0,
      cachedIntents: 0, failedIntents: 1, nothingNew: false, lastFetchedAt: null,
    })
    expect(store.discoverySchedule(project.id).lastFetchedAt).toBeNull()
    expect(store.discoverySchedule(project.id).cursor).toBe(0)

    round = 2
    call = 0
    await expect(service.discover(project.id)).resolves.toEqual({
      projects: 1, intents: 1, added: 0, deferredProjects: 0,
      cachedIntents: 1, failedIntents: 0, nothingNew: true, lastFetchedAt: 2,
    })
    expect(recommend).toHaveBeenCalledTimes(3)
    expect(store.discoverySchedule(project.id).lastFetchedAt).toBe(2)
  })

  it('所有方向都失败也返回可恢复结果,不把刷新变成整页错误', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    store.createProject('全失败项目')
    const project = store.listProjects().find((item) => item.name === '全失败项目')!
    const seed = ON_POLICY_DISTILLATION_SAMPLE.seeds[0]!
    const imported = store.importPaper(
      `${seed.arxiv}.pdf`, minimalPdf({ lines: [seed.arxiv, seed.title] }),
    ).paper
    store.fillPaperMetadata(imported.id, {
      title: seed.title, authors: seed.authors, abstract: seed.abstract,
      identifier: `arXiv:${seed.arxiv}`,
    }, imported.title)
    store.addPaper(project.id, imported.id)
    const service = createRecommendationService({
      store,
      provider: { recommend: async () => { throw new Error('temporary outage') } },
      onWrite: vi.fn(),
      now: () => 10,
    })

    await expect(service.discover(project.id)).resolves.toEqual({
      projects: 0, intents: 0, added: 0, deferredProjects: 0,
      cachedIntents: 0, failedIntents: 1, nothingNew: false, lastFetchedAt: null,
    })
    expect(store.discoverySchedule(project.id)).toEqual({
      lastFetchedAt: null, cursor: 0, requests: {},
    })
  })

  it('项目超过单轮预算时优先覆盖从未刷新项目,下一轮不会饿死尾部项目', async () => {
    const schedules = new Map<string, DiscoverySchedule>()
    const profiles = Array.from({ length: 15 }, (_, at) => ({
      id: `project-${at}`, name: `项目 ${at}`, seedCount: 1,
      positiveCount: 0, negativeCount: 0, intentCount: 1,
      lastFetchedAt: null as number | null,
      intents: [],
    }))
    const profileFor = (projectId: string): RecommendationProfile => ({
      projectId,
      projectName: profiles.find((profile) => profile.id === projectId)!.name,
      anchorText: `${projectId} focused method`,
      positive: [{
        paperId: `seed-${projectId}`, title: `${projectId} focused method`,
        abstract: '', source: 'project',
      }],
      negative: [],
    })
    const store = {
      deliverySettings: () => ({ maxItemsPerRun: 20 }),
      listDiscoveryProfiles: () => profiles.map((profile) => ({
        ...profile,
        lastFetchedAt: schedules.get(profile.id)?.lastFetchedAt ?? null,
      })),
      discoveryProfile: profileFor,
      discoveryIntents: (projectId: string) => clusterRecommendationProfile(profileFor(projectId)),
      discoverySchedule: (projectId: string) => (
        schedules.get(projectId) ?? { lastFetchedAt: null, cursor: 0, requests: {} }
      ),
      setDiscoverySchedule: (projectId: string, schedule: DiscoverySchedule) => {
        schedules.set(projectId, schedule)
      },
      ...noProgress,
      addDiscoveryEntries: () => 0,
      undelivered: <P>(found: P[]) => found,
    }
    const requested: string[] = []
    const recommend = vi.fn(async (positive: RecommendationSeed[]) => {
      requested.push(positive[0]!.paperId)
      return []
    })
    let now = 1
    const service = createRecommendationService({
      store, provider: { recommend }, onWrite: vi.fn(), now: () => now,
    })

    await expect(service.discover()).resolves.toEqual({
      projects: 12, intents: 12, added: 0, deferredProjects: 3,
      cachedIntents: 0, failedIntents: 0, nothingNew: false, lastFetchedAt: 1,
    })
    expect(requested).toEqual(Array.from({ length: 12 }, (_, at) => `seed-project-${at}`))

    requested.length = 0
    now = 2
    await service.discover()
    expect(requested.slice(0, 3)).toEqual([
      'seed-project-12', 'seed-project-13', 'seed-project-14',
    ])
  })

  it('有剩余预算时按轮次分给次要方向,不会让前面项目挤掉后面项目的核心', async () => {
    const profiles = Array.from({ length: 5 }, (_, at) => ({
      id: `p${at}`, name: `项目 ${at}`, seedCount: 3,
      positiveCount: 0, negativeCount: 0, intentCount: 3, lastFetchedAt: null,
      intents: [],
    }))
    const schedules = new Map<string, DiscoverySchedule>()
    const requested: string[] = []
    const service = createRecommendationService({
      store: {
        deliverySettings: () => ({ maxItemsPerRun: 20 }),
        listDiscoveryProfiles: () => profiles,
        discoveryProfile: (projectId) => ({
          projectId, projectName: projectId, anchorText: `coreanchor${projectId}`,
          positive: [
            { paperId: `${projectId}-core`, title: `coreanchor${projectId}`, abstract: '', source: 'project' },
            { paperId: `${projectId}-secondary`, title: `secondary${projectId}`, abstract: '', source: 'project' },
            { paperId: `${projectId}-third`, title: `third${projectId}`, abstract: '', source: 'project' },
          ],
          negative: [],
        }),
        discoveryIntents: (projectId) => clusterRecommendationProfile({
          projectId, projectName: projectId, anchorText: `coreanchor${projectId}`,
          positive: [
            { paperId: `${projectId}-core`, title: `coreanchor${projectId}`, abstract: '', source: 'project' },
            { paperId: `${projectId}-secondary`, title: `secondary${projectId}`, abstract: '', source: 'project' },
            { paperId: `${projectId}-third`, title: `third${projectId}`, abstract: '', source: 'project' },
          ],
          negative: [],
        }),
        discoverySchedule: (projectId) => (
          schedules.get(projectId) ?? { lastFetchedAt: null, cursor: 0, requests: {} }
        ),
        setDiscoverySchedule: (projectId, schedule) => { schedules.set(projectId, schedule) },
        ...noProgress,
        addDiscoveryEntries: () => 0,
        undelivered: <P>(found: P[]) => found,
      },
      provider: {
        recommend: async (positive) => {
          requested.push(positive[0]!.paperId)
          return []
        },
      },
      onWrite: vi.fn(),
      now: () => 1,
    })

    await expect(service.discover()).resolves.toEqual({
      projects: 5, intents: 12, added: 0, deferredProjects: 0,
      cachedIntents: 0, failedIntents: 0, nothingNew: true, lastFetchedAt: 1,
    })
    expect(requested.slice(0, 5)).toEqual(profiles.map((profile) => `${profile.id}-core`))
    expect(profiles.map((profile) => (
      requested.filter((seed) => seed.startsWith(`${profile.id}-`)).length
    ))).toEqual([3, 3, 2, 2, 2])
  })

  it('核心方向在统一冷却期后轮换多种来源,连续点击不会突破请求预算', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    store.createProject('多来源项目')
    const project = store.listProjects().find((item) => item.name === '多来源项目')!
    const seed = ON_POLICY_DISTILLATION_SAMPLE.seeds[0]!
    const imported = store.importPaper(
      `${seed.arxiv}.pdf`, minimalPdf({ lines: [seed.arxiv, seed.title] }),
    ).paper
    store.fillPaperMetadata(imported.id, {
      title: seed.title, authors: seed.authors, abstract: seed.abstract,
      identifier: `arXiv:${seed.arxiv}`,
    }, imported.title)
    store.addPaper(project.id, imported.id)
    let now = 1
    const recommend = vi.fn<RecommendationProvider['recommend']>(async () => [])
    const service = createRecommendationService({
      store, provider: { recommend }, onWrite: vi.fn(), now: () => now,
    })

    await service.discover(project.id)
    await expect(service.discover(project.id)).resolves.toMatchObject({
      intents: 0, cachedIntents: 1,
    })
    now += DISCOVERY_COOLDOWN_MS + 1
    await service.discover(project.id)
    await service.discover(project.id, true)
    await service.discover(project.id, true)

    expect(recommend.mock.calls.map((call) => call[2])).toEqual([
      'similarity', 'citation', 'reference', 'author',
    ])
  })

  it('兼容阶段二只有方向缓存的状态,到期后从引用来源继续而不重跑相似召回', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    store.createProject('旧缓存项目')
    const project = store.listProjects().find((item) => item.name === '旧缓存项目')!
    const seed = ON_POLICY_DISTILLATION_SAMPLE.seeds[0]!
    const imported = store.importPaper(
      `${seed.arxiv}.pdf`, minimalPdf({ lines: [seed.arxiv, seed.title] }),
    ).paper
    store.fillPaperMetadata(imported.id, {
      title: seed.title, authors: seed.authors, abstract: seed.abstract,
      identifier: `arXiv:${seed.arxiv}`,
    }, imported.title)
    store.addPaper(project.id, imported.id)
    const intent = store.discoveryIntents(project.id)[0]!
    store.setDiscoverySchedule(project.id, {
      lastFetchedAt: 1, cursor: 0, requests: { [intent.id]: fetchedRecord(intent, 1) },
    })
    const recommend = vi.fn<RecommendationProvider['recommend']>(async () => [])
    const service = createRecommendationService({
      store, provider: { recommend }, onWrite: vi.fn(), now: () => DISCOVERY_COOLDOWN_MS + 2,
    })

    await service.discover(project.id)
    expect(recommend.mock.calls[0]?.[2]).toBe('citation')
  })

  it('每个方向在两次刷新之间换到下一个查询,第二次刷新送来第一次没有的论文', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    const project = seededProject(store, '轮换项目', ON_POLICY_DISTILLATION_SAMPLE.seeds)
    store.setDeliverySettings({ maxItemsPerRun: 20 })
    const runs: string[][] = []
    const answers = new Map<string, DiscoveryPaper>()
    // A provider answers the same query with the same paper, as Semantic Scholar does for an unchanged seed.
    const recommend = vi.fn<RecommendationProvider['recommend']>(async (positive, _negative, source, page) => {
      const query = `${positive.map((seed) => seed.paperId).join('+')} ${source ?? 'similarity'} ${page ?? 0}`
      runs.at(-1)!.push(query)
      if (!answers.has(query)) {
        answers.set(query, {
          ...ON_POLICY_DISTILLATION_SAMPLE.expected,
          semanticId: `rotated-${answers.size}`, id: `2609.${70_000 + answers.size}`, title: `Answer to ${query}`,
        })
      }
      return [answers.get(query)!]
    })
    let now = 1
    const service = createRecommendationService({ store, provider: { recommend }, onWrite: vi.fn(), now: () => now })

    runs.push([])
    await expect(service.discover(project)).resolves.toMatchObject({ intents: 2, added: 2 })
    now += DISCOVERY_COOLDOWN_MS + 1
    runs.push([])
    await expect(service.discover(project)).resolves.toMatchObject({ intents: 2, added: 2 })

    expect(runs[1]).toHaveLength(2)
    expect(runs[1]!.filter((query) => runs[0]!.includes(query))).toEqual([])
    expect(store.listInbox({ kind: 'discovery', project })).toHaveLength(4)
  })

  it('选中的方向都在冷却时游标照样前进,下一次刷新轮到还没冷却的方向', async () => {
    const titles = ['quantized attention kernels', 'speculative draft trees', 'cache eviction policies',
      'expert routing balance', 'sparse mask search']
    const profile: RecommendationProfile = {
      projectId: 'p', projectName: '五个方向', anchorText: titles[0]!,
      positive: titles.map((title, at) => ({ paperId: `seed-${at}`, title, abstract: '', source: 'project' })),
      negative: [],
    }
    const intents = clusterRecommendationProfile(profile)
    expect(intents).toHaveLength(5)
    const now = 10 * DISCOVERY_COOLDOWN_MS
    const recent = now - DISCOVERY_COOLDOWN_MS / 6
    let schedule: DiscoverySchedule = {
      lastFetchedAt: recent, cursor: 0,
      requests: Object.fromEntries(intents.slice(0, 3).map((intent) => [intent.id, fetchedRecord(intent, recent)])),
    }
    const requested: string[] = []
    const service = createRecommendationService({
      store: {
        deliverySettings: () => ({ maxItemsPerRun: 20 }),
        listDiscoveryProfiles: () => [{
          id: 'p', name: '五个方向', seedCount: 5, positiveCount: 0, negativeCount: 0, intentCount: 5,
          lastFetchedAt: schedule.lastFetchedAt, intents: [],
        }],
        discoveryProfile: () => profile,
        discoveryIntents: () => intents,
        discoverySchedule: () => schedule,
        setDiscoverySchedule: (_projectId, next) => { schedule = next },
        ...noProgress,
        addDiscoveryEntries: () => 0,
        undelivered: <P>(found: P[]) => found,
      },
      provider: {
        recommend: async (positive) => {
          requested.push(positive[0]!.paperId)
          return []
        },
      },
      onWrite: vi.fn(),
      now: () => now,
    })

    await expect(service.discover('p')).resolves.toMatchObject({ intents: 0, cachedIntents: 3, failedIntents: 0 })
    expect(requested).toEqual([])
    expect(schedule).toMatchObject({ lastFetchedAt: recent, cursor: 2 })

    await expect(service.discover('p')).resolves.toMatchObject({ intents: 2, cachedIntents: 1 })
    expect(requested).toEqual(intents.slice(3).map((intent) => intent.seeds[0]!.paperId))
  })

  it('这一轮推不完的候选留在候选池里下一轮先推,候选池够一轮时不再请求 provider', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    const project = seededProject(store, '候选池项目', ON_POLICY_DISTILLATION_SAMPLE.seeds.slice(0, 1))
    store.setDeliverySettings({ maxItemsPerRun: 1 })
    const candidate = (at: number): DiscoveryPaper => ({
      ...ON_POLICY_DISTILLATION_SAMPLE.expected,
      semanticId: `pooled-${at}`, id: `2609.${71_000 + at}`, title: `Pooled candidate ${at}`,
    })
    let answer = [candidate(1), candidate(2), candidate(3)]
    const recommend = vi.fn<RecommendationProvider['recommend']>(async () => answer)
    let now = 1
    const service = createRecommendationService({ store, provider: { recommend }, onWrite: vi.fn(), now: () => now })
    const titles = () => store.listInbox({ kind: 'discovery', project }).map((entry) => entry.title)

    await expect(service.discover(project)).resolves.toMatchObject({ added: 1 })
    expect(titles()).toEqual(['Pooled candidate 1'])

    now += DISCOVERY_COOLDOWN_MS + 1
    await expect(service.discover(project)).resolves.toMatchObject({ added: 1, intents: 0, cachedIntents: 0 })
    expect(recommend).toHaveBeenCalledTimes(1)
    expect(titles()).toEqual(['Pooled candidate 2', 'Pooled candidate 1'])

    answer = [candidate(4), candidate(3)]
    await expect(service.discover(project, true)).resolves.toMatchObject({ added: 1, intents: 1 })
    expect(titles()[0]).toBe('Pooled candidate 3')
    expect(store.refreshProgress({ kind: 'project', id: project }).candidates.map((paper) => paper.title))
      .toEqual(['Pooled candidate 4'])
  })

  it('落到项目显示上限以下的新候选不送,留在候选池里,卡片走了之后下一轮送出', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    const project = seededProject(store, '上限以下的候选', ON_POLICY_DISTILLATION_SAMPLE.seeds.slice(0, 1))
    store.setDeliverySettings({ maxItemsPerRun: 10, maxShownPerScope: 1 })
    const candidate = (at: number): DiscoveryPaper => ({
      ...ON_POLICY_DISTILLATION_SAMPLE.expected,
      semanticId: `held-${at}`, id: `2609.${72_000 + at}`, title: `Held candidate ${at}`,
    })
    let answer = [candidate(1), candidate(2)]
    const service = createRecommendationService({
      store, provider: { recommend: async () => answer }, onWrite: vi.fn(), now: () => 1,
    })
    const titles = () => store.listInbox({ kind: 'discovery', project }).map((entry) => entry.title)

    await expect(service.discover(project)).resolves.toMatchObject({ added: 1 })
    expect(titles()).toEqual(['Held candidate 1'])
    expect(store.refreshProgress({ kind: 'project', id: project }).candidates.map((paper) => paper.title))
      .toEqual(['Held candidate 2'])

    store.dismissInbox(store.listInbox({ kind: 'discovery', project })[0]!.id)
    answer = []
    await expect(service.discover(project, true)).resolves.toMatchObject({ added: 1 })
    expect(titles()).toEqual(['Held candidate 2'])
  })

  it('候选池里别处已经送过的候选拿掉,不算进够不够一轮,该请求 provider 时照常请求', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    const project = seededProject(store, '池里有送过的', ON_POLICY_DISTILLATION_SAMPLE.seeds.slice(0, 1))
    store.setDeliverySettings({ maxItemsPerRun: 1 })
    const candidate = (at: number): DiscoveryPaper => ({
      ...ON_POLICY_DISTILLATION_SAMPLE.expected,
      semanticId: `stale-${at}`, id: `2609.${73_000 + at}`, title: `Stale pool candidate ${at}`,
    })
    store.addInboxEntries('spec', [candidate(1)])
    store.setRefreshProgress({ kind: 'project', id: project }, {
      steps: {}, candidates: [candidate(1)], favouredAt: null, newest: [], poolStalled: false,
    })
    const recommend = vi.fn<RecommendationProvider['recommend']>(async () => [candidate(2)])
    const service = createRecommendationService({ store, provider: { recommend }, onWrite: vi.fn(), now: () => 1 })

    await expect(service.discover(project)).resolves.toMatchObject({ added: 1, intents: 1 })
    expect(recommend).toHaveBeenCalledTimes(1)
    expect(store.listInbox({ kind: 'discovery', project }).map((entry) => entry.title)).toEqual(['Stale pool candidate 2'])
    expect(store.refreshProgress({ kind: 'project', id: project }).candidates).toEqual([])
  })

  it('候选池够一轮时,只有上一次靠候选池的那轮送出过卡片才不请求 provider;池里的都排在显示的卡片之下、一张没送出,下一轮照常请求', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    const project = seededProject(store, '候选池送不出', ON_POLICY_DISTILLATION_SAMPLE.seeds.slice(0, 1))
    store.setDeliverySettings({ maxItemsPerRun: 1, maxShownPerScope: 2 })
    const candidate = (at: number): DiscoveryPaper => ({
      ...ON_POLICY_DISTILLATION_SAMPLE.expected,
      semanticId: `stalled-${at}`, id: `2609.${74_000 + at}`, title: `Stalled candidate ${at}`,
    })
    const seed = `ARXIV:${ON_POLICY_DISTILLATION_SAMPLE.seeds[0]!.arxiv}`
    const ours = (positive: RecommendationSeed[]) => positive.some((held) => held.paperId === seed)
    const recommend = vi.fn<RecommendationProvider['recommend']>(async (positive) => (
      ours(positive) ? [1, 2, 3, 4].map(candidate) : []
    ))
    const asked = () => recommend.mock.calls.filter(([positive]) => ours(positive)).length
    let now = 1
    const service = createRecommendationService({ store, provider: { recommend }, onWrite: vi.fn(), now: () => now })
    const titles = () => store.listInbox({ kind: 'discovery', project }).map((entry) => entry.title)

    await expect(service.discover(project)).resolves.toMatchObject({ added: 1, intents: 1 })
    now += DISCOVERY_COOLDOWN_MS + 1
    await expect(service.discover(project)).resolves.toMatchObject({ added: 1, intents: 0 })
    expect(asked()).toBe(1)
    expect(titles().sort()).toEqual(['Stalled candidate 1', 'Stalled candidate 2'])

    now += DISCOVERY_COOLDOWN_MS + 1
    await expect(service.discover(project)).resolves.toMatchObject({ added: 0, intents: 0 })
    expect(asked()).toBe(1)
    expect(store.refreshProgress({ kind: 'project', id: project }).candidates.map((paper) => paper.title))
      .toEqual(['Stalled candidate 3', 'Stalled candidate 4'])

    now += DISCOVERY_COOLDOWN_MS + 1
    await service.discover()
    expect(asked()).toBe(2)
  })

  it('候选池送不出卡片之后,哪一轮送出了卡片就清掉这个标记,后面候选池够一轮时又不请求 provider', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    const project = seededProject(store, '候选池又能用', ON_POLICY_DISTILLATION_SAMPLE.seeds.slice(0, 1))
    store.setDeliverySettings({ maxItemsPerRun: 1, maxShownPerScope: 2 })
    const candidate = (at: number): DiscoveryPaper => ({
      ...ON_POLICY_DISTILLATION_SAMPLE.expected,
      semanticId: `cleared-${at}`, id: `2609.${75_000 + at}`, title: `Cleared candidate ${at}`,
    })
    const recommend = vi.fn<RecommendationProvider['recommend']>(async () => [1, 2, 3, 4].map(candidate))
    let now = 1
    const service = createRecommendationService({ store, provider: { recommend }, onWrite: vi.fn(), now: () => now })
    const refresh = () => {
      now += DISCOVERY_COOLDOWN_MS + 1
      return service.discover(project)
    }

    await refresh()
    await refresh()
    await expect(refresh()).resolves.toMatchObject({ added: 0, intents: 0 })
    expect(recommend).toHaveBeenCalledTimes(1)
    // A run that fetches and delivers nothing keeps the project fetching.
    await expect(refresh()).resolves.toMatchObject({ added: 0, intents: 1 })
    await expect(refresh()).resolves.toMatchObject({ added: 0, intents: 1 })
    expect(recommend).toHaveBeenCalledTimes(3)

    const first = store.listInbox({ kind: 'discovery', project }).find((entry) => entry.title === 'Cleared candidate 1')!
    store.dismissInbox(first.id)
    await expect(refresh()).resolves.toMatchObject({ added: 1, intents: 1 })
    expect(recommend).toHaveBeenCalledTimes(4)

    await expect(refresh()).resolves.toMatchObject({ intents: 0 })
    expect(recommend).toHaveBeenCalledTimes(4)
  })

  it('全局刷新把单次上限平分给各项目,除不尽的那篇轮流给,而不是总给列在前面的项目', async () => {
    const ids = ['early', 'late']
    const profileFor = (projectId: string): RecommendationProfile => ({
      projectId, projectName: projectId, anchorText: `${projectId} retrieval`,
      positive: [{ paperId: `seed-${projectId}`, title: `${projectId} retrieval`, abstract: '', source: 'project' }],
      negative: [],
    })
    const schedules = new Map<string, DiscoverySchedule>()
    const progress = new Map<string, RefreshProgress>()
    const delivered = new Map(ids.map((id) => [id, [] as string[]]))
    const store = {
      deliverySettings: () => ({ maxItemsPerRun: 3 }),
      listDiscoveryProfiles: () => ids.map((id) => ({
        id, name: id, seedCount: 1, positiveCount: 0, negativeCount: 0, intentCount: 1,
        lastFetchedAt: schedules.get(id)?.lastFetchedAt ?? null, intents: [],
      })),
      discoveryProfile: profileFor,
      discoveryIntents: (projectId: string) => clusterRecommendationProfile(profileFor(projectId)),
      discoverySchedule: (projectId: string) => (
        schedules.get(projectId) ?? { lastFetchedAt: null, cursor: 0, requests: {} }
      ),
      setDiscoverySchedule: (projectId: string, schedule: DiscoverySchedule) => { schedules.set(projectId, schedule) },
      refreshProgress: ({ id }: RefreshScope) => structuredClone(
        progress.get(id) ?? { steps: {}, candidates: [], favouredAt: null, newest: [], poolStalled: false },
      ),
      setRefreshProgress: ({ id }: RefreshScope, next: RefreshProgress) => { progress.set(id, structuredClone(next)) },
      addDiscoveryEntries: (projectId: string, found: DiscoveryPaper[], limit?: number) => {
        const held = delivered.get(projectId)!
        const fresh = found.filter((paper) => !held.includes(paper.id)).slice(0, limit)
        held.push(...fresh.map((paper) => paper.id))
        return fresh.length
      },
      undelivered: <P extends { id: string }>(found: P[]) => (
        found.filter((paper) => ![...delivered.values()].some((held) => held.includes(paper.id)))
      ),
    }
    const recommend = vi.fn<RecommendationProvider['recommend']>(async (positive) => (
      [1, 2, 3, 4].map((at) => ({
        ...ON_POLICY_DISTILLATION_SAMPLE.expected,
        semanticId: `${positive[0]!.paperId}-${at}`, id: `${positive[0]!.paperId}-${at}`,
      }))
    ))
    let now = 1
    const service = createRecommendationService({ store, provider: { recommend }, onWrite: vi.fn(), now: () => now })
    const counts = () => ids.map((id) => delivered.get(id)!.length)

    await expect(service.discover()).resolves.toMatchObject({ added: 3 })
    expect(counts()).toEqual([2, 1])
    now += DISCOVERY_COOLDOWN_MS + 1
    await expect(service.discover()).resolves.toMatchObject({ added: 3 })
    expect(counts()).toEqual([3, 3])
  })

  it('真的没有新论文时结果写明这一点,并带上次刷新的时间', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    const project = seededProject(store, '没有新论文', ON_POLICY_DISTILLATION_SAMPLE.seeds.slice(0, 1))
    let fail = false
    const recommend = vi.fn<RecommendationProvider['recommend']>(async () => {
      if (fail) throw new Error('temporary 429')
      return [ON_POLICY_DISTILLATION_SAMPLE.expected]
    })
    let now = 1_000
    const service = createRecommendationService({ store, provider: { recommend }, onWrite: vi.fn(), now: () => now })

    await expect(service.discover(project)).resolves.toMatchObject({ added: 1, nothingNew: false, lastFetchedAt: 1_000 })
    now += DISCOVERY_COOLDOWN_MS + 1
    await expect(service.discover(project)).resolves.toMatchObject({ added: 0, nothingNew: true, lastFetchedAt: now })
    const fetchedAt = now
    now += 60_000
    await expect(service.discover(project)).resolves.toMatchObject({
      intents: 0, cachedIntents: 1, nothingNew: true, lastFetchedAt: fetchedAt,
    })
    fail = true
    await expect(service.discover(project, true)).resolves.toMatchObject({
      failedIntents: 1, nothingNew: false, lastFetchedAt: fetchedAt,
    })
  })

  it('没有 key 时 arXiv 不会在一轮里把同一个查询再问一次:引用和参考文献是同一个查询,只问一次', async () => {
    const store = createFixtureStore(() => '2026-09-17')
    const [seed] = ON_POLICY_DISTILLATION_SAMPLE.seeds
    const project = seededProject(store, '没有 key 的项目', [seed!])
    const asked: string[] = []
    const arxivProvider = createArxivRecommendations({
      now: () => Date.UTC(2026, 8, 17),
      arxiv: {
        search: async () => [],
        lookup: async () => null,
        lookupMany: async () => new Map([[seed!.arxiv, {
          id: seed!.arxiv, title: seed!.title, authors: seed!.authors, abstract: seed!.abstract,
          submitted: '2026-05-01', journalRef: null, pdf: `https://arxiv.org/pdf/${seed!.arxiv}`,
        }]]),
        searchTopical: async (query, sinceYear, order, start) => {
          asked.push(`${order} ${sinceYear} ${start ?? 0} ${query}`)
          return []
        },
      },
    })
    const service = createRecommendationService({
      store, provider: createFallbackRecommendations(() => [arxivProvider]), onWrite: vi.fn(), now: () => 1,
    })

    for (let run = 0; run < 4; run += 1) await service.discover(project, true)
    expect(asked).toHaveLength(4)
    expect(new Set(asked).size).toBe(4)
    expect(asked.map((request) => request.split(' ').slice(0, 3).join(' '))).toEqual([
      'relevance 2022 0', 'submittedDate 2025 0', 'submittedDate 2025 0', 'relevance 2022 50',
    ])
  })
})
