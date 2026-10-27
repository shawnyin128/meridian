import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscoveryDirectionParamsSchema } from '../shared/contract.js'
import { createFixtureStore } from './fixture-store.js'
import { minimalPdf } from './net/minimal-pdf.js'
import { applyRecommendationPreferences, clusterRecommendationProfile, directionBasis } from './recommendation/index.js'
import type { VaultStore } from './vault.js'
import { createVaultStore } from './vault-store.js'

/** Test vault the store opens: two paper pages, STAR with two topics, Mixtral with none. */
const VAULT = resolve(import.meta.dirname, 'fixtures/vault')
const STAR = '13979-STAR-Speculative-Decodin'
const MIXTRAL = 'Jiang-et-al-2024-Mixtral-of-Experts'

describe('发现方向的存储', () => {
  let vault: string
  let store: VaultStore

  const file = (name: string) => join(vault, '.meridian', name)
  const readJson = (name: string): unknown => JSON.parse(readFileSync(file(name), 'utf8'))
  /** A project holding `papers`, each given an arXiv id so it seeds discovery. */
  const project = async (name: string, papers: string[]): Promise<string> => {
    const id = store.createProject(name)
    for (const paper of papers) await store.addPaper(id, paper)
    return id
  }
  const profileOf = (id: string) => store.listDiscoveryProfiles().find((profile) => profile.id === id)!

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-directions-'))
    cpSync(VAULT, vault, { recursive: true })
    store = createVaultStore(vault)
    store.updatePaper(STAR, { identifier: 'arXiv:2505.00001' })
    store.updatePaper(MIXTRAL, { identifier: 'arXiv:2401.04088' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(vault, { recursive: true, force: true })
  })

  it('新项目第一次扫描出的方向是候选：不进入要拉取的方向，添加之后才拉取', async () => {
    const id = await project('新项目', [STAR])
    expect(store.discoveryIntents(id)).toEqual([])
    const [found] = store.scanDiscoveryDirections(id)
    expect(found).toEqual({ id: expect.any(String), label: expect.any(String) })
    expect(profileOf(id)).toMatchObject({
      intentCount: 0, intents: [],
      candidates: [{ id: found!.id, label: found!.label, seedCount: 1, seeds: [{ id: 'ARXIV:2505.00001', title: expect.any(String) }] }],
    })
    store.setDiscoveryDirection({ projectId: id, directionId: found!.id, action: 'add' })
    expect(store.discoveryIntents(id)).toMatchObject([{ id: found!.id, label: found!.label, enabled: true, core: true }])
    expect(profileOf(id)).toMatchObject({ intentCount: 1, candidates: [] })
  })

  it('标签取方向种子共有的 Wiki 主题名，没有主题时取种子论文的短标题，不再拼关键词', async () => {
    const star = await project('有主题', [STAR])
    expect(store.scanDiscoveryDirections(star).map((found) => found.label)).toEqual([store.getPaper(STAR).topics[0]])
    store.updatePaper(MIXTRAL, { shortTitle: 'Mixtral' })
    const mixtral = await project('无主题', [MIXTRAL])
    expect(store.scanDiscoveryDirections(mixtral).map((found) => found.label)).toEqual(['Mixtral'])
  })

  it('只加论文不重新扫描；改了当前目标才扫描，而且只提候选，不改已确认的方向', async () => {
    const id = await project('稳定', [STAR])
    const [first] = store.scanDiscoveryDirections(id)
    store.setDiscoveryDirection({ projectId: id, directionId: first!.id, action: 'add' })
    const confirmed = store.discoveryIntents(id)

    await store.addPaper(id, MIXTRAL)
    expect(store.scanDiscoveryDirections(id)).toEqual([])
    expect(store.discoveryIntents(id)).toEqual(confirmed)
    expect(profileOf(id).candidates).toEqual([])

    await store.updateProject(id, { focus: '多模态草稿' })
    const found = store.scanDiscoveryDirections(id)
    expect(found).toHaveLength(1)
    expect(profileOf(id).candidates.map((candidate) => candidate.seeds.map((seed) => seed.id))).toEqual([['ARXIV:2401.04088']])
    expect(store.discoveryIntents(id)).toEqual(confirmed)
    expect(store.scanDiscoveryDirections(id)).toEqual([])
  })

  it('改了项目主题也会重新扫描', async () => {
    const id = await project('主题', [STAR])
    store.setDiscoveryDirection({ projectId: id, directionId: store.scanDiscoveryDirections(id)[0]!.id, action: 'add' })
    await store.addPaper(id, MIXTRAL)
    await store.updateProject(id, { topics: ['MoE'] })
    expect(store.scanDiscoveryDirections(id)).toHaveLength(1)
  })

  it('项目依据的指纹只随主题、当前目标和研究路径变', () => {
    const basis = { topics: ['KV cache'], focus: '2bit', path: ['K 按通道'] }
    expect(directionBasis({ ...basis })).toBe(directionBasis(basis))
    expect(directionBasis({ ...basis, topics: ['MoE'] })).not.toBe(directionBasis(basis))
    expect(directionBasis({ ...basis, focus: '3bit' })).not.toBe(directionBasis(basis))
    expect(directionBasis({ ...basis, path: ['V 按 token'] })).not.toBe(directionBasis(basis))
  })

  it('忽略的候选以后不再提出，候选和忽略的方向都写进 disabledIntentIds 给旧版 App', async () => {
    const id = await project('忽略', [STAR])
    const [found] = store.scanDiscoveryDirections(id)
    const preferences = () => (readJson('state.json') as { discoveryPreferences: Record<string, { disabledIntentIds: string[] }> })
      .discoveryPreferences[id]!.disabledIntentIds
    expect(preferences()).toEqual([found!.id])
    store.setDiscoveryDirection({ projectId: id, directionId: found!.id, action: 'decline' })
    expect(preferences()).toEqual([found!.id])
    expect(profileOf(id).candidates).toEqual([])
    await store.updateProject(id, { focus: '再扫一次' })
    expect(store.scanDiscoveryDirections(id)).toEqual([])
    expect(store.discoveryIntents(id)).toEqual([])
  })

  it('添加候选时把它移出 disabledIntentIds', async () => {
    const id = await project('添加', [STAR])
    const [found] = store.scanDiscoveryDirections(id)
    store.setDiscoveryDirection({ projectId: id, directionId: found!.id, action: 'add' })
    expect((readJson('state.json') as { discoveryPreferences: Record<string, { disabledIntentIds: string[] }> })
      .discoveryPreferences[id]!.disabledIntentIds).toEqual([])
  })

  it('重命名已确认的方向，重开库后仍是新名字；候选和不存在的方向不能重命名', async () => {
    const id = await project('改名', [STAR])
    const [found] = store.scanDiscoveryDirections(id)
    expect(() => store.setDiscoveryDirection({ projectId: id, directionId: found!.id, action: 'rename', label: '草稿检索' }))
      .toThrow(expect.objectContaining({ reason: 'not-found' }))
    store.setDiscoveryDirection({ projectId: id, directionId: found!.id, action: 'add' })
    store.setDiscoveryDirection({ projectId: id, directionId: found!.id, action: 'rename', label: '草稿检索' })
    expect(createVaultStore(vault).discoveryIntents(id)).toMatchObject([{ id: found!.id, label: '草稿检索' }])
    expect(() => store.setDiscoveryDirection({ projectId: id, directionId: 'intent-none', action: 'add' }))
      .toThrow(expect.objectContaining({ reason: 'not-found' }))
  })

  it('合同只收非空、去掉首尾空白的新名字', () => {
    const rename = { projectId: 'p', directionId: 'd', action: 'rename' }
    expect(DiscoveryDirectionParamsSchema.safeParse({ ...rename, label: '   ' }).success).toBe(false)
    expect(DiscoveryDirectionParamsSchema.parse({ ...rename, label: ' 草稿 ' })).toEqual({ ...rename, label: '草稿' })
    expect(DiscoveryDirectionParamsSchema.safeParse({ projectId: 'p', directionId: 'd', action: 'add', label: 'x' }).success).toBe(false)
  })

  it('升级：第一次打开时，旧版一直在推导的方向原样确认，id、种子、核心和关掉的都不变，标签换成主题名或短标题', async () => {
    const id = await project('升级', [STAR, MIXTRAL])
    // App 0.0.22.0 wrote no directions file and derived the directions on every read.
    rmSync(file('discovery/directions.json'))
    const derived = clusterRecommendationProfile(store.discoveryProfile(id))
    expect(derived).toHaveLength(2)
    const off = derived[0]!.id
    const state = readJson('state.json') as Record<string, unknown>
    writeFileSync(file('state.json'), JSON.stringify({
      ...state, discoveryPreferences: { [id]: { coreIntentId: derived[1]!.id, disabledIntentIds: [off] } },
    }))
    const before = applyRecommendationPreferences(derived, { coreIntentId: derived[1]!.id, disabledIntentIds: [off] })

    const upgraded = createVaultStore(vault)
    expect(existsSync(file('discovery/directions.json'))).toBe(true)
    expect(upgraded.discoveryIntents(id).map(({ id: held, core, enabled, seeds }) => ({ id: held, core, enabled, seeds: seeds.map((seed) => seed.paperId) })))
      .toEqual(before.map(({ id: held, core, enabled, seeds }) => ({ id: held, core, enabled, seeds: seeds.map((seed) => seed.paperId) })))
    expect(upgraded.discoveryIntents(id).map((intent) => intent.label).sort())
      .toEqual([upgraded.getPaper(STAR).topics[0], 'Mixtral of Experts'].sort())
    expect(upgraded.scanDiscoveryDirections(id)).toEqual([])
  })

  it('升级后新建的项目不按升级确认，它的方向仍是候选', async () => {
    rmSync(file('discovery/directions.json'), { force: true })
    const upgraded = createVaultStore(vault)
    const id = upgraded.createProject('升级后的新项目')
    await upgraded.addPaper(id, STAR)
    expect(createVaultStore(vault).discoveryIntents(id)).toEqual([])
  })

  it('一条读不了的方向记录只让它的项目没有方向，别的项目照常，存回时原样保留', async () => {
    const good = await project('好的', [STAR])
    store.setDiscoveryDirection({ projectId: good, directionId: store.scanDiscoveryDirections(good)[0]!.id, action: 'add' })
    const bad = await project('坏的', [MIXTRAL])
    const unreadable = { id: bad, basis: 'b', directions: 'not a list', candidates: [], declined: [] }
    writeFileSync(file('discovery/directions.json'), JSON.stringify([...(readJson('discovery/directions.json') as unknown[]), unreadable]))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const reopened = createVaultStore(vault)
    expect(reopened.discoveryIntents(good)).toHaveLength(1)
    expect(reopened.discoveryIntents(bad)).toEqual([])
    expect(reopened.scanDiscoveryDirections(bad)).toEqual([])
    reopened.setDiscoveryDirection({ projectId: good, directionId: reopened.discoveryIntents(good)[0]!.id, action: 'rename', label: '新名' })
    expect(readJson('discovery/directions.json')).toContainEqual(unreadable)
  })

  it('方向记录里这一版不认识的字段读得进来，存回时一个不少', async () => {
    const id = await project('新字段', [STAR])
    const [found] = store.scanDiscoveryDirections(id)
    const records = readJson('discovery/directions.json') as Record<string, unknown>[]
    writeFileSync(file('discovery/directions.json'), JSON.stringify(records.map((record) => (
      record['id'] === id ? { ...record, weight: 2, candidates: (record['candidates'] as object[]).map((held) => ({ ...held, why: 'x' })) } : record
    ))))
    const reopened = createVaultStore(vault)
    reopened.setDiscoveryDirection({ projectId: id, directionId: found!.id, action: 'add' })
    expect(readJson('discovery/directions.json')).toContainEqual(expect.objectContaining({ id, weight: 2 }))
  })
})

describe('示例库的发现方向', () => {
  it('示例库原有的项目按升级确认，新建的项目先给候选', async () => {
    const store = createFixtureStore(() => '2026-10-27')
    const held = store.listDiscoveryProfiles().filter((profile) => profile.seedCount > 0)
    expect(held.length).toBeGreaterThan(0)
    for (const profile of held) expect(store.discoveryIntents(profile.id).length).toBeGreaterThan(0)

    const id = store.createProject('示例新项目')
    const imported = store.importPaper('2401.04088.pdf', minimalPdf({ lines: ['2401.04088', 'Mixtral of Experts'] })).paper
    store.fillPaperMetadata(imported.id, { title: 'Mixtral of Experts', identifier: 'arXiv:2401.04088' }, imported.title)
    await store.addPaper(id, imported.id)
    expect(store.discoveryIntents(id)).toEqual([])
    const [found] = store.scanDiscoveryDirections(id)
    store.setDiscoveryDirection({ projectId: id, directionId: found!.id, action: 'add' })
    expect(store.discoveryIntents(id)).toMatchObject([{ id: found!.id, enabled: true }])
  })
})
