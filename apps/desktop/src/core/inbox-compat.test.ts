import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VaultStore } from './vault.js'
import { createVaultStore } from './vault-store.js'

/** Test vault the store opens. */
const VAULT = resolve(import.meta.dirname, 'fixtures/vault')

/** The fixture paper the project's discovery directions are seeded from. */
const SEED_PAPER = '13979-STAR-Speculative-Decodin'

/** A discovery entry for `project` as every version so far stores it in `.meridian/inbox.json`. */
const discovered = (id: string, project: string, arxiv: string) => ({
  id, kind: 'discovery', watch: '', project, source: '项目 · 论文推送', title: `Discovered ${arxiv}`,
  authors: 'Ada', venue: `arXiv:${arxiv}`, abstract: 'A', rec: '',
  reasons: [{ kind: 'project', label: '和项目「论文推送」相关' }],
  downloaded: false, paper: '', pdf: `https://arxiv.org/pdf/${arxiv}`, topic: '', gone: false,
  arxiv, semanticId: `semantic-${arxiv}`, meta: { authors: ['Ada'], submitted: '2026-09-08', journalRef: null },
})

/** The provider result that would deliver the paper `arxiv` again. */
const refound = (arxiv: string) => ({
  semanticId: `semantic-${arxiv}`, id: arxiv, title: `Discovered ${arxiv}`, authors: ['Ada'], abstract: 'A',
  submitted: '2026-09-08', journalRef: null, pdf: `https://arxiv.org/pdf/${arxiv}`,
})

