import { describe, expect, it, vi } from 'vitest'
import { createFixtureStore } from '../fixture-store.js'
import { minimalPdf } from '../net/minimal-pdf.js'
import { ON_POLICY_DISTILLATION_SAMPLE } from './fixtures/on-policy-distillation.js'
import { clusterRecommendationProfile, recommendationFingerprint, recommendationQueryIntent } from './profile.js'
import { createRecommendationService, DISCOVERY_COOLDOWN_MS } from './service.js'
import type {
  DiscoverySchedule, RecommendationProfile, RecommendationProvider, RecommendationSeed,
} from './types.js'

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
      cachedIntents: 0, failedIntents: 0,
    })
    expect(recommend).toHaveBeenCalledTimes(2)
    // project.papers now links newest-first, so a tie in cluster score now breaks toward the
    // paper linked last instead of the one linked first.
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
      cachedIntents: 0, failedIntents: 0,
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
      cachedIntents: 0, failedIntents: 0,
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
      cachedIntents: 0, failedIntents: 1,
    })
    expect(store.discoverySchedule(project.id).lastFetchedAt).toBeNull()
    expect(store.discoverySchedule(project.id).cursor).toBe(0)

    round = 2
    call = 0
    await expect(service.discover(project.id)).resolves.toEqual({
      projects: 1, intents: 1, added: 0, deferredProjects: 0,
      cachedIntents: 1, failedIntents: 0,
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
      cachedIntents: 0, failedIntents: 1,
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
      addDiscoveryEntries: () => 0,
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
      cachedIntents: 0, failedIntents: 0,
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
        addDiscoveryEntries: () => 0,
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
      cachedIntents: 0, failedIntents: 0,
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
    const intent = recommendationQueryIntent(store.discoveryIntents(project.id)[0]!)
    store.setDiscoverySchedule(project.id, {
      lastFetchedAt: 1, cursor: 0,
      requests: { [intent.id]: { fingerprint: recommendationFingerprint(intent, []), fetchedAt: 1 } },
    })
    const recommend = vi.fn<RecommendationProvider['recommend']>(async () => [])
    const service = createRecommendationService({
      store, provider: { recommend }, onWrite: vi.fn(), now: () => DISCOVERY_COOLDOWN_MS + 2,
    })

    await service.discover(project.id)
    expect(recommend.mock.calls[0]?.[2]).toBe('citation')
  })
})
