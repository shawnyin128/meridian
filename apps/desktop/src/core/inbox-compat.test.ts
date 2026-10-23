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
    expect(read('inbox')).toEqual([left, folded, { ...live, gone: true }])
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