describe('论文推送重做后要写的存储形状', () => {
  let vault: string
  let store: VaultStore
  let project: string

  /** Writes `.meridian/<name>.json` as another App version would. */
  const write = (name: string, value: unknown): void => {
    writeFileSync(join(vault, '.meridian', `${name}.json`), JSON.stringify(value, null, 2), 'utf8')
  }
  /** Reads `.meridian/<name>.json` as it now stands. */
  const read = (name: string): unknown => JSON.parse(readFileSync(join(vault, '.meridian', `${name}.json`), 'utf8'))

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-inbox-compat-'))
    cpSync(VAULT, vault, { recursive: true })
    store = createVaultStore(vault)
    project = store.createProject('论文推送')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(vault, { recursive: true, force: true })
  })

  it('收件记录顶层多出离开原因、折叠状态和 DOI 等身份字段：条条读进来、不再推送，存回时一个不少', () => {
    const left = {
      ...discovered('inbox-901', project, '2609.90001'), gone: true,
      left: 'library', leftAt: 1_792_000_000_000, doi: '10.48550/arXiv.2609.90001', year: 2026,
    }
    const folded = {
      ...discovered('inbox-902', project, '2609.90002'), gone: true,
      left: 'folded', leftAt: 1_792_000_000_000, doi: '10.48550/arXiv.2609.90002', year: 2026,
    }
    const live = { ...discovered('inbox-903', project, '2609.90003'), doi: '10.48550/arXiv.2609.90003', year: 2026 }
    write('inbox', [left, folded, live])
    const reported = vi.spyOn(console, 'error')

    const reopened = createVaultStore(vault)
    expect(reported).not.toHaveBeenCalled()
    expect(reopened.listInbox({ kind: 'discovery', project })).toEqual([
      expect.objectContaining({ id: 'inbox-903', title: live.title, reasons: live.reasons }),
    ])
    expect(reopened.addDiscoveryEntries(project, ['2609.90001', '2609.90002', '2609.90003'].map(refound))).toBe(0)
    reopened.dismissInbox('inbox-903')
    expect(read('inbox')).toEqual([left, folded, { ...live, gone: true, left: 'dismissed' }])
  })

  it('减少类似和已经了解的垃圾桶记录：列在垃圾桶里，还原后卡片回到论文推送，反馈一并撤掉', () => {
    const less = { ...discovered('inbox-911', project, '2609.91001'), feedback: 'less', gone: true }
    const known = { ...discovered('inbox-912', project, '2609.91002'), feedback: 'known', gone: true }
    const deletedAt = Date.parse(`${store.today()}T00:00:00Z`)
    write('inbox', [less, known])
    write('trash', [
      { id: 'trash-921', kind: 'inbox', title: less.title, deletedAt, entryId: less.id, feedback: 'less' },
      { id: 'trash-922', kind: 'inbox', title: known.title, deletedAt, entryId: known.id, feedback: 'known' },
    ])
    const reported = vi.spyOn(console, 'error')

    const reopened = createVaultStore(vault)
    expect(reported).not.toHaveBeenCalled()
    expect(reopened.listTrash()).toEqual([
      { id: 'trash-921', kind: 'inbox', title: less.title, deletedAt, restorable: true },
      { id: 'trash-922', kind: 'inbox', title: known.title, deletedAt, restorable: true },
    ])
    expect(reopened.discoverySeeds(project).negative).toEqual([less.semanticId])
    reopened.restoreTrash('trash-921')
    reopened.restoreTrash('trash-922')
    expect(reopened.listInbox({ kind: 'discovery', project }).map(({ id, feedback }) => ({ id, feedback })))
      .toEqual([{ id: less.id, feedback: undefined }, { id: known.id, feedback: undefined }])
    expect(reopened.discoverySeeds(project).negative).toEqual([])
    expect(read('inbox')).toEqual([
      discovered(less.id, project, less.arxiv), discovered(known.id, project, known.arxiv),
    ])
    expect(read('trash')).toEqual([])
  })

  it('移出稍后阅读的垃圾桶记录：列在垃圾桶里，还原回到稍后阅读原来的位置，过了保留期照常清掉', () => {
    const queued = (id: string) => ({
      id, title: `Queued ${id}`, source: '项目 · 论文推送', added: store.today(), authors: 'Ada', venue: 'arXiv:2609.94001',
      abstract: 'A', paper: '', pdf: 'https://arxiv.org/pdf/2609.94001',
    })
    const [first, removed, last, expired] = ['inbox-941', 'inbox-942', 'inbox-943', 'inbox-944'].map(queued)
    const deletedAt = Date.parse(`${store.today()}T00:00:00Z`)
    write('later', [first, last])
    write('trash', [
      { id: 'trash-951', kind: 'later', title: removed!.title, deletedAt, later: removed, position: 1 },
      { id: 'trash-952', kind: 'later', title: expired!.title, deletedAt: deletedAt - 8 * 86_400_000, later: expired, position: 0 },
    ])
    const reported = vi.spyOn(console, 'error')

    const reopened = createVaultStore(vault)
    expect(reported).not.toHaveBeenCalled()
    expect(reopened.listTrash()).toEqual([
      { id: 'trash-951', kind: 'later', title: removed!.title, deletedAt, restorable: true },
    ])
    reopened.restoreTrash('trash-951')
    expect(reopened.listLater().map((entry) => entry.id)).toEqual([first!.id, removed!.id, last!.id])
    expect(read('later')).toEqual([first, removed, last])
    expect(read('trash')).toEqual([])
  })

  it('state.json 里项目的推荐偏好多出确认方向和候选方向：照常读出，改启停后原样留着', () => {
    store.updatePaper(SEED_PAPER, { identifier: 'arXiv:2211.17192' })
    store.addPaper(project, SEED_PAPER)
    const directions = [{ id: 'direction-1', label: '推测解码', seeds: ['ARXIV:2211.17192'], weight: 1, confirmedAt: 1_792_000_000_000 }]
    const candidates = [{ id: 'direction-2', label: '树状验证', seeds: ['ARXIV:2401.15077'], foundAt: 1_792_000_000_000 }]
    const basis = { topic: '推测解码', goal: '', path: '' }
    write('state', {
      ...read('state') as object,
      discoveryPreferences: { [project]: { coreIntentId: null, disabledIntentIds: [], directions, candidates, basis } },
    })

    const reopened = createVaultStore(vault)
    const intent = reopened.listDiscoveryProfiles().find((profile) => profile.id === project)!.intents[0]!
    reopened.setDiscoveryIntent(project, intent.id, 'disable')
    expect((read('state') as { discoveryPreferences: unknown }).discoveryPreferences).toEqual({
      [project]: { coreIntentId: null, disabledIntentIds: [intent.id], directions, candidates, basis },
    })
    expect(createVaultStore(vault).listDiscoveryProfiles().find((profile) => profile.id === project)!.intents[0])
      .toMatchObject({ id: intent.id, enabled: false })
  })

  it('state.json 里项目的推荐偏好缺键或值读不了：逐键报出来、按没有设置读，库照常打开，没改的值原样留着', () => {
    store.updatePaper(SEED_PAPER, { identifier: 'arXiv:2211.17192' })
    store.addPaper(project, SEED_PAPER)
    const other = store.createProject('另一个项目')
    store.addPaper(other, SEED_PAPER)
    const intentOf = (s: VaultStore, id: string) => s.listDiscoveryProfiles().find((profile) => profile.id === id)!.intents[0]!
    const intent = intentOf(store, other).id
    const directions = [{ id: 'direction-1', label: '推测解码', seeds: ['ARXIV:2211.17192'] }]
    write('state', {
      ...read('state') as object,
      discoveryPreferences: {
        [project]: { directions },
        [other]: { coreIntentId: { id: 'direction-1' }, disabledIntentIds: [intent] },
      },
    })
    const reported = vi.spyOn(console, 'error')

    const reopened = createVaultStore(vault)
    expect(reported.mock.calls.map(([line]) => String(line).match(/: (\w+) of project (project-\d+) /)?.slice(1)))
      .toEqual([['coreIntentId', project], ['disabledIntentIds', project], ['coreIntentId', other]])
    expect(intentOf(reopened, project)).toMatchObject({ core: true, enabled: true })
    expect(intentOf(reopened, other)).toMatchObject({ id: intent, enabled: false })
    reopened.setDiscoveryIntent(project, intentOf(reopened, project).id, 'disable')
    reopened.setDiscoveryIntent(other, intent, 'enable')
    expect((read('state') as { discoveryPreferences: unknown }).discoveryPreferences).toEqual({
      [project]: { coreIntentId: null, disabledIntentIds: [intentOf(reopened, project).id], directions },
      [other]: { coreIntentId: { id: 'direction-1' }, disabledIntentIds: [] },
    })
  })

  it('刷新进度和候选池存在 .meridian/discovery/progress.json：重开后读回来，state.json 不动，删掉的项目不留进度，读不懂的照留', () => {
    const other = store.createProject('删掉的项目')
    const folder = join(vault, '.meridian', 'discovery')
    mkdirSync(folder)
    const later = [refound('2609.95001')]
    const scores = { '2609.95001': 0.8 }
    writeFileSync(join(folder, 'progress.json'), JSON.stringify([
      { id: `project:${project}`, steps: { 'intent-a': 3 }, candidates: later, favouredAt: 1_792_000_000_000, scores },
      { id: `project:${other}`, steps: { 'intent-b': 1 } },
      { id: 'topic:speculative-decoding', steps: { 'intent-c': 2 } },
    ]), 'utf8')
    const state = readFileSync(join(vault, '.meridian', 'state.json'), 'utf8')

    const reopened = createVaultStore(vault)
    expect(reopened.refreshProgress({ kind: 'project', id: project })).toEqual({
      steps: { 'intent-a': 3 }, candidates: later, favouredAt: 1_792_000_000_000, newest: [], poolStalled: false,
    })
    reopened.deleteProject(other)
    const trashed = readFileSync(join(vault, '.meridian', 'state.json'), 'utf8')
    const next = { steps: { 'intent-a': 4, 'intent-d': 1 }, candidates: [refound('2609.95002')], favouredAt: null, newest: [], poolStalled: false }
    reopened.setRefreshProgress({ kind: 'project', id: project }, next)
    expect(readFileSync(join(vault, '.meridian', 'state.json'), 'utf8')).toBe(trashed)
    expect(trashed).not.toBe(state)
    expect(JSON.parse(readFileSync(join(folder, 'progress.json'), 'utf8'))).toEqual([
      { id: 'topic:speculative-decoding', steps: { 'intent-c': 2 } },
      { id: `project:${project}`, steps: next.steps, candidates: next.candidates, scores },
    ])
    expect(createVaultStore(vault).refreshProgress({ kind: 'project', id: project })).toEqual(next)
  })

  it('候选池里的论文带着 DOI：存下再读回来，DOI 还在', () => {
    const withDoi = { ...refound('2609.97001'), doi: '10.48550/arXiv.2609.97001' }
    store.setRefreshProgress({ kind: 'project', id: project }, {
      steps: {}, candidates: [withDoi], favouredAt: null, newest: [], poolStalled: false,
    })
    expect(createVaultStore(vault).refreshProgress({ kind: 'project', id: project }).candidates).toEqual([withDoi])
  })

  it('上一次靠候选池的那轮一张没送出时，标记存在 progress.json 这条进度的顶层：重开后读回来，清掉后不再写', () => {
    const stalled = {
      steps: { 'intent-a': 1 }, candidates: [refound('2609.98001')], favouredAt: null, newest: [], poolStalled: true,
    }
    store.setRefreshProgress({ kind: 'project', id: project }, stalled)
    expect(read('discovery/progress')).toEqual([
      { id: `project:${project}`, steps: stalled.steps, candidates: stalled.candidates, poolStalled: true },
    ])
    expect(createVaultStore(vault).refreshProgress({ kind: 'project', id: project })).toEqual(stalled)

    store.setRefreshProgress({ kind: 'project', id: project }, { ...stalled, poolStalled: false })
    expect(read('discovery/progress')).toEqual([
      { id: `project:${project}`, steps: stalled.steps, candidates: stalled.candidates },
    ])
    expect(createVaultStore(vault).refreshProgress({ kind: 'project', id: project }).poolStalled).toBe(false)
  })

  it('关注的候选池也存在 progress.json：删掉的关注下次写时不留，这个版本读不了的关注照留', () => {
    store.createWatch({ type: 'topic', name: 'kv cache' })
    store.createWatch({ type: 'topic', name: 'speculative decoding' })
    const watchNamed = (name: string) => store.listWatches().find((watch) => watch.name === name)!.id
    const [kept, removed] = [watchNamed('kv cache'), watchNamed('speculative decoding')]
    write('watches', [...read('watches') as object[], { id: 'watch-future', type: 'venue', name: 'NeurIPS', active: true }])
    mkdirSync(join(vault, '.meridian', 'discovery'))
    const future = { id: 'watch:watch-future', candidates: [refound('2609.96002')] }
    write('discovery/progress', [{ id: `watch:${removed}`, candidates: [refound('2609.96001')] }, future])
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const reopened = createVaultStore(vault)
    reopened.deleteWatch(removed)
    const pooled = { steps: {}, candidates: [refound('2609.96003')], favouredAt: null, newest: [], poolStalled: false }
    reopened.setRefreshProgress({ kind: 'watch', id: kept }, pooled)
    expect(read('discovery/progress')).toEqual([future, { id: `watch:${kept}`, steps: {}, candidates: pooled.candidates }])
    expect(createVaultStore(vault).refreshProgress({ kind: 'watch', id: kept })).toEqual(pooled)
    expect(() => reopened.refreshProgress({ kind: 'watch', id: removed })).toThrow(/关注不存在/)
  })

  it('.meridian/discovery 下的候选池和 SPECTER2 向量缓存：打开、删项目、清空垃圾桶都不碰它们', () => {
    const folder = join(vault, '.meridian', 'discovery')
    mkdirSync(folder)
    const pool = JSON.stringify({ [project]: { candidates: [refound('2609.93001')], cursor: 1 } })
    const vectors = JSON.stringify({ model: 'specter2', vectors: { 'semantic-2609.93001': [0.12, -0.03, 0.4] } })
    writeFileSync(join(folder, 'candidates.json'), pool, 'utf8')
    writeFileSync(join(folder, 'embeddings.json'), vectors, 'utf8')

    const reopened = createVaultStore(vault)
    reopened.deleteProject(project)
    reopened.clearTrash()
    createVaultStore(vault)
    expect(readFileSync(join(folder, 'candidates.json'), 'utf8')).toBe(pool)
    expect(readFileSync(join(folder, 'embeddings.json'), 'utf8')).toBe(vectors)
  })
})
