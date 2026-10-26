import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync,
  statSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  PaperRowSchema, SearchHitSchema, WikiAggregationCardSchema, WikiBacklinkSchema, WikiHomeSchema, WikiPaperSchema,
  type Evidence,
} from '../shared/contract.js'
import { DEFAULT_PROJECT_TOPIC } from '../shared/vocabulary.js'
import { stableJson } from './changelog.js'
import { createFixtureStore } from './fixture-store.js'
import { emptyColumns } from './paper-library/index.js'
import type { VaultStore } from './vault.js'
import { createDesktopVaultStore, createVaultStore, isGitManaged } from './vault-store.js'
import { generatedChildren, generatedTable, pageVersion, readWikiData } from './wiki/index.js'
import { prepareSelectedLibrary } from './workspace-layout.js'
import { minimalPdf } from './net/minimal-pdf.js'
import { recordChange } from './write-receipts.js'

/** Test vault for the real implementation: aggregation layout, two paper pages, two topics, one method, and four sources. */
const VAULT = resolve(import.meta.dirname, 'fixtures/vault')

/** Git-managed repository root. */
const REPO = resolve(import.meta.dirname, '../../../..')

/** The paper page with a source PDF; its ID is its filename. */
const WITH_SOURCE = '13979-STAR-Speculative-Decodin'

/** Cell-writing cases add this column first because Core accepts only configured paper-table columns. */
const NOTE_COLUMN = { key: 'note', label: '备注', type: 'text' as const, options: [] }

/** Source referenced by the page; `source_id` is a page field, not the page identity. */
const SOURCE_ID = 'paper-pdf-a6b750e25a61'

/** Inbox entry pointing to a source absent from the vault, shaped like `.meridian/inbox.json`. */
const INBOX_ENTRY = {
  id: 'in-new',
  watch: 'w-1',
  source: '主题 · quantization',
  title: 'Rotation Revisited',
  authors: 'Li et al.',
  venue: 'ICLR 2026',
  abstract: '……',
  rec: '接着你上周读的那一篇',
  downloaded: false,
  paper: 'paper-pdf-000000000001',
  pdf: 'https://arxiv.org/pdf/2609.10003',
  topic: 'Rotation',
  gone: false,
  arxiv: '2609.10003',
  meta: { authors: ['Li'], submitted: '2026-09-03', journalRef: null },
}

/** ListResult and Facet have contract types but no schemas, so build local shape predicates from those types. */
const ListResultSchema = z.object({ rows: z.array(PaperRowSchema), total: z.number().int() }).strict()
const FacetSchema = z.object({
  value: z.string(), count: z.number().int(), newestTitle: z.string(),
}).strict()
const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * Invocation and output schema for every knowledge contract method. Inputs come
 * from each store; since the implementations hold different data, parity checks shape only.
 */
const KNOWLEDGE: Record<string, { call: (store: VaultStore) => unknown; schema: z.ZodType }> = {
  'vault.today': { call: (s) => s.today(), schema: IsoDateSchema },
  'papers.list': { call: (s) => s.listPapers({ page: 1, size: 5 }), schema: ListResultSchema },
  'papers.facets': { call: (s) => s.facetPapers('topics'), schema: z.array(FacetSchema) },
  'papers.get': {
    call: (s) => s.getPaper(s.listPapers({ page: 1, size: 1 }).rows[0]!.id), schema: PaperRowSchema,
  },
  'papers.source': { call: (s) => s.paperSource(WITH_SOURCE), schema: z.instanceof(Uint8Array) },
  'wiki.home': { call: (s) => s.wikiHome(), schema: WikiHomeSchema },
  'wiki.paper': {
    call: (s) => s.wikiPaper(`papers/${s.listPapers({ page: 1, size: 1 }).rows[0]!.id}`),
    schema: WikiPaperSchema,
  },
  'wiki.cards': { call: (s) => s.wikiCards(), schema: z.array(WikiAggregationCardSchema) },
  'wiki.backlinks': { call: (s) => s.wikiBacklinks(s.wikiCards()[0]!.id), schema: z.array(WikiBacklinkSchema) },
  'search.query': { call: (s) => s.search('a'), schema: z.array(SearchHitSchema) },
}

describe('vault store', () => {
  let store: VaultStore
  /** Opening a vault writes `.meridian/`, so every case uses a copy and leaves the repository fixture untouched. */
  let vault: string

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-vault-'))
    cpSync(VAULT, vault, { recursive: true })
    // The fixture implementation reads sources from this environment variable; the real implementation uses its vault root.
    vi.stubEnv('MERIDIAN_LIBRARY_ROOT', vault)
    store = createVaultStore(vault)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(vault, { recursive: true, force: true })
  })

  describe('一篇论文只送一次', () => {
    /** An arXiv result a watch brings in. */
    const found = (id: string, title = `Shared ${id}`, submitted = '2026-09-01') => ({
      id, title, authors: ['Li'], abstract: '……', submitted, journalRef: null, pdf: `https://arxiv.org/pdf/${id}`,
    })
    /** A provider result project discovery brings in. */
    const discovered = (id: string, semanticId = `semantic-${id}`, title = `Shared ${id}`) => ({
      ...found(id, title), semanticId,
    })
    /** The watch named `name` in store `s`. */
    const watchOf = (s: VaultStore, name: string) => s.listWatches().find((w) => w.name === name)!.id
    const titles = (rows: { title: string }[]) => rows.map((row) => row.title)

    for (const [name, make] of [['真实实现', () => store], ['fixture', () => createFixtureStore()]] as const) {
      it(`${name}:别的关注和项目再找到推送过的论文,并进同一张卡片,理由合在一起,每个找到它的范围里都列着它`, () => {
        const s = make()
        s.createWatch({ type: 'topic', name: 'shared-a' })
        s.createWatch({ type: 'author', name: 'shared-b' })
        const project = s.createProject('共享项目')
        expect(s.addInboxEntries(watchOf(s, 'shared-a'), [found('2609.20001'), found('2609.20002')])).toEqual(['2609.20001', '2609.20002'])
        expect(s.addInboxEntries(watchOf(s, 'shared-b'), [found('2609.20002v2'), found('2609.20003'), found('2609.20003')])).toEqual(['2609.20003'])
        expect(s.addDiscoveryEntries(project, [discovered('2609.20002'), discovered('2609.20004')])).toBe(1)

        const shared = s.listInbox().filter((entry) => entry.title === 'Shared 2609.20002')
        expect(shared).toHaveLength(1)
        expect(shared[0]!.reasons.map((reason) => reason.label).slice(0, 3))
          .toEqual(['命中关键词「shared-a」', '命中作者「shared-b」', '来自项目「共享项目」'])
        expect(shared[0]!.also).toEqual([
          { kind: 'watch', id: watchOf(s, 'shared-b'), source: '作者 · shared-b' },
          { kind: 'discovery', id: project, source: '项目 · 共享项目' },
        ])
        expect(titles(s.listInbox({ kind: 'watch', watch: watchOf(s, 'shared-b') })).sort()).toEqual(['Shared 2609.20002', 'Shared 2609.20003'])
        expect(titles(s.listInbox({ kind: 'discovery', project })).sort()).toEqual(['Shared 2609.20002', 'Shared 2609.20004'])
        expect(s.listInbox({ kind: 'watch' }).filter((entry) => entry.title.startsWith('Shared '))).toHaveLength(3)
      })

      it(`${name}:认得是同一篇:Semantic Scholar 编号、库里记的 DOI,再按规范化标题加年份;年份不同的另算一篇`, () => {
        const s = make()
        const one = s.createProject('项目一')
        const two = s.createProject('项目二')
        s.createWatch({ type: 'topic', name: 'titles' })
        expect(s.addDiscoveryEntries(one, [discovered('2609.21001', 'semantic-same')])).toBe(1)
        expect(s.addDiscoveryEntries(two, [discovered('', 'semantic-same', 'Retitled by the provider')])).toBe(0)
        const paper = s.listPapers({ page: 1, size: 1 }).rows[0]!
        s.updatePaper(paper.id, { identifier: 'doi:10.48550/arXiv.2609.21002' })
        expect(s.addInboxEntries(watchOf(s, 'titles'), [
          found('2609.21002'), found('2609.21003', 'A Paper, Twice'), found('2609.21004', 'a paper twice'),
          found('2609.21005', 'A Paper Twice', '2019-03-01'),
        ])).toEqual(['2609.21003', '2609.21005'])
      })

      it(`${name}:推送过、忽略过或标过的论文不再回来,删掉送来它的关注和项目之后也一样`, () => {
        const s = make()
        s.createWatch({ type: 'topic', name: 'gone-a' })
        const project = s.createProject('要删的项目')
        expect(s.addInboxEntries(watchOf(s, 'gone-a'), [found('2609.22001'), found('2609.22002')])).toHaveLength(2)
        expect(s.addDiscoveryEntries(project, [discovered('2609.22003'), discovered('2609.22004')])).toBe(2)
        s.dismissInbox(s.listInbox().find((entry) => entry.title === 'Shared 2609.22001')!.id)
        s.feedbackDiscovery(s.listInbox().find((entry) => entry.title === 'Shared 2609.22003')!.id, 'known')
        s.deleteWatch(watchOf(s, 'gone-a'))
        s.deleteProject(project)
        s.createWatch({ type: 'topic', name: 'again' })
        const again = [found('2609.22001'), found('2609.22002'), found('2609.22003'), found('2609.22004')]
        expect(s.addInboxEntries(watchOf(s, 'again'), again)).toEqual([])
        expect(s.listInbox()).toEqual(expect.not.arrayContaining([expect.objectContaining({ title: 'Shared 2609.22002' })]))
      })

      it(`${name}:两个项目以不同的标题送来同一个 DOI 的论文,只是一张卡片,两个项目下都列着它,DOI 存在记录上`, () => {
        const s = make()
        const one = s.createProject('DOI 一')
        const two = s.createProject('DOI 二')
        expect(s.addDiscoveryEntries(one, [Object.assign(discovered('', 'semantic-doi-a', 'A Title'), { doi: '10.1145/3600006.3613165' })])).toBe(1)
        expect(s.addDiscoveryEntries(two, [Object.assign(discovered('', 'semantic-doi-b', 'Another Title'), { doi: 'https://doi.org/10.1145/3600006.3613165' })])).toBe(0)
        const cards = s.listInbox({ kind: 'discovery' }).filter((entry) => entry.title === 'A Title' || entry.title === 'Another Title')
        expect(cards.map((entry) => [entry.title, entry.also?.map((stream) => stream.id)])).toEqual([['A Title', [two]]])
        const library = s.listPapers({ page: 1, size: 1 }).rows[0]!
        s.updatePaper(library.id, { identifier: 'doi:10.1145/3600006.3613165' })
        expect(s.listInbox({ kind: 'discovery' }).map((entry) => entry.title)).not.toContain('A Title')
      })

      it(`${name}:删掉卡片最先来自的那条关注,卡片留在另一个找到它的范围下,只带那边的理由`, () => {
        const s = make()
        s.createWatch({ type: 'topic', name: 'first' })
        const project = s.createProject('后来的项目')
        s.addInboxEntries(watchOf(s, 'first'), [found('2609.23001')])
        s.addDiscoveryEntries(project, [discovered('2609.23001')])
        const cards = () => s.listInbox().filter((entry) => entry.title === 'Shared 2609.23001')
        expect(cards()).toHaveLength(1)
        s.deleteWatch(watchOf(s, 'first'))
        const [card] = cards()
        expect(card).toMatchObject({ kind: 'discovery', project, watch: '', source: '项目 · 后来的项目' })
        expect(card!.also).toBeUndefined()
        expect(card!.reasons[0]).toEqual({ kind: 'project', label: '来自项目「后来的项目」' })
        expect(card!.reasons.some((reason) => reason.kind === 'watch')).toBe(false)
      })

      it(`${name}:关注先送来、项目也找到的那张卡片,在项目里给的反馈记进那个项目`, () => {
        const s = make()
        s.createWatch({ type: 'topic', name: 'watched-first' })
        const project = s.createProject('反馈项目')
        s.addInboxEntries(watchOf(s, 'watched-first'), [found('2609.24001')])
        s.addDiscoveryEntries(project, [discovered('2609.24001')])
        const [card] = s.listInbox({ kind: 'discovery', project })
        expect(card!.kind).toBe('watch')
        s.feedbackDiscovery(card!.id, 'less')
        expect(s.discoverySeeds(project).negative).toEqual(['semantic-2609.24001'])
        expect(titles(s.listInbox())).not.toContain('Shared 2609.24001')
      })
    }

    for (const [name, make] of [['真实实现', () => store], ['fixture', () => createFixtureStore()]] as const) {
      it(`${name}:问哪些候选还会送出:库里有的、送过的(送它的关注删了也算)和推送里正列着的都不算,同一篇只算一次`, () => {
        const s = make()
        s.createWatch({ type: 'topic', name: 'asked' })
        s.addInboxEntries(watchOf(s, 'asked'), [found('2609.26001'), found('2609.26002')])
        s.dismissInbox(s.listInbox().find((entry) => entry.title === 'Shared 2609.26002')!.id)
        s.updatePaper(s.listPapers({ page: 1, size: 1 }).rows[0]!.id, { identifier: 'arXiv:2609.26003' })
        const candidates = ['2609.26001', '2609.26002', '2609.26003', '2609.26004', '2609.26004v2', '2609.26005']
          .map((id) => discovered(id))
        expect(s.undelivered(candidates).map((paper) => paper.id)).toEqual(['2609.26004', '2609.26005'])
        s.deleteWatch(watchOf(s, 'asked'))
        expect(s.undelivered(candidates).map((paper) => paper.id)).toEqual(['2609.26004', '2609.26005'])
        expect(s.listInbox().filter((entry) => entry.title.startsWith('Shared '))).toEqual([])
      })
    }

    /** An arXiv result with ranking metadata whose only difference from its siblings is `relevance`. */
    const ranked = (id: string, relevance: number) => ({
      ...found(id, `Ranked ${id}`),
      ranking: { relevance, published: false, citationCount: 0, influentialCitationCount: 0, submitted: '2026-09-01' },
    })

    for (const [name, make] of [['真实实现', () => store], ['fixture', () => createFixtureStore()]] as const) {
      it(`${name}:刷新时新来的和这个范围里还没读的一起按推荐分排,只留前几张,其余折叠为看过:不删、不再送,别的范围不动`, () => {
        const s = make()
        s.setDeliverySettings({ ...s.deliverySettings(), maxShownPerScope: 3 })
        s.createWatch({ type: 'topic', name: 'capped' })
        s.createWatch({ type: 'topic', name: 'other' })
        s.addInboxEntries(watchOf(s, 'other'), [ranked('2609.28009', 0.1)])
        expect(s.addInboxEntries(watchOf(s, 'capped'), [ranked('2609.28001', 0.9), ranked('2609.28002', 0.2)]))
          .toEqual(['2609.28001', '2609.28002'])
        expect(s.addInboxEntries(watchOf(s, 'capped'), [
          ranked('2609.28003', 0.5), ranked('2609.28004', 0.1), ranked('2609.28005', 0.8),
        ])).toEqual(['2609.28003', '2609.28005'])
        expect(titles(s.listInbox({ kind: 'watch', watch: watchOf(s, 'capped') })))
          .toEqual(['Ranked 2609.28001', 'Ranked 2609.28005', 'Ranked 2609.28003'])
        expect(titles(s.listInbox({ kind: 'watch', watch: watchOf(s, 'other') }))).toEqual(['Ranked 2609.28009'])
        expect(s.addInboxEntries(watchOf(s, 'capped'), [ranked('2609.28002', 0.2), ranked('2609.28004', 0.1)])).toEqual([])
        // A new paper ranked below the limit is not delivered, so a later run may still deliver it.
        expect(s.undelivered([discovered('2609.28002'), discovered('2609.28004')]).map((paper) => paper.id)).toEqual(['2609.28004'])
      })

      it(`${name}:按过更多类似的卡片刷新时从不折叠,也不占显示上限:上限只排这个范围别的未读卡片和新来的论文`, () => {
        const s = make()
        s.setDeliverySettings({ ...s.deliverySettings(), maxShownPerScope: 2 })
        const project = s.createProject('按过更多类似')
        const rankedFind = (id: string, relevance: number) => Object.assign(discovered(id), { ranking: ranked(id, relevance).ranking })
        const like = (title: string) => s.feedbackDiscovery(s.listInbox({ kind: 'discovery', project }).find((entry) => entry.title === title)!.id, 'more')
        expect(s.addDiscoveryEntries(project, [rankedFind('2609.28101', 0.1), rankedFind('2609.28102', 0.2)])).toBe(2)
        like('Shared 2609.28101')
        expect(s.addDiscoveryEntries(project, [rankedFind('2609.28103', 0.9), rankedFind('2609.28104', 0.5)])).toBe(2)
        expect(titles(s.listInbox({ kind: 'discovery', project }))).toEqual(['Shared 2609.28103', 'Shared 2609.28104', 'Shared 2609.28101'])
        like('Shared 2609.28103')
        like('Shared 2609.28104')
        expect(s.addDiscoveryEntries(project, [rankedFind('2609.28105', 0.05)])).toBe(1)
        expect(titles(s.listInbox({ kind: 'discovery', project }))).toEqual([
          'Shared 2609.28103', 'Shared 2609.28104', 'Shared 2609.28101', 'Shared 2609.28105',
        ])
      })
    }

    it('真实实现:落到上限以下的卡片存成 gone 加 left: folded,不进垃圾桶;落到上限以下的新论文不送,不进收件也不记作送过', () => {
      store.setDeliverySettings({ maxItemsPerRun: 10, maxShownPerScope: 1 })
      store.createWatch({ type: 'topic', name: 'folding' })
      store.addInboxEntries(watchOf(store, 'folding'), [ranked('2609.29001', 0.2)])
      expect(store.addInboxEntries(watchOf(store, 'folding'), [ranked('2609.29002', 0.9), ranked('2609.29003', 0.1)]))
        .toEqual(['2609.29002'])
      const stored = (JSON.parse(readFileSync(join(vault, '.meridian', 'inbox.json'), 'utf8')) as Record<string, unknown>[])
        .map(({ arxiv, gone, left }) => [arxiv, gone, left])
      expect(stored).toEqual(expect.arrayContaining([['2609.29001', true, 'folded'], ['2609.29002', false, undefined]]))
      expect(stored.map(([arxiv]) => arxiv)).not.toContain('2609.29003')
      expect(readFileSync(join(vault, '.meridian', 'discovery', 'delivered.json'), 'utf8')).not.toContain('2609.29003')
      expect(store.listTrash()).toEqual([])
    })

    it('真实实现:问哪些候选还会送出不写库', () => {
      store.createWatch({ type: 'topic', name: 'asked' })
      store.addInboxEntries(watchOf(store, 'asked'), [found('2609.27001')])
      const before = ['inbox.json', 'discovery/delivered.json', 'state.json']
        .map((name) => readFileSync(join(vault, '.meridian', name), 'utf8'))
      expect(store.undelivered([discovered('2609.27001'), discovered('2609.27002')]).map((paper) => paper.id)).toEqual(['2609.27002'])
      expect(['inbox.json', 'discovery/delivered.json', 'state.json']
        .map((name) => readFileSync(join(vault, '.meridian', name), 'utf8'))).toEqual(before)
    })

    it('真实实现:送来的论文带 DOI 时,收件记录顶层存着它', () => {
      const project = store.createProject('存 DOI')
      store.addDiscoveryEntries(project, [Object.assign(discovered('2609.21201'), { doi: '10.1145/3600006.3613166' })])
      expect((JSON.parse(readFileSync(join(vault, '.meridian', 'inbox.json'), 'utf8')) as Record<string, unknown>[])
        .find((entry) => entry['arxiv'] === '2609.21201')).toMatchObject({ doi: '10.1145/3600006.3613166' })
    })

    it('真实实现:送过的论文记在 .meridian/discovery/delivered.json,删掉关注、重开库之后也不再送', () => {
      store.createWatch({ type: 'topic', name: 'kept' })
      expect(store.addInboxEntries(watchOf(store, 'kept'), [found('2609.25001')])).toEqual(['2609.25001'])
      store.deleteWatch(watchOf(store, 'kept'))
      expect(JSON.parse(readFileSync(join(vault, '.meridian', 'inbox.json'), 'utf8'))).toEqual([])
      expect(JSON.parse(readFileSync(join(vault, '.meridian', 'discovery', 'delivered.json'), 'utf8')))
        .toEqual([expect.objectContaining({ keys: ['arxiv:2609.25001'], title: 'shared260925001', year: 2026 })])
      const reopened = createVaultStore(vault)
      reopened.createWatch({ type: 'topic', name: 'kept again' })
      expect(reopened.addInboxEntries(watchOf(reopened, 'kept again'), [found('2609.25001')])).toEqual([])
    })
  })

  describe('形状对拍', () => {
    for (const [method, { call, schema }] of Object.entries(KNOWLEDGE)) {
      it(`${method} 在 fixture 与真实实现上给出同一个契约形状`, () => {
        expect(() => schema.parse(call(createFixtureStore()))).not.toThrow()
        expect(() => schema.parse(call(store))).not.toThrow()
      })
    }
  })

  it('桌面 fallback 能从空目录初始化，并在重开后保留上传与笔记', () => {
    const fresh = join(vault, 'desktop-fallback')
    const fallback = createDesktopVaultStore(fresh, () => '2026-09-14')
    expect(fallback.listPapers({ page: 1, size: 10 })).toEqual({ rows: [], total: 0 })
    expect(fallback.wikiHome()).toMatchObject({
      aggregationCount: 0,
      kinds: [
        { key: 'topic', label: '主题', dir: 'topics', count: 0 },
        { key: 'method', label: '方法', dir: 'methods', count: 0 },
      ],
      roots: [],
    })
    const added = fallback.importPaper(
      'First Paper.pdf', Uint8Array.from(Buffer.from('%PDF-1.7\n%%EOF')),
    ).paper
    fallback.mutatePaperReading(added.id, { kind: 'note.add', page: 1, text: '第一条笔记' })

    const reopened = createVaultStore(fresh, () => '2026-09-14')
    expect(reopened.getPaper(added.id).title).toBe('First Paper')
    expect(reopened.paperReading(added.id).notes[0]?.text).toBe('第一条笔记')
  })

  it('论文行带上记着它的项目,按项目名能筛能分组,结论数加上引它的项目结论', async () => {
    const before = store.getPaper(WITH_SOURCE).conclusionCount
    store.createProject('项目甲')
    const id = store.listProjects().find((project) => project.name === '项目甲')!.id
    await store.addPaper(id, WITH_SOURCE)
    await store.createConclusion(id, '引了这一篇', { paper: WITH_SOURCE })
    expect(store.getPaper(WITH_SOURCE).projects).toEqual([{ id, name: '项目甲' }])
    expect(store.getPaper(WITH_SOURCE).conclusionCount).toBe(before + 1)
    expect(store.listPapers({ page: 1, size: 5, filter: '项目甲' }).rows.map((paper) => paper.id))
      .toEqual([WITH_SOURCE])
    expect(store.facetPapers('projects'))
      .toEqual([expect.objectContaining({ value: '项目甲', count: 1 })])
    expect(store.listPapers({
      page: 1, size: 5, facet: { field: 'projects', value: '项目甲' },
    }).total).toBe(1)
    await store.updateProject(id, { name: '项目乙' })
    expect(store.getPaper(WITH_SOURCE).projects).toEqual([{ id, name: '项目乙' }])
  })

  it('项目发现档案从关联论文取种子,结果与反馈重开后仍保留', async () => {
    store.updatePaper(WITH_SOURCE, { identifier: 'arXiv:2211.17192' })
    store.createProject('发现项目')
    const projectId = store.listProjects().find((project) => project.name === '发现项目')!.id
    await store.addPaper(projectId, WITH_SOURCE)
    expect(store.listDiscoveryProfiles()).toContainEqual({
      id: projectId, name: '发现项目', seedCount: 1, positiveCount: 0, negativeCount: 0,
      intentCount: 1, lastFetchedAt: null,
      intents: [expect.objectContaining({
        core: true, enabled: true, seedCount: 1,
        seeds: [{ id: 'ARXIV:2211.17192', title: expect.any(String) }],
      })],
    })
    expect(store.discoverySeeds(projectId).positive).toEqual(['ARXIV:2211.17192'])
    expect(store.discoveryProfile(projectId).wikiTerms).toEqual([
      ...store.getPaper(WITH_SOURCE).topics, ...store.getPaper(WITH_SOURCE).methods,
    ])
    expect(store.addDiscoveryEntries(projectId, [{
      semanticId: 'semantic-new', id: '2609.88881', title: 'A Project Discovery',
      authors: ['Ada'], abstract: 'A', submitted: '2026-09-08', journalRef: null,
      pdf: 'https://arxiv.org/pdf/2609.88881',
    }])).toBe(1)
    const entry = store.listInbox({ kind: 'discovery', project: projectId })[0]!
    store.feedbackDiscovery(entry.id, 'more')

    const reopened = createVaultStore(vault)
    expect(reopened.listInbox({ kind: 'discovery', project: projectId })[0])
      .toMatchObject({ id: entry.id, feedback: 'more' })
    expect(reopened.discoverySeeds(projectId).positive)
      .toEqual(['ARXIV:2211.17192', 'semantic-new'])
  })

  it('项目发现的锚点带上项目的每一个主题,没有主题时不带新项目的默认值', async () => {
    const id = store.createProject('发现锚点')
    expect(store.discoveryProfile(id).anchorText).not.toContain(DEFAULT_PROJECT_TOPIC)
    await store.updateProject(id, { topics: ['KV cache', '低比特量化'] })
    expect(store.discoveryProfile(id).anchorText).toMatch(/KV cache · 低比特量化/)
  })

  it('推荐方向的核心与启停偏好重开后仍保留,且不写入 Wiki 页面', async () => {
    store.updatePaper(WITH_SOURCE, { identifier: 'arXiv:2211.17192' })
    const imported = store.importPaper(
      'second.pdf', minimalPdf({ lines: ['Unrelated Graph Retrieval'] }),
    ).paper
    store.fillPaperMetadata(imported.id, {
      title: 'Unrelated Graph Retrieval', authors: ['Ada'], abstract: '',
      identifier: 'arXiv:2609.99990',
    }, imported.title)
    store.createProject('方向偏好')
    const projectId = store.listProjects().find((project) => project.name === '方向偏好')!.id
    await store.addPaper(projectId, WITH_SOURCE)
    await store.addPaper(projectId, imported.id)
    const projectPage = join(vault, 'wiki', 'projects', `${projectId}.md`)
    const beforeWiki = readFileSync(projectPage, 'utf8')
    const before = store.listDiscoveryProfiles().find((profile) => profile.id === projectId)!
    expect(before.intents).toHaveLength(2)
    const nextCore = before.intents.find((intent) => !intent.core)!
    const disabled = before.intents.find((intent) => intent.core)!
    store.setDiscoveryIntent(projectId, nextCore.id, 'set-core')
    store.setDiscoveryIntent(projectId, disabled.id, 'disable')

    const reopened = createVaultStore(vault)
    const after = reopened.listDiscoveryProfiles().find((profile) => profile.id === projectId)!
    expect(after.intents.find((intent) => intent.id === nextCore.id))
      .toMatchObject({ core: true, enabled: true })
    expect(after.intents.find((intent) => intent.id === disabled.id)?.enabled).toBe(false)
    expect(readFileSync(projectPage, 'utf8')).toBe(beforeWiki)
  })

  it('阻塞:写上就在页上多一行,清掉就把那一行去掉,撤销放回原样', async () => {
    store.createProject('阻塞')
    const id = store.listProjects().find((project) => project.name === '阻塞')!.id
    const file = join(vault, 'wiki', 'projects', `${id}.md`)
    const before = readFileSync(file, 'utf8')
    expect((await store.updateProject(id, { block: '等 A100 机时' })).block).toBe('等 A100 机时')
    expect(readFileSync(file, 'utf8')).toMatch(/^block: "等 A100 机时"$/m)
    expect(store.listProjects().find((project) => project.id === id)!.block).toBe('等 A100 机时')
    const cleared = await store.updateProject(id, { block: null })
    expect('block' in cleared).toBe(false)
    expect(readFileSync(file, 'utf8')).toBe(before)
    store.undoChange(store.listChanges()[0]!.id)
    expect((await createVaultStore(vault).getProject(id)).block).toBe('等 A100 机时')
  })

  it('随笔里有 #、## 或 ### 开头的行:存下、重开都是整段随笔,撤销后页上只剩改之前那段', async () => {
    store.createProject('随笔小标题')
    const id = store.listProjects().find((project) => project.name === '随笔小标题')!.id
    const file = join(vault, 'wiki', 'projects', `${id}.md`)
    await store.updateProject(id, { memo: '改之前的想法' })
    const before = readFileSync(file, 'utf8')
    const memo = '## 小结\n\n小结下面的话\n\n# 一级标题\n### 三级标题'
    await store.updateProject(id, { memo })
    expect((await createVaultStore(vault).getProject(id)).memo).toBe(memo)
    store.undoChange(store.listChanges()[0]!.id)
    expect((await createVaultStore(vault).getProject(id)).memo).toBe('改之前的想法')
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('主题:给几个时页上 topic 是第一个、topics 是全部,清空回到新项目的默认值;重开库读出来一样', async () => {
    const id = store.createProject('几个主题')
    const file = join(vault, 'wiki', 'projects', `${id}.md`)
    const before = readFileSync(file, 'utf8')
    expect(await store.updateProject(id, { topics: ['KV cache', '量化'] })).toMatchObject({ topic: 'KV cache', topics: ['KV cache', '量化'] })
    expect(readFileSync(file, 'utf8')).toMatch(/^topic: "KV cache"\n[^]*^topics:\n {2}- "KV cache"\n {2}- "量化"\n/m)
    expect(await createVaultStore(vault).getProject(id)).toMatchObject({ topic: 'KV cache', topics: ['KV cache', '量化'] })
    expect(store.listProjects().find((project) => project.id === id)).toMatchObject({ topics: ['KV cache', '量化'] })
    expect(store.overviewProjects().find((project) => project.id === id)).toMatchObject({ topic: 'KV cache', topics: ['KV cache', '量化'] })
    const cleared = await store.updateProject(id, { topics: [] })
    expect(cleared.topic).toBe(DEFAULT_PROJECT_TOPIC)
    expect('topics' in cleared).toBe(false)
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  describe('项目的主题是 Wiki 的主题页', () => {
    /** The text of project `id`'s page. */
    const pageOf = (id: string) => readFileSync(join(vault, 'wiki', 'projects', `${id}.md`), 'utf8')
    /** Rewrites project `id`'s page the way App 0.0.21.4 stores areas: `topic`, `topics` while several, and no `topic_pages`. */
    const asOldApp = (id: string, areas: string[]) => {
      const file = join(vault, 'wiki', 'projects', `${id}.md`)
      const rows = readFileSync(file, 'utf8').split('\n').filter((row) => !/^topics?:|^topic_pages:|^ {2}- "|^ {2}- page:|^ {4}title:/.test(row))
      const at = rows.indexOf('focus: "定义第一步"')
      rows.splice(at, 0, `topic: ${JSON.stringify(areas[0] ?? DEFAULT_PROJECT_TOPIC)}`,
        ...(areas.length > 1 ? ['topics:', ...areas.map((area) => `  - ${JSON.stringify(area)}`)] : []))
      writeFileSync(file, rows.join('\n'), 'utf8')
    }

    it('选已有的主题按名字对上那一页,标题用页上的;打一个新名字就新建一个主题页;页上记下每个主题的页', async () => {
      const id = store.createProject('主题')
      const project = await store.updateProject(id, { topics: ['speculative  DECODING', '低比特量化'] })
      expect(project).toMatchObject({
        topic: 'Speculative decoding', topics: ['Speculative decoding', '低比特量化'],
        topicPages: ['topics/speculative-decoding', 'topics/低比特量化'],
      })
      expect(store.wikiCards().find((card) => card.id === 'topics/低比特量化')).toMatchObject({ kind: 'topic', title: '低比特量化' })
      expect(pageOf(id)).toContain([
        'topic_pages:', '  - page: "topics/speculative-decoding"', '    title: "Speculative decoding"',
        '  - page: "topics/低比特量化"', '    title: "低比特量化"',
      ].join('\n'))
      expect((await createVaultStore(vault).getProject(id)).topicPages).toEqual(['topics/speculative-decoding', 'topics/低比特量化'])
    })

    it('新建主题页记一条 Wiki 变动,改项目的主题另记一条;撤销项目那条回到原来的主题', async () => {
      const id = store.createProject('主题撤销')
      await store.updateProject(id, { topics: ['低比特量化'] })
      expect(store.listChanges().slice(0, 2).map((change) => change.title)).toEqual(['项目「主题撤销」· 改了字段', 'Wiki · 新建主题「低比特量化」'])
      store.undoChange(store.listChanges()[0]!.id)
      expect(await store.getProject(id)).toMatchObject({ topic: DEFAULT_PROJECT_TOPIC })
      expect('topicPages' in await store.getProject(id)).toBe(false)
    })

    it('主题页改了名,项目的主题跟着显示新名字,项目页不用改', async () => {
      const id = store.createProject('改名')
      await store.updateProject(id, { topics: ['Draft acceptance'] })
      const before = pageOf(id)
      store.applyProposal({ source: 'user', title: '改名', ops: [{ op: 'setAggregationMetadata', page: 'topics/draft-acceptance', title: '草稿接受率', splitOn: null }] })
      expect(await store.getProject(id)).toMatchObject({ topic: '草稿接受率', topicPages: ['topics/draft-acceptance'] })
      expect(store.listProjects().find((p) => p.id === id)?.topic).toBe('草稿接受率')
      expect(pageOf(id)).toBe(before)
    })

    it('打开旧版写的库:每个领域对上同名的主题页,没有的新建一个,未分主题不建;记一条不能撤销的历史;再打开不再写', async () => {
      const [a, b, c] = ['旧一', '旧二', '旧三'].map((name) => store.createProject(name))
      asOldApp(a!, ['speculative decoding', '推理加速'])
      asOldApp(b!, ['推理加速'])
      asOldApp(c!, [])
      const opened = createVaultStore(vault)
      expect(await opened.getProject(a!)).toMatchObject({
        topic: 'Speculative decoding', topics: ['Speculative decoding', '推理加速'],
        topicPages: ['topics/speculative-decoding', 'topics/推理加速'],
      })
      expect((await opened.getProject(b!)).topicPages).toEqual(['topics/推理加速'])
      expect(await opened.getProject(c!)).toMatchObject({ topic: DEFAULT_PROJECT_TOPIC })
      expect(opened.wikiCards().filter((card) => card.title === '推理加速')).toHaveLength(1)
      expect(pageOf(a!)).toContain('topic_pages:\n  - page: "topics/speculative-decoding"\n    title: "speculative decoding"\n')
      expect(pageOf(a!)).toMatch(/^topic: "speculative decoding"$/m)
      expect(pageOf(c!)).not.toContain('topic_pages:')
      const [history] = opened.listChanges()
      expect(history).toMatchObject({ title: '项目的领域并入主题', source: 'Meridian', undoable: false })
      expect(history!.diff).toEqual(['+ topics/推理加速', `~ projects/${a}`, `~ projects/${b}`])
      const pages = [a, b, c].map((id) => pageOf(id!))
      const again = createVaultStore(vault)
      expect([a, b, c].map((id) => pageOf(id!))).toEqual(pages)
      expect(again.listChanges()[0]!.id).toBe(history!.id)
    })

    it('旧版 App 后来又改了领域:再打开时只给改过的那个项目重新对页', async () => {
      const id = store.createProject('旧版又改')
      await store.updateProject(id, { topics: ['Draft acceptance'] })
      asOldApp(id, ['Draft acceptance', 'KV 量化'])
      const opened = createVaultStore(vault)
      expect((await opened.getProject(id)).topicPages).toEqual(['topics/draft-acceptance', 'topics/kv-量化'])
      expect(opened.listChanges()[0]!.diff).toEqual(['+ topics/kv-量化', `~ projects/${id}`])
    })

    it('主题页不在了:项目不显示这个主题,页上照旧记着;页回来了主题也回来;改主题时它不丢', async () => {
      const id = store.createProject('页不在')
      await store.updateProject(id, { topics: ['Draft acceptance', 'Speculative decoding'] })
      const topicFile = join(vault, 'wiki', 'topics', 'draft-acceptance.md')
      const text = readFileSync(topicFile, 'utf8')
      rmSync(topicFile)
      const opened = createVaultStore(vault)
      expect(await opened.getProject(id)).toMatchObject({ topic: 'Speculative decoding', topicPages: ['topics/speculative-decoding'] })
      await opened.updateProject(id, { topics: ['Speculative decoding', 'Mixtral'] })
      expect(pageOf(id)).toContain('  - page: "topics/draft-acceptance"\n    title: "Draft acceptance"\n')
      writeFileSync(topicFile, text, 'utf8')
      expect(await createVaultStore(vault).getProject(id)).toMatchObject({
        topics: ['Speculative decoding', 'Mixtral', 'Draft acceptance'],
        topicPages: ['topics/speculative-decoding', 'topics/mixtral', 'topics/draft-acceptance'],
      })
    })

    it('项目列表与总览带上主题的范围:主题自己的页和它上面的每一层', async () => {
      store.applyProposal({ source: 'user', title: '归到下面', ops: [{ op: 'setParents', page: 'topics/draft-acceptance', parents: ['topics/speculative-decoding'] }] })
      const id = store.createProject('范围')
      await store.updateProject(id, { topics: ['Draft acceptance'] })
      expect(store.listProjects().find((p) => p.id === id)?.topicScope).toEqual(['topics/draft-acceptance', 'topics/speculative-decoding'])
      expect(store.overviewProjects().find((p) => p.id === id)?.topicScope).toEqual(['topics/draft-acceptance', 'topics/speculative-decoding'])
    })
  })

  it('测试库与新建的库同一个结构,聚合页的生成区就是 Core 回填出来的样子', () => {
    const parent = mkdtempSync(join(tmpdir(), 'meridian-made-'))
    try {
      const made = prepareSelectedLibrary(join(parent, 'library'), new Date('2026-09-14T12:00:00Z'))
      const data = readWikiData(join(vault, 'wiki'))!
      expect({ ...data, pages: {} }).toEqual({ ...readWikiData(made.wiki)!, pages: {} })
      expect(Object.keys(data.pages)).toEqual([
        'papers/13979-STAR-Speculative-Decodin', 'papers/Jiang-et-al-2024-Mixtral-of-Experts',
        'topics/draft-acceptance', 'topics/speculative-decoding', 'methods/kv-compression',
      ])
      for (const id of ['topics/draft-acceptance', 'topics/speculative-decoding', 'methods/kv-compression']) {
        const text = readFileSync(join(vault, 'wiki', `${id}.md`), 'utf8')
        expect(text).toContain(`<!-- generated:children -->\n${generatedChildren(data, id)}\n<!-- /generated -->`)
        expect(text).toContain(`<!-- generated:table -->\n${generatedTable(data, id)}\n<!-- /generated -->`)
      }
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  it('库里没有 wiki/papers 时开库就报出缺的那个目录,不往库里写任何东西', () => {
    const bare = mkdtempSync(join(tmpdir(), 'meridian-bare-'))
    try {
      expect(() => createVaultStore(bare)).toThrow(`库里没有论文页目录：${join(bare, 'wiki', 'papers')}`)
      expect(readdirSync(bare)).toEqual([])
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })

  it('库里没有 wiki/schema.yaml 时开库就报出缺的那个文件,不往库里写任何东西', () => {
    const bare = mkdtempSync(join(tmpdir(), 'meridian-noschema-'))
    try {
      cpSync(VAULT, bare, { recursive: true })
      rmSync(join(bare, 'wiki', 'schema.yaml'))
      expect(() => createVaultStore(bare)).toThrow(`库里没有 Wiki 结构文件：${join(bare, 'wiki', 'schema.yaml')}`)
      expect(existsSync(join(bare, '.meridian'))).toBe(false)
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })

  it('论文列表读的是库里的论文页,一页一行,行的 id 是页的文件名', () => {
    const list = store.listPapers({ page: 1, size: 10 })
    expect(list.total).toBe(2)
    expect(list.rows.map((r) => r.id).sort())
      .toEqual(['13979-STAR-Speculative-Decodin', 'Jiang-et-al-2024-Mixtral-of-Experts'])
  })

  it('论文的每一项都来自那一页:主题与方法是归属的标题', () => {
    expect(store.getPaper(WITH_SOURCE)).toEqual({
      id: WITH_SOURCE,
      title: 'STAR: SPECULATIVE DECODING WITH SEARCHABLE DRAFTING AND TARGET-AWARE REFINEMENT FOR MULTIMODAL GENERATION',
      // Omit publication year when absent in frontmatter; venue is required by the contract, so use an empty string.
      venue: '',
      topics: ['Speculative decoding', 'Draft acceptance'],
      methods: ['KV-cache compression'],
      datasets: [],
      metrics: [],
      pageState: 'draft',
      // Supply a default read state at read time without modifying a page that lacks `read_state`.
      readState: '未读',
      projects: [],
      pageCount: 0,
      noteCount: 0,
      conclusionCount: 0,
      // Core expands a legacy creation date into a sortable UTC ingestion timestamp.
      addedAt: '2026-05-20T00:00:00.000Z',
      updated: '2026-05-20',
      custom: {},
    })
  })

  it('人工校正书目字段不动原 PDF,重开仍在并且整次可撤销', () => {
    const before = store.paperSource(WITH_SOURCE)
    store.updatePaper(WITH_SOURCE, {
      title: 'STAR Revised', shortTitle: 'STAR-R', authors: ['A. Author', 'B. Author'],
      year: 2026, venue: 'ICLR', rating: 5, identifier: 'arXiv:2601.00001',
      submitted: '2026-01-02',
    })
    const reopened = createVaultStore(vault)
    expect(reopened.getPaper(WITH_SOURCE)).toMatchObject({
      title: 'STAR Revised', shortTitle: 'STAR-R', authors: ['A. Author', 'B. Author'],
      year: 2026, venue: 'ICLR', rating: 5, identifier: 'arXiv:2601.00001',
      submitted: '2026-01-02',
    })
    expect(reopened.paperSource(WITH_SOURCE)).toEqual(before)
    reopened.undoChange(reopened.listChanges()[0]!.id)
    expect(reopened.getPaper(WITH_SOURCE)).not.toHaveProperty('rating')
    expect(reopened.getPaper(WITH_SOURCE).title).toContain('STAR:')
  })

  it('两页记着同一份原文时,两页都列得出、改得动、删得掉', () => {
    const dir = join(vault, 'wiki', 'papers')
    copyFileSync(join(dir, `${WITH_SOURCE}.md`), join(dir, 'STAR-again.md'))
    const both = createVaultStore(vault)

    expect(both.listPapers({ page: 1, size: 10 }).total).toBe(3)
    expect(both.listPapers({ page: 1, size: 10 }).rows.map((r) => r.id))
      .toContain('STAR-again')
    // Two pages reference one source, so both return identical source bytes.
    expect(both.paperSource('STAR-again')).toEqual(both.paperSource(WITH_SOURCE))

    both.updatePaper('STAR-again', { readState: '在读' })
    expect(both.getPaper('STAR-again').readState).toBe('在读')
    // Only the selected page changes; the other page sharing its source remains untouched.
    expect(both.getPaper(WITH_SOURCE).readState).toBe('未读')
    expect(readFileSync(join(dir, `${WITH_SOURCE}.md`), 'utf8')).not.toContain('read_state')

    both.deletePaper('STAR-again')
    expect(both.listPapers({ page: 1, size: 10 }).total).toBe(2)
    expect(both.getPaper(WITH_SOURCE).title).toContain('STAR')
  })

  it('两页记着同一份原文这件事被当成数据质量信号报出来,不是藏掉一页', async () => {
    const dir = join(vault, 'wiki', 'papers')
    copyFileSync(join(dir, `${WITH_SOURCE}.md`), join(dir, 'STAR-again.md'))
    const said = JSON.stringify(await createVaultStore(vault).listFeed())
    expect(said).toContain(SOURCE_ID)
    expect(said).toContain('STAR-again')
    expect(said).toContain(WITH_SOURCE)
    // Report the condition only once.
    expect((await createVaultStore(vault).listFeed()).length)
      .toBe(JSON.parse(said).length)
  })

  it('每页原文各一份的库不报这件事', async () => {
    expect(JSON.stringify(await store.listFeed())).not.toContain('各被不止一页记着')
  })

  it('库里没有发表年份,论文行就不带 year,也不拿 updated 折算一个出来', () => {
    expect(store.listPapers({ page: 1, size: 10 }).rows.map((r) => r.year))
      .toEqual([undefined, undefined])
    // Without years there is no distinguishing key, so ascending and descending year order are identical.
    const ids = (direction: 'asc' | 'desc') =>
      store.listPapers({ page: 1, size: 10, sort: 'year', direction }).rows.map((r) => r.id)
    expect(ids('desc')).toEqual(ids('asc'))
  })

  it('按主题分组的计数与按该主题取回的列表总数一致', () => {
    const draft = store.facetPapers('topics').find((f) => f.value === 'Draft acceptance')
    expect(draft?.count).toBe(1)
    expect(store.listPapers({
      page: 1, size: 10, facet: { field: 'topics', value: 'Draft acceptance' },
    }).total).toBe(1)
  })

  it('取不存在的页会抛出而不是给一页空的', async () => {
    expect(() => store.wikiPaper('papers/no-such-paper')).toThrow(/no-such-paper/)
    await expect(store.wikiAggregation('topics/no-such-topic')).rejects.toThrow(/no-such-topic/)
    expect(() => store.getPaper('no-such-paper')).toThrow(/no-such-paper/)
  })

  it('搜索命中库里的论文与聚合页', () => {
    const hits = store.search('STAR')
    expect(hits.some((h) => h.kind === 'paper' && h.title.includes('STAR:'))).toBe(true)
    expect(store.search('Draft acceptance')).toEqual([
      expect.objectContaining({ kind: 'aggregation', target: 'topics/draft-acceptance' }),
    ])
    expect(store.search('   ')).toEqual([])
  })

  it('搜索也带上库里的项目与对话', () => {
    store.createProject('draft 效率')
    store.createChat('draft 那条会话', true)
    const hits = store.search('draft')
    expect(hits.some((h) => h.kind === 'project')).toBe(true)
    expect(hits.some((h) => h.kind === 'chat')).toBe(true)
  })

  it('取一篇论文的原文,拿到的是库里那个 PDF 文件本身', () => {
    const bytes = Buffer.from(store.paperSource(WITH_SOURCE))
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('库里没有原文的那一篇会抛出而不是返回空', () => {
    rmSync(join(vault, 'sources', 'papers', `${SOURCE_ID}-13979-STAR-Speculative-Decodin.pdf`))
    expect(() => createVaultStore(vault).paperSource(WITH_SOURCE)).toThrow(/原文/)
    expect(() => store.paperSource('no-such-paper')).toThrow(/no-such-paper/)
  })

  it('上传 PDF 会持久化不可变原文与论文页,相同内容重复上传只返回已有论文', () => {
    const bytes = Uint8Array.from(Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF'))
    store = createVaultStore(
      vault, () => '2026-09-15', () => new Date('2026-09-15T14:03:02.001Z'),
    )
    const added = store.importPaper('A Useful Paper.pdf', bytes)
    expect(added).toMatchObject({ kind: 'added', paper: { title: 'A Useful Paper', readState: '未读' } })
    expect(added.paper.addedAt).toBe('2026-09-15T14:03:02.001Z')
    expect(store.listLater().map((entry) => entry.paper)).not.toContain(added.paper.id)
    expect(store.fillPaperMetadata(added.paper.id, {
      title: 'A Useful Paper, Parsed', authors: ['Mei Lin'], year: 2025, venue: 'arXiv', abstract: 'Summary.',
    }, 'A Useful Paper')).toEqual(['title', 'authors', 'year', 'venue', 'abstract'])
    expect(createVaultStore(vault).getPaper(added.paper.id)).toMatchObject({
      title: 'A Useful Paper, Parsed', authors: ['Mei Lin'], year: 2025, venue: 'arXiv', abstract: 'Summary.',
      addedAt: '2026-09-15T14:03:02.001Z',
    })
    expect(Buffer.from(store.paperSource(added.paper.id))).toEqual(Buffer.from(bytes))
    expect(readFileSync(join(vault, 'wiki', 'papers', `${added.paper.id}.md`), 'utf8'))
      .toContain('added_at: "2026-09-15T14:03:02.001Z"')
    expect(readFileSync(join(vault, 'wiki', 'papers', `${added.paper.id}.md`), 'utf8'))
      .toContain('source_id: "paper-pdf-')

    expect(store.importPaper('renamed.pdf', bytes).kind).toBe('existing')
    expect(createVaultStore(vault).getPaper(added.paper.id).title).toBe('A Useful Paper, Parsed')
  })

  it('删掉的论文重新导入后占了原来的文件名，从垃圾桶恢复被拒，新导入的那页一个字节不动，垃圾桶里那一条还在', () => {
    const bytes = Uint8Array.from(Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF'))
    const deleted = store.importPaper('A Useful Paper.pdf', bytes).paper
    store.deletePaper(deleted.id)
    const entry = store.listTrash()[0]!
    const again = store.importPaper('A Useful Paper.pdf', bytes).paper
    expect(again.id).toBe(deleted.id)
    store.updatePaper(again.id, { title: '重新导入的那篇' })
    const page = join(vault, 'wiki', 'papers', `${again.id}.md`)
    const held = readFileSync(page, 'utf8')
    expect(store.listTrash().find((item) => item.id === entry.id)!.restorable).toBe(false)
    expect(() => store.restoreTrash(entry.id)).toThrow(/占/)
    expect(readFileSync(page, 'utf8')).toBe(held)
    expect(store.getPaper(again.id).title).toBe('重新导入的那篇')
    expect(store.listTrash().map((item) => item.id)).toContain(entry.id)
    expect(existsSync(join(vault, '.meridian', 'trash', `${entry.id}.md`))).toBe(true)
    expect(createVaultStore(vault).getPaper(again.id).title).toBe('重新导入的那篇')
    store.deletePaper(again.id)
    expect(store.listTrash().find((item) => item.id === entry.id)!.restorable).toBe(true)
    store.restoreTrash(entry.id)
    expect(store.getPaper(deleted.id).title).toBe('A Useful Paper')
  })

  it('删掉的项目原来的页位置被别的程序写了一页时，从垃圾桶恢复被拒，那一页一个字节不动，垃圾桶里那一条还在', () => {
    const id = store.createProject('删掉的项目')
    store.deleteProject(id)
    const entry = store.listTrash()[0]!
    const page = join(vault, 'wiki', 'projects', `${id}.md`)
    writeFileSync(page, '---\ntype: "project"\n---\n# 别的程序写的\n', 'utf8')
    expect(() => store.restoreTrash(entry.id)).toThrow(/占/)
    expect(readFileSync(page, 'utf8')).toBe('---\ntype: "project"\n---\n# 别的程序写的\n')
    expect(store.listTrash().map((item) => item.id)).toContain(entry.id)
    expect(existsSync(join(vault, '.meridian', 'trash', `${entry.id}.md`))).toBe(true)
  })

  it('阅读高亮与笔记由 Core 指派身份并持久化,重开库仍能读到', () => {
    const highlighted = store.mutatePaperReading(WITH_SOURCE, {
      kind: 'highlight.add', page: 2, quote: 'target-aware refinement', color: 'yellow',
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
    })
    const highlight = highlighted.highlights[0]!
    expect(highlight).toMatchObject({ page: 2, quote: 'target-aware refinement', note: '' })
    expect(highlight.id).toMatch(/^highlight-/)

    store.mutatePaperReading(WITH_SOURCE, {
      kind: 'highlight.update', id: highlight.id, note: '和 draft tree 对照',
    })
    const noted = store.mutatePaperReading(WITH_SOURCE, {
      kind: 'note.add', page: 1, text: '先复现实验设置',
    })
    expect(noted.notes[0]?.id).toMatch(/^note-/)
    expect(store.getPaper(WITH_SOURCE).noteCount).toBe(2)

    const reopened = createVaultStore(vault)
    expect(reopened.paperReading(WITH_SOURCE)).toEqual(noted)
    expect(reopened.getPaper(WITH_SOURCE).noteCount).toBe(2)
  })

  it('老的阅读侧车没有随笔与读到哪页也读得进来;存下的随笔与读到第几页重开库还在', () => {
    mkdirSync(join(vault, '.meridian'), { recursive: true })
    writeFileSync(
      join(vault, '.meridian', 'paper-readings.json'),
      JSON.stringify([{ paperId: WITH_SOURCE, highlights: [], notes: [] }]),
    )
    const legacy = createVaultStore(vault)
    expect(legacy.paperReading(WITH_SOURCE)).toEqual({
      paperId: WITH_SOURCE, highlights: [], notes: [], remark: '',
    })
    legacy.mutatePaperReading(WITH_SOURCE, { kind: 'remark.set', text: '整篇的随想' })
    legacy.mutatePaperReading(WITH_SOURCE, { kind: 'progress.set', page: 4 })
    expect(createVaultStore(vault).paperReading(WITH_SOURCE))
      .toMatchObject({ remark: '整篇的随想', lastPage: 4 })
  })

  it('论文行带着这一篇的随笔,取自阅读记录;重开还在,清空之后行上没有这一项', () => {
    expect(store.getPaper(WITH_SOURCE)).not.toHaveProperty('remark')
    store.mutatePaperReading(WITH_SOURCE, { kind: 'remark.set', text: '整篇的随想' })
    expect(store.getPaper(WITH_SOURCE).remark).toBe('整篇的随想')
    expect(createVaultStore(vault).getPaper(WITH_SOURCE).remark).toBe('整篇的随想')
    store.mutatePaperReading(WITH_SOURCE, { kind: 'remark.set', text: '' })
    expect(store.getPaper(WITH_SOURCE)).not.toHaveProperty('remark')
  })

  it('论文进垃圾桶时阅读记录跟着进去,恢复时一起回来;彻底删除把它丢掉', () => {
    const sidecar = () => readFileSync(join(vault, '.meridian', 'paper-readings.json'), 'utf8')
    const bin = () => readFileSync(join(vault, '.meridian', 'trash.json'), 'utf8')
    const base = store.getPaper(WITH_SOURCE).noteCount
    store.mutatePaperReading(WITH_SOURCE, { kind: 'note.add', page: 1, text: '跟着论文走' })

    store.deletePaper(WITH_SOURCE)
    expect(sidecar()).not.toContain('跟着论文走')
    expect(bin()).toContain('跟着论文走')

    store.restoreTrash(store.listTrash()[0]!.id)
    expect(store.paperReading(WITH_SOURCE).notes.map((note) => note.text)).toEqual(['跟着论文走'])
    expect(store.getPaper(WITH_SOURCE).noteCount).toBe(base + 1)
    expect(createVaultStore(vault).paperReading(WITH_SOURCE).notes.map((note) => note.text))
      .toEqual(['跟着论文走'])

    store.deletePaper(WITH_SOURCE)
    store.purgeTrash(store.listTrash()[0]!.id)
    expect(bin()).not.toContain('跟着论文走')
    expect(sidecar()).not.toContain('跟着论文走')
  })

  it('撤销删除把阅读记录放回来;清空垃圾桶把它一起清掉', () => {
    store.mutatePaperReading(WITH_SOURCE, { kind: 'note.add', page: 1, text: '撤销也回来' })
    store.deletePaper(WITH_SOURCE)
    store.undoChange(store.listChanges()[0]!.id)
    expect(store.paperReading(WITH_SOURCE).notes.map((note) => note.text)).toEqual(['撤销也回来'])
    store.deletePaper(WITH_SOURCE)
    store.clearTrash()
    expect(readFileSync(join(vault, '.meridian', 'trash.json'), 'utf8')).not.toContain('撤销也回来')
    expect(readFileSync(join(vault, '.meridian', 'paper-readings.json'), 'utf8'))
      .not.toContain('撤销也回来')
  })

  it('撤销改过的批注、删掉的笔记与高亮、改过的随笔,写回阅读记录,论文行跟着变,重开库还在', () => {
    store.mutatePaperReading(WITH_SOURCE, { kind: 'note.add', page: 1, text: '删了又回来' })
    store.mutatePaperReading(WITH_SOURCE, {
      kind: 'highlight.add', page: 2, quote: '删了又回来的那句', color: 'yellow',
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
    })
    const before = store.mutatePaperReading(WITH_SOURCE, { kind: 'remark.set', text: '原来的随笔' })
    store.mutatePaperReading(WITH_SOURCE, { kind: 'highlight.update', id: before.highlights[0]!.id, note: '后来写的批注' })
    store.mutatePaperReading(WITH_SOURCE, { kind: 'note.delete', id: before.notes[0]!.id })
    store.mutatePaperReading(WITH_SOURCE, { kind: 'highlight.delete', id: before.highlights[0]!.id })
    store.mutatePaperReading(WITH_SOURCE, { kind: 'remark.set', text: '' })
    expect(store.getPaper(WITH_SOURCE)).toMatchObject({ noteCount: 0 })

    for (const change of store.listChanges().slice(0, 4)) store.undoChange(change.id)
    expect(store.paperReading(WITH_SOURCE)).toEqual(before)
    expect(store.getPaper(WITH_SOURCE)).toMatchObject({ remark: '原来的随笔', noteCount: 1 })
    expect(createVaultStore(vault).paperReading(WITH_SOURCE)).toEqual(before)
  })

  it('改论文写的是库里那一页,重开之后读到的还是新值', () => {
    store.updatePaper(WITH_SOURCE, { venue: 'ICLR 2026', readState: '在读' })
    expect(store.getPaper(WITH_SOURCE)).toMatchObject({ venue: 'ICLR 2026', readState: '在读' })
    expect(createVaultStore(vault).getPaper(WITH_SOURCE))
      .toMatchObject({ venue: 'ICLR 2026', readState: '在读' })
    expect(() => store.updatePaper('no-such-paper', { readState: '在读' })).toThrow(/no-such-paper/)
  })

  it('列配置存进 state.json,重开还在;固定列藏不了,坏 key 拒', () => {
    expect(store.paperColumns())
      .toEqual({ hidden: [], custom: [], groups: ['topics', 'projects', 'readState'] })
    store.setPaperColumns({
      hidden: ['topics'],
      custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
      groups: ['topics'],
    })
    expect(createVaultStore(vault).paperColumns()).toEqual({
      hidden: ['topics'],
      custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
      groups: ['topics'],
    })
    expect(() => store.setPaperColumns({ ...emptyColumns(), hidden: ['y'] })).toThrow(/固定列/)
    expect(() => store.setPaperColumns({ ...emptyColumns(), hidden: ['nope'] })).toThrow(/内置列/)
    expect(() => store.setPaperColumns({
      ...emptyColumns(), custom: [{ key: 'a b', label: 'x', type: 'text', options: [] }],
    })).toThrow(/key/)
    expect(() => store.setPaperColumns({
      ...emptyColumns(),
      custom: [
        { key: 'a', label: 'x', type: 'text', options: [] },
        { key: 'b', label: 'x', type: 'text', options: [] },
      ],
    })).toThrow(/列名重复/)
  })

  it('删掉一列记一条,撤销把列写回 state.json,重开还在,论文里那一格也回到表上', () => {
    store.setPaperColumns({ ...emptyColumns(), custom: [NOTE_COLUMN] })
    store.updatePaper(WITH_SOURCE, { custom: { note: '读到一半' } })
    const held = store.paperColumns()
    store.setPaperColumns({ ...held, custom: [] })
    expect(createVaultStore(vault).paperColumns().custom).toEqual([])

    store.undoChange(store.listChanges()[0]!.id)
    const reopened = createVaultStore(vault)
    expect(reopened.paperColumns()).toEqual(held)
    expect(reopened.getPaper(WITH_SOURCE).custom).toEqual({ note: '读到一半' })
  })

  it('新项目排最前;手动设的项目顺序存进 state.json 且新项目也排在它最前,重开还在;坏 id 被丢弃', () => {
    store.createProject('顺序甲')
    store.createProject('顺序乙')
    const a = store.listProjects().find((p) => p.name === '顺序甲')!
    const b = store.listProjects().find((p) => p.name === '顺序乙')!
    expect(store.listProjects().map((p) => p.id)).toEqual([b.id, a.id])
    store.reorderProjects([a!.id, b!.id, 'no-such-project'])
    const reordered = createVaultStore(vault).listProjects().map((p) => p.id)
    expect(reordered.indexOf(a!.id)).toBeLessThan(reordered.indexOf(b!.id))
    store.createProject('顺序丙')
    const c = store.listProjects().find((p) => p.name === '顺序丙')!
    expect(store.listProjects()[0]!.id).toBe(c.id)
  })

  it('论文推送配置有默认值，写进 state.json 后重开仍保留;每个范围的显示上限存在 state.json 顶层', () => {
    const state = () => JSON.parse(readFileSync(join(vault, '.meridian', 'state.json'), 'utf8')) as Record<string, unknown>
    expect(store.deliverySettings()).toEqual({ maxItemsPerRun: 10, maxShownPerScope: 20 })
    store.setDeliverySettings({ maxItemsPerRun: 7, maxShownPerScope: 12 })
    expect(createVaultStore(vault).deliverySettings()).toEqual({ maxItemsPerRun: 7, maxShownPerScope: 12 })
    expect(state()).toMatchObject({ deliverySettings: { maxItemsPerRun: 7 }, maxShownPerScope: 12 })
    expect(state()['deliverySettings']).toEqual({ maxItemsPerRun: 7 })
    store.setDeliverySettings({ maxItemsPerRun: 5 })
    expect(createVaultStore(vault).deliverySettings()).toEqual({ maxItemsPerRun: 5, maxShownPerScope: 20 })
    expect(state()).not.toHaveProperty('maxShownPerScope')
  })

  it('开发中写进 deliverySettings 里的每个范围显示上限照样读出,下次保存时搬到顶层', () => {
    const file = join(vault, '.meridian', 'state.json')
    writeFileSync(file, JSON.stringify({ seq: 0, deliverySettings: { maxItemsPerRun: 6, maxShownPerScope: 9 } }), 'utf8')
    const reopened = createVaultStore(vault)
    expect(reopened.deliverySettings()).toEqual({ maxItemsPerRun: 6, maxShownPerScope: 9 })
    reopened.setDeliverySettings(reopened.deliverySettings())
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ deliverySettings: { maxItemsPerRun: 6 }, maxShownPerScope: 9 })
    expect((JSON.parse(readFileSync(file, 'utf8')) as { deliverySettings: object }).deliverySettings).toEqual({ maxItemsPerRun: 6 })
  })

  it('上一批存下的列配置没有 type / options / groups,开库补齐', () => {
    const file = join(vault, '.meridian', 'state.json')
    writeFileSync(file, JSON.stringify({
      seq: 0, columns: { hidden: [], custom: [{ key: 'note', label: '备注' }] },
    }), 'utf8')
    expect(createVaultStore(vault).paperColumns()).toEqual({
      hidden: [],
      custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
      groups: ['topics', 'projects', 'readState'],
    })
  })

  it('存下的列配置还记着表上已经没有的列:开库时藏列、分组与列顺序里的那几项不算,改列照样写得进去', () => {
    const file = join(vault, '.meridian', 'state.json')
    writeFileSync(file, JSON.stringify({
      seq: 0,
      columns: {
        hidden: ['methods', 'datasets', 'venue'], custom: [], groups: ['topics', 'methods'],
        order: ['updated', 'venue', 'pages', 'short'],
      },
    }), 'utf8')
    const opened = createVaultStore(vault)
    expect(opened.paperColumns()).toEqual({ hidden: ['venue'], custom: [], groups: ['topics'], order: ['venue', 'short'] })
    expect(() => opened.setPaperColumns({ ...opened.paperColumns(), hidden: [] })).not.toThrow()
  })

  it('按选择列分组、筛选;文本列分不了组', () => {
    store.setPaperColumns({
      ...emptyColumns(),
      custom: [
        { key: 'du-fa', label: '读法', type: 'select', options: ['精读', '略读'] },
        { key: 'note', label: '备注', type: 'text', options: [] },
      ],
      groups: ['topics', 'du-fa'],
    })
    store.updatePaper(WITH_SOURCE, { custom: { 'du-fa': '精读' } })
    expect(store.facetPapers('du-fa'))
      .toEqual([{ value: '精读', count: 1, newestTitle: store.getPaper(WITH_SOURCE).title }])
    expect(store.listPapers({ page: 1, size: 10, facet: { field: 'du-fa', value: '精读' } })
      .rows.map((r) => r.id)).toEqual([WITH_SOURCE])
    expect(() => store.facetPapers('note')).toThrow(/不能按这一列分组/)
    expect(() => store.updatePaper(WITH_SOURCE, { custom: { 'du-fa': '通读' } }))
      .toThrow(/没有这个选项/)
  })

  it('阅读状态筛选与分组一起用:分组取值只数筛剩的论文,列表同时满足两者;文本列不能拿来筛', () => {
    store.setPaperColumns({
      ...emptyColumns(),
      custom: [
        { key: 'du-fa', label: '读法', type: 'select', options: ['精读', '略读'] },
        { key: 'note', label: '备注', type: 'text', options: [] },
      ],
    })
    const other = store.listPapers({ page: 1, size: 200 }).rows.find((row) => row.id !== WITH_SOURCE)!.id
    store.updatePaper(WITH_SOURCE, { readState: '在读', custom: { 'du-fa': '精读' } })
    store.updatePaper(other, { custom: { 'du-fa': '精读' } })
    const reading = [{ field: 'readState', value: '在读' }]
    expect(store.facetPapers('du-fa', undefined, reading))
      .toEqual([{ value: '精读', count: 1, newestTitle: store.getPaper(WITH_SOURCE).title }])
    expect(store.listPapers({ page: 1, size: 10, facet: { field: 'du-fa', value: '精读' }, filters: reading })
      .rows.map((r) => r.id)).toEqual([WITH_SOURCE])
    const byNote = [{ field: 'note', value: 'x' }]
    expect(() => store.listPapers({ page: 1, size: 10, filters: byNote })).toThrow(/不能按这一列分组/)
    expect(() => store.facetPapers('du-fa', undefined, byNote)).toThrow(/不能按这一列分组/)
  })

  it('选项改名把填着它的每一篇一起改,只记一条变动,撤销把论文与列都还原', () => {
    store.setPaperColumns({
      ...emptyColumns(),
      custom: [{ key: 'du-fa', label: '读法', type: 'select', options: ['精读', '略读'] }],
    })
    const ids = store.listPapers({ page: 1, size: 10 }).rows.map((r) => r.id)
    for (const id of ids) store.updatePaper(id, { custom: { 'du-fa': '精读' } })
    const before = store.listChanges().length

    store.renamePaperOption('du-fa', '精读', '细读')
    expect(ids.map((id) => store.getPaper(id).custom['du-fa'])).toEqual(ids.map(() => '细读'))
    expect(store.paperColumns().custom[0]!.options).toEqual(['细读', '略读'])
    expect(store.listChanges().length).toBe(before + 1)
    expect(store.listChanges()[0]!.title).toBe('论文表 · 列「读法」的选项 精读 → 细读')

    store.undoChange(store.listChanges()[0]!.id)
    expect(ids.map((id) => store.getPaper(id).custom['du-fa'])).toEqual(ids.map(() => '精读'))
    expect(store.paperColumns().custom[0]!.options).toEqual(['精读', '略读'])
  })

  it('还有论文填着的选项删不掉,state.json 一个字节不变', () => {
    store.setPaperColumns({
      ...emptyColumns(),
      custom: [{ key: 'du-fa', label: '读法', type: 'select', options: ['精读', '略读'] }],
    })
    store.updatePaper(WITH_SOURCE, { custom: { 'du-fa': '精读' } })
    const file = join(vault, '.meridian', 'state.json')
    const held = readFileSync(file, 'utf8')
    expect(() => store.setPaperColumns({
      ...emptyColumns(),
      custom: [{ key: 'du-fa', label: '读法', type: 'select', options: ['略读'] }],
    })).toThrow(/选项「精读」还有论文在用/)
    expect(readFileSync(file, 'utf8')).toBe(held)
  })

  it('自定义格写进论文页的 custom 块,行上读得到,撤销还原', () => {
    const file = join(vault, 'wiki', 'papers', `${WITH_SOURCE}.md`)
    const before = readFileSync(file, 'utf8')
    store.setPaperColumns({ ...emptyColumns(), custom: [NOTE_COLUMN] })
    store.updatePaper(WITH_SOURCE, { custom: { note: '读到一半' } })
    expect(store.getPaper(WITH_SOURCE).custom).toEqual({ note: '读到一半' })
    expect(readFileSync(file, 'utf8')).toContain('custom:\n  note: "读到一半"')
    expect(createVaultStore(vault).getPaper(WITH_SOURCE).custom).toEqual({ note: '读到一半' })
    store.undoChange(store.listChanges()[0]!.id)
    expect(readFileSync(file, 'utf8')).toBe(before)
    expect(store.getPaper(WITH_SOURCE).custom).toEqual({})
  })

  it('自定义格按格写:后一次只带自己那一格,页上前一格留着;null 只把那一格从页上去掉', () => {
    const file = join(vault, 'wiki', 'papers', `${WITH_SOURCE}.md`)
    store.setPaperColumns({
      ...emptyColumns(),
      custom: [NOTE_COLUMN, { key: 'du-fa', label: '读法', type: 'select', options: ['精读'] }],
    })
    store.updatePaper(WITH_SOURCE, { custom: { 'du-fa': '精读' } })
    store.updatePaper(WITH_SOURCE, { custom: { note: '读到一半' } })
    expect(readFileSync(file, 'utf8')).toContain('custom:\n  du-fa: "精读"\n  note: "读到一半"')
    expect(createVaultStore(vault).getPaper(WITH_SOURCE).custom)
      .toEqual({ 'du-fa': '精读', note: '读到一半' })
    store.updatePaper(WITH_SOURCE, { custom: { 'du-fa': null } })
    expect(readFileSync(file, 'utf8')).toContain('custom:\n  note: "读到一半"')
    expect(readFileSync(file, 'utf8')).not.toContain('du-fa')
    expect(store.getPaper(WITH_SOURCE).custom).toEqual({ note: '读到一半' })
  })

  it('改类型写进论文页与 state.json,重开还在;撤销把格子与列都写回页上', () => {
    const file = join(vault, 'wiki', 'papers', `${WITH_SOURCE}.md`)
    store.setPaperColumns({ ...emptyColumns(), custom: [NOTE_COLUMN] })
    store.updatePaper(WITH_SOURCE, { custom: { note: '读到一半' } })

    store.setPaperColumnType('note', 'multi')
    expect(readFileSync(file, 'utf8')).toContain('custom:\n  note:\n    - "读到一半"')
    const reopened = createVaultStore(vault)
    expect(reopened.getPaper(WITH_SOURCE).custom).toEqual({ note: ['读到一半'] })
    expect(reopened.paperColumns().custom).toEqual([{ ...NOTE_COLUMN, type: 'multi', options: ['读到一半'] }])
    expect(reopened.listChanges()[0]!.title).toBe('论文表 · 列「备注」的类型 文本 → 多选')

    store.undoChange(store.listChanges()[0]!.id)
    expect(readFileSync(file, 'utf8')).toContain('custom:\n  note: "读到一半"')
    expect(createVaultStore(vault).paperColumns().custom).toEqual([NOTE_COLUMN])
  })

  it('文本列改成单选后按它分组:撤销那次改类型把它从分组里摘掉,列集合照样改得动', () => {
    store.setPaperColumns({ ...emptyColumns(), custom: [NOTE_COLUMN] })
    store.setPaperColumnType('note', 'select')
    const change = store.listChanges()[0]!
    store.setPaperColumns({ ...store.paperColumns(), groups: [...store.paperColumns().groups, 'note'] })

    store.undoChange(change.id)

    expect(createVaultStore(vault).paperColumns()).toEqual({
      hidden: [], custom: [NOTE_COLUMN], groups: ['topics', 'projects', 'readState'],
    })
    expect(() => store.setPaperColumns({ ...store.paperColumns(), hidden: ['rating'] })).not.toThrow()
  })

  it('改类型与撤销改类型把写到的论文页的 updated 推到那一天', () => {
    let day = '2026-09-10'
    const clocked = createVaultStore(vault, () => day)
    clocked.setPaperColumns({ ...emptyColumns(), custom: [NOTE_COLUMN] })
    clocked.updatePaper(WITH_SOURCE, { custom: { note: '读到一半' } })
    day = '2026-09-11'
    clocked.setPaperColumnType('note', 'multi')
    expect(createVaultStore(vault).getPaper(WITH_SOURCE).updated).toBe('2026-09-11')
    day = '2026-09-12'
    clocked.undoChange(clocked.listChanges()[0]!.id)
    expect(createVaultStore(vault).getPaper(WITH_SOURCE).updated).toBe('2026-09-12')
  })

  it('删掉的论文在这一列改类型之后从垃圾桶恢复:放不下的格子从页上清掉,列集合照样改得动', () => {
    const file = join(vault, 'wiki', 'papers', `${WITH_SOURCE}.md`)
    store.setPaperColumns({ ...emptyColumns(), custom: [NOTE_COLUMN] })
    store.updatePaper(WITH_SOURCE, { custom: { note: '读到一半' } })
    store.deletePaper(WITH_SOURCE)
    store.setPaperColumnType('note', 'multi')
    store.restoreTrash(store.listTrash().find((t) => t.kind === 'paper')!.id)

    expect(() => store.setPaperColumns({ ...store.paperColumns(), hidden: ['rating'] })).not.toThrow()
    expect(store.getPaper(WITH_SOURCE).custom).toEqual({})
    expect(readFileSync(file, 'utf8')).not.toContain('读到一半')
  })

  it('页上手改出一格放不下的值:撤销一条只改了阅读状态的变动照样撤得了,阅读状态回来,那一格原样留着', () => {
    const file = join(vault, 'wiki', 'papers', `${WITH_SOURCE}.md`)
    store.setPaperColumns({ ...emptyColumns(), custom: [{ ...NOTE_COLUMN, type: 'multi' }] })
    writeFileSync(file, readFileSync(file, 'utf8').replace('\nmemberships:', '\ncustom:\n  note: "手写的一段"\nmemberships:'))
    const reopened = createVaultStore(vault)
    expect(reopened.getPaper(WITH_SOURCE).custom).toEqual({ note: '手写的一段' })
    const before = reopened.getPaper(WITH_SOURCE).readState
    reopened.updatePaper(WITH_SOURCE, { readState: '在读' })

    expect(() => reopened.undoChange(reopened.listChanges()[0]!.id)).not.toThrow()
    expect(reopened.getPaper(WITH_SOURCE).readState).toBe(before)
    expect(reopened.getPaper(WITH_SOURCE).custom).toEqual({ note: '手写的一段' })
  })

  it('项目页手改得科研图的边指向不存在的节点:撤销对它的改动报出这个原因,不当项目已经不在', async () => {
    store.createProject('图')
    const id = store.listProjects().find((p) => p.name === '图')!.id
    const from = (await store.createNode(id, '甲', null)).graph.nodes.at(-1)!.id
    const to = (await store.createNode(id, '乙', from)).graph.nodes.at(-1)!.id
    await store.updateProject(id, { focus: '改过的焦点' })
    const file = join(vault, 'wiki', 'projects', `${id}.md`)
    writeFileSync(file, readFileSync(file, 'utf8').replace(`to: "${to}"`, 'to: "gone"'))
    const reopened = createVaultStore(vault)

    expect(() => reopened.undoChange(reopened.listChanges()[0]!.id))
      .toThrow(`科研图的边指向不存在的节点：${from} → gone`)
  })

  it('删掉的项目撤销删除之后原样回来', async () => {
    store.createProject('要删的项目')
    const id = store.listProjects().find((p) => p.name === '要删的项目')!.id
    const before = await store.getProject(id)
    store.deleteProject(id)
    store.undoChange(store.listChanges()[0]!.id)
    expect(await store.getProject(id)).toEqual(before)
  })

  it('一列删掉之后,这一篇别的格子照样改得动,那一列留下的值原样待在页上', () => {
    const file = join(vault, 'wiki', 'papers', `${WITH_SOURCE}.md`)
    const progress = { key: 'jin-du', label: '进度', type: 'text' as const, options: [] }
    store.setPaperColumns({ ...emptyColumns(), custom: [NOTE_COLUMN, progress] })
    store.updatePaper(WITH_SOURCE, { custom: { note: '读到一半' } })
    store.setPaperColumns({ ...emptyColumns(), custom: [progress] })

    store.updatePaper(WITH_SOURCE, {
      custom: { ...store.getPaper(WITH_SOURCE).custom, 'jin-du': '看完了' },
    })
    expect(store.getPaper(WITH_SOURCE).custom).toEqual({ note: '读到一半', 'jin-du': '看完了' })
    expect(readFileSync(file, 'utf8')).toContain('  note: "读到一半"')
  })

  it('自定义格的 key 可以是纯数字,读回来的映射里不缺这一项', () => {
    store.setPaperColumns({
      ...emptyColumns(),
      custom: [{ key: '2024', label: '目标年', type: 'text', options: [] }, NOTE_COLUMN],
    })
    store.updatePaper(WITH_SOURCE, { custom: { '2024': '目标', note: 'x' } })
    expect(store.getPaper(WITH_SOURCE).custom).toEqual({ '2024': '目标', note: 'x' })
    expect(createVaultStore(vault).getPaper(WITH_SOURCE).custom).toEqual({ '2024': '目标', note: 'x' })
  })

  it('自定义格的值带双引号,读写两轮不越转越多层转义', () => {
    const file = join(vault, 'wiki', 'papers', `${WITH_SOURCE}.md`)
    store.setPaperColumns({ ...emptyColumns(), custom: [NOTE_COLUMN] })
    store.updatePaper(WITH_SOURCE, { custom: { note: '他说"好"' } })
    store.updatePaper(WITH_SOURCE, { custom: store.getPaper(WITH_SOURCE).custom })
    expect(readFileSync(file, 'utf8').split('\n')).toContain('  note: "他说\\"好\\""')
    expect(store.getPaper(WITH_SOURCE).custom.note).toBe('他说"好"')
  })

  it('多选格写成键下的列表,读回来还是列表;条目里的 : 与 " 原样留着;CRLF 的页也一样', () => {
    const file = join(vault, 'wiki', 'papers', `${WITH_SOURCE}.md`)
    const cells = { note: '读到一半', tags: ['综述', '必读'], kong: [], odd: ['a: b', '他说"好"'] }
    const before = readFileSync(file, 'utf8').split('\n')
    store.setPaperColumns({
      ...emptyColumns(),
      custom: [
        NOTE_COLUMN,
        { key: 'tags', label: '标签', type: 'multi', options: ['综述', '必读'] },
        { key: 'kong', label: '空的', type: 'multi', options: [] },
        { key: 'odd', label: '古怪', type: 'multi', options: ['a: b', '他说"好"'] },
      ],
    })
    store.updatePaper(WITH_SOURCE, { custom: cells })
    const lines = readFileSync(file, 'utf8').split('\n')
    const at = lines.indexOf('custom:')
    expect(lines.slice(at, at + 6)).toEqual([
      'custom:', '  note: "读到一半"', '  tags:', '    - "综述"', '    - "必读"', '  kong: []',
    ])
    expect(createVaultStore(vault).getPaper(WITH_SOURCE).custom).toEqual(cells)

    // Every page byte except the custom block and updated line remains in place.
    const cut = (rows: string[]) => {
      const from = rows.indexOf('custom:')
      if (from < 0) return rows
      let to = from + 1
      while (rows[to]?.startsWith(' ')) to += 1
      return [...rows.slice(0, from), ...rows.slice(to)]
    }
    const rest = (rows: string[]) => cut(rows).filter((r) => !r.startsWith('updated:'))
    expect(rest(lines)).toEqual(rest(before))

    writeFileSync(file, readFileSync(file, 'utf8').replace(/\n/g, '\r\n'), 'utf8')
    expect(createVaultStore(vault).getPaper(WITH_SOURCE).custom).toEqual(cells)
  })

  it('本功能之前记下的变动没有 custom 这一项,开库不炸,读得到,撤销照样管用', () => {
    store.updatePaper(WITH_SOURCE, { readState: '在读' })
    const file = join(vault, '.meridian', 'changelog.json')
    const rows = JSON.parse(readFileSync(file, 'utf8'))
    delete rows[0].restore.snapshot.custom
    writeFileSync(file, JSON.stringify(rows), 'utf8')

    const reopened = createVaultStore(vault)
    expect(reopened.listChanges()[0]).toMatchObject({ title: expect.stringContaining('改了字段') })
    reopened.undoChange(reopened.listChanges()[0]!.id)
    expect(reopened.getPaper(WITH_SOURCE).readState).toBe('未读')
  })

  it('归档落盘:重开库还是归档过的,记录本身一个字没变', () => {
    store.updatePaper(WITH_SOURCE, { readState: '在读' })
    const change = store.listChanges()[0]!
    store.archiveChange(change.id)

    const reopened = createVaultStore(vault)
    expect(reopened.listChanges()[0])
      .toEqual({ ...change, archived: true })
  })

  it('删除记录与清空已归档都落盘,重开库不会复现被清掉的记录', () => {
    store.updatePaper(WITH_SOURCE, { readState: '在读' })
    const deleted = store.listChanges()[0]!
    store.deleteChange(deleted.id)
    expect(createVaultStore(vault).listChanges().some((row) => row.id === deleted.id)).toBe(false)

    store.updatePaper(WITH_SOURCE, { readState: '已读' })
    const archived = store.listChanges()[0]!
    store.archiveChange(archived.id)
    store.clearArchivedChanges()

    const reopened = createVaultStore(vault).listChanges()
    expect(reopened.some((row) => row.id === archived.id)).toBe(false)
    expect(reopened.every((row) => !row.archived)).toBe(true)
  })

  it('本功能之前记下的变动没有 archived 这一项,开库不炸,读出来是没归档', () => {
    store.updatePaper(WITH_SOURCE, { readState: '在读' })
    const file = join(vault, '.meridian', 'changelog.json')
    const rows = JSON.parse(readFileSync(file, 'utf8'))
    delete rows[0].archived
    writeFileSync(file, JSON.stringify(rows), 'utf8')

    const reopened = createVaultStore(vault)
    expect(reopened.listChanges()[0]).toMatchObject({ archived: false, undoable: true })
  })

  it('日期不落盘:盘上只有 at,重开库算出来的仍是记下的那一天', () => {
    store.updatePaper(WITH_SOURCE, { readState: '在读' })
    const change = store.listChanges()[0]!
    expect(change.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const rows = JSON.parse(readFileSync(join(vault, '.meridian', 'changelog.json'), 'utf8'))
    expect(rows[0]).not.toHaveProperty('date')
    expect(createVaultStore(vault).listChanges()[0]!.date).toBe(change.date)
  })

  it('库里的论文页没写过阅读状态,每一行都按未读呈现,库里也没被补写这一项', () => {
    const dir = resolve(vault, 'wiki/papers')
    const pages = readdirSync(dir).filter((name) => name.endsWith('.md'))
    expect(pages).toHaveLength(2)
    for (const page of pages) {
      expect(readFileSync(resolve(dir, page), 'utf8')).not.toContain('read_state')
    }
    expect(store.listPapers({ page: 1, size: 10 }).rows.map((r) => r.readState))
      .toEqual(['未读', '未读'])
  })

  it('还没写过应用状态的库,这几项都是空的', () => {
    expect(store.listInbox()).toEqual([])
    expect(store.listProjects()).toEqual([])
    expect(store.listWatches()).toEqual([])
    expect(store.listLater()).toEqual([])
    expect(store.listChats()).toEqual([])
    expect(store.listTrash()).toEqual([])
    expect(store.listChanges()).toEqual([])
  })

  it('认得出库在不在 git 管理之下', () => {
    expect(isGitManaged(REPO)).toBe(true)
    expect(isGitManaged(vault)).toBe(false)
  })

  it('页的全文读得出、写得回', () => {
    const [page, missing] = store.readPages([`papers/${WITH_SOURCE}`, 'papers/nope'])
    expect(page!.text).toContain('title:')
    expect(missing).toEqual({ path: 'papers/nope', text: null })
    store.putPages([{ path: 'papers/nope', text: '---\ntitle: "x"\n---\n' }])
    expect(store.readPages(['papers/nope'])[0]!.text).toBe('---\ntitle: "x"\n---\n')
    store.putPages([{ path: 'papers/nope', text: null }])
    expect(store.readPages(['papers/nope'])[0]!.text).toBeNull()
  })

  it('论文页改正文:行上的 updated 跟着,撤销逐字节还原', () => {
    const file = join(vault, 'wiki', 'papers', `${WITH_SOURCE}.md`)
    const before = readFileSync(file, 'utf8')
    store.updateWikiPage(`papers/${WITH_SOURCE}`, '## 读后\n改过。')
    expect(store.wikiPaper(`papers/${WITH_SOURCE}`).body).toBe('## 读后\n改过。')
    expect(store.getPaper(WITH_SOURCE).updated).toBe(store.today())
    expect(readFileSync(file, 'utf8').endsWith('---\n## 读后\n改过。\n')).toBe(true)
    expect(() => store.updateWikiPage('papers/nope', 'x')).toThrow(/nope/)
    const change = store.listChanges()[0]!
    expect(change).toMatchObject({ diff: [`~ papers/${WITH_SOURCE}`], undoable: true })
    store.undoChange(change.id)
    expect(readFileSync(file, 'utf8')).toBe(before)
    expect(store.getPaper(WITH_SOURCE).updated).toBe('2026-05-20')
  })

  it('App 填过的书目字段记在 .meridian/metadata-fills.json，不进论文页；重开库还认得，之后刷新照样更新它们，用户改过的照样不动', () => {
    const added = store.importPaper('Fill Record Paper.pdf', minimalPdf({ lines: ['fill'] })).paper
    store.fillPaperMetadata(added.id, { year: 2025, venue: 'arXiv', identifier: 'arXiv:2509.01234', submitted: '2025-09-02' }, null)
    const page = readFileSync(join(vault, 'wiki', 'papers', `${added.id}.md`), 'utf8')
    const records = JSON.parse(readFileSync(join(vault, '.meridian', 'metadata-fills.json'), 'utf8')) as unknown[]
    expect(records).toEqual([{ paper: added.id, fields: { year: 2025, venue: 'arXiv', identifier: 'arXiv:2509.01234', submitted: '2025-09-02' } }])
    expect(createVaultStore(vault).fillPaperPublication(added.id, { venue: 'ICLR', year: 2026 })).toEqual(['year', 'venue'])
    expect(readFileSync(join(vault, 'wiki', 'papers', `${added.id}.md`), 'utf8')).not.toBe(page)
    const reopened = createVaultStore(vault)
    expect(reopened.fillPaperPublication(added.id, { venue: 'NeurIPS', year: 2026 })).toEqual(['venue'])
    reopened.updatePaper(added.id, { venue: 'MLSys' })
    expect(createVaultStore(vault).fillPaperPublication(added.id, { venue: 'ICML', year: 2027 })).toEqual([])
    expect(createVaultStore(vault).getPaper(added.id)).toMatchObject({ venue: 'MLSys', year: 2026 })
  })

  it('导入之后论文没有页数,补全跑过之后页上多一行 page_count,论文表就是那个数', () => {
    const bytes = Uint8Array.from(Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF'))
    const added = store.importPaper('Page Count Paper.pdf', bytes).paper
    expect(added.pageCount).toBe(0)
    expect(store.fillPaperMetadata(added.id, { pageCount: 12 }, added.title)).toEqual(['pageCount'])
    expect(readFileSync(join(vault, 'wiki', 'papers', `${added.id}.md`), 'utf8')).toMatch(/^page_count: 12$/m)
    expect(store.getPaper(added.id).pageCount).toBe(12)
    expect(createVaultStore(vault).getPaper(added.id).pageCount).toBe(12)
  })

  it('applyPaperWikiDraft 一次写下正文和两个信任字段,updateWikiPage 只改正文不碰它们', () => {
    const file = join(vault, 'wiki', 'papers', `${WITH_SOURCE}.md`)
    store.applyPaperWikiDraft(`papers/${WITH_SOURCE}`, '## 概览\nHarness 生成的正文。')
    const applied = readFileSync(file, 'utf8')
    expect(applied).toMatch(/^validation_state: "text_converged"$/m)
    expect(applied).toMatch(/^trust_state: "source_grounded_text"$/m)
    expect(store.wikiPaper(`papers/${WITH_SOURCE}`).body).toBe('## 概览\nHarness 生成的正文。')

    store.updateWikiPage(`papers/${WITH_SOURCE}`, '## 概览\n人工改过一次。')
    const manuallyEdited = readFileSync(file, 'utf8')
    expect(manuallyEdited).toMatch(/^validation_state: "text_converged"$/m)
    expect(manuallyEdited).toMatch(/^trust_state: "source_grounded_text"$/m)
    expect(store.wikiPaper(`papers/${WITH_SOURCE}`).body).toBe('## 概览\n人工改过一次。')
  })

  it('写入 Wiki 提案记成一条来源 Meridian 的最近变动,撤销逐字节还原,两个信任字段也撤掉', () => {
    const id = `papers/${WITH_SOURCE}`
    const file = join(vault, 'wiki', 'papers', `${WITH_SOURCE}.md`)
    const before = readFileSync(file, 'utf8')
    expect(before).not.toMatch(/^trust_state:/m)
    const kind = store.wikiPaper(id).body.trim() === '' ? '新建内容' : '更新内容'
    const changes = store.listChanges().length
    const { change } = recordChange(store, () => store.applyPaperWikiDraft(id, '## 概览\nHarness 生成的正文。'))
    expect(store.listChanges()).toHaveLength(changes + 1)
    const title = store.wikiPaper(id).title
    expect(store.listChanges()[0]).toMatchObject({
      id: change, title: `Wiki · ${title} · ${kind}`, source: 'Meridian', diff: [`~ ${id}`], undoable: true,
    })
    store.undoChange(change)
    expect(readFileSync(file, 'utf8')).toBe(before)
    expect(createVaultStore(vault).wikiPaper(id).body).toBe(store.wikiPaper(id).body)
  })

  it('旧库迁移:提案落地过且正文没变的页补上信任字段,改过的跳过,重开两次结果一样', () => {
    const matchedBody = store.wikiPaper(`papers/${WITH_SOURCE}`).body
    const appliedBodies = new Map([
      [WITH_SOURCE, matchedBody],
      ['Jiang-et-al-2024-Mixtral-of-Experts', '## 已经不是这一版了'],
    ])

    createVaultStore(vault, undefined, undefined, appliedBodies)
    const matchedFile = join(vault, 'wiki', 'papers', `${WITH_SOURCE}.md`)
    const editedFile = join(vault, 'wiki', 'papers', 'Jiang-et-al-2024-Mixtral-of-Experts.md')
    const matchedText = readFileSync(matchedFile, 'utf8')
    expect(matchedText).toMatch(/^validation_state: "text_converged"$/m)
    expect(matchedText).toMatch(/^trust_state: "source_grounded_text"$/m)
    expect(readFileSync(editedFile, 'utf8')).not.toMatch(/validation_state|trust_state/)

    const beforeSecondOpen = statSync(matchedFile).mtimeMs
    createVaultStore(vault, undefined, undefined, appliedBodies)
    expect(statSync(matchedFile).mtimeMs).toBe(beforeSecondOpen)
    expect(readFileSync(matchedFile, 'utf8')).toBe(matchedText)
  })

  // `python -m meridian wiki context` (the CLI subcommand named in the brief) does not detect an
  // app-native (desktop) library: it calls retrieve_wiki, which reads a Python-built .index catalog,
  // never app_native_catalog_records/is_app_native_wiki. That gap predates this fix and sits in
  // src/meridian/cli.py, outside its scope, so this test instead spawns Python running the same
  // adapter.context() call the app-native MCP path uses (proven correct by
  // tests/test_mcp_app_library.py), which is what genuinely reads an app-built library.
  it('真实跨进程:python 端 context 只读到已经 apply 过的论文页', () => {
    const shortVault = mkdtempSync(join(tmpdir(), 'm-'))
    try {
      cpSync(VAULT, shortVault, { recursive: true })
      const shortStore = createVaultStore(shortVault)
      const term = 'zzyxqdistinctiveterm'
      const applied = shortStore.importPaper('Applied.pdf', minimalPdf({ lines: ['applied paper'] })).paper
      shortStore.applyPaperWikiDraft(`papers/${applied.id}`, `## 概览\n讨论 ${term} 的方法。`)
      const notApplied = shortStore.importPaper('NotApplied.pdf', minimalPdf({ lines: ['not applied paper'] })).paper
      const wikiRoot = join(shortVault, 'wiki')
      const outDir = join(shortVault, 'ctx-out')
      const script = [
        'import json',
        'from pathlib import Path',
        'from meridian.mcp import adapter',
        `payload = adapter.context(query=${JSON.stringify(term)}, wiki_root=Path(${JSON.stringify(wikiRoot)}), top_k=6, out_dir=Path(${JSON.stringify(outDir)}))`,
        'print(json.dumps(payload["context"]["results"]))',
      ].join('\n')

      const output = execFileSync('python', ['-c', script], {
        env: { ...process.env, PYTHONPATH: join(REPO, 'src') },
        encoding: 'utf8',
      })
      const results = JSON.parse(output) as { provenance: { canonical_path: string } }[]
      const paths = results.map((r) => r.provenance.canonical_path)
      expect(paths).toContain(`papers/${applied.id}.md`)
      expect(paths).not.toContain(`papers/${notApplied.id}.md`)
    } finally {
      rmSync(shortVault, { recursive: true, force: true })
    }
  })
})

describe('vault store on the aggregation layout', () => {
  /** Example vault used as the fixture source; its layout matches a real vault without the `wiki/` level. */
  const EXAMPLE = resolve(import.meta.dirname, 'fixtures/wiki-example-vault')
  let vault: string
  let store: VaultStore

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-agg-'))
    for (const name of ['schema.yaml', 'papers', 'topics', 'methods']) {
      cpSync(join(EXAMPLE, name), join(vault, 'wiki', name), { recursive: true })
    }
    store = createVaultStore(
      vault, () => '2026-09-10', () => new Date('2026-09-10T16:05:04.003Z'),
    )
  })

  afterEach(() => rmSync(vault, { recursive: true, force: true }))

  it('读出来的首页、聚合页、论文页与 fixture store 的一模一样;页版本是磁盘上那一页的版本', async () => {
    const fixture = createFixtureStore(() => '2026-09-10')
    // The fixture has no files; its versions fingerprint the page as Core would write it, not the hand-written example.
    const unversioned = <T extends { version: unknown }>(view: T): Omit<T, 'version'> => {
      const { version, ...rest } = view
      expect(version).toMatchObject({ fm: expect.stringMatching(/^[0-9a-f]{16}$/) })
      return rest
    }
    expect(store.wikiHome()).toEqual(fixture.wikiHome())
    expect(unversioned(await store.wikiAggregation('topics/ptq-weight-only')))
      .toEqual(unversioned(await fixture.wikiAggregation('topics/ptq-weight-only')))
    expect(unversioned(store.wikiPaper('papers/2404.00456'))).toEqual(unversioned(fixture.wikiPaper('papers/2404.00456')))
    expect((await store.wikiAggregation('topics/ptq')).version)
      .toEqual(pageVersion(readFileSync(join(vault, 'wiki', 'topics', 'ptq.md'), 'utf8')))
    expect(store.wikiCards().map((c) => c.id)).toEqual(fixture.wikiCards().map((c) => c.id))
  })

  it('项目的论文数只数库里还在的那几篇,标题取完整标题', async () => {
    store.createProject('论文数')
    const id = store.listProjects().find((p) => p.name === '论文数')!.id
    await store.putProject({ ...await store.getProject(id), papers: ['2404.00456', 'no-such-paper'] })
    const detail = await store.getProject(id)
    expect(detail.papers).toEqual(['2404.00456', 'no-such-paper'])
    expect(detail.paperTitles).toEqual({ '2404.00456': store.getPaper('2404.00456').title })
    expect(detail.paperTitles['2404.00456']).toMatch(/^QuaRot: /)
    expect(detail.paperCount).toBe(1)
    expect(store.listProjects().find((p) => p.id === id)!.paperCount).toBe(1)
    const page = readFileSync(join(vault, 'wiki', 'projects', `${id}.md`), 'utf8')
    expect(page).toContain('papers:\n  - "2404.00456"\n  - "no-such-paper"\n')
    expect(page).not.toMatch(/^paper_count:/m)
    expect((await createVaultStore(vault).getProject(id)).paperCount).toBe(1)
  })

  it('项目任务的两小时窗口写进页面,重开仍在,也能清回全天', async () => {
    store.createProject('分时规划')
    const id = store.listProjects().find((project) => project.name === '分时规划')!.id
    const made = await store.createTask(id, {
      title: '实现窗口控制', start: '2026-09-10', end: '2026-09-10',
      window: { start: '14:00', end: '18:00' }, state: 'plan', priority: 'p0',
    })
    const task = made.tasks[0]!
    expect((await createVaultStore(vault).getProject(id)).tasks[0]!.window)
      .toEqual({ start: '14:00', end: '18:00' })
    await store.updateTask(id, task.id, { window: null })
    expect((await createVaultStore(vault).getProject(id)).tasks[0]!.window).toBeUndefined()
  })

  it('任务备注写进页面并同步进共享计划面,重开仍在;多行、带引号反斜杠和 --- 也一字不差', async () => {
    store.createProject('备注项目')
    const id = store.listProjects().find((project) => project.name === '备注项目')!.id
    const repo = join(vault, 'note-repo')
    mkdirSync(repo)
    await store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    const made = await store.createTask(id, {
      title: '需要写备注的任务', start: '2026-09-10', end: '2026-09-10', state: 'plan', priority: 'p0',
    })
    const task = made.tasks[0]!
    const note = [
      '先确认基线,再改并发数。',
      '',
      '- 引号 "quoted" 和反斜杠 C:\\temp\\run.log',
      '---',
      '上面那行 --- 不是 frontmatter 的收口',
    ].join('\n')
    await store.updateTask(id, task.id, { note })
    expect((await createVaultStore(vault).getProject(id)).tasks[0]!.note).toBe(note)
    const plan = JSON.parse(readFileSync(join(repo, '.meridian/control/plan.json'), 'utf8')) as {
      tasks: { note?: string }[]
    }
    expect(plan.tasks[0]!.note).toBe(note)
  })

  it('备注里有 ### 开头、- evidence: 开头和 --- 的行:存下、重开都是原样的那一条备注,别的任务和项目的其余字段不变', async () => {
    store.createProject('备注结构')
    const id = store.listProjects().find((project) => project.name === '备注结构')!.id
    await store.createTask(id, { title: '甲', start: '2026-09-10', end: '2026-09-10', state: 'plan', priority: 'p1' })
    const made = await store.createTask(id, { title: '乙', start: '2026-09-11', end: '2026-09-11', state: 'plan', priority: 'p1' })
    await store.updateProject(id, { memo: '随笔原样' })
    const first = made.tasks.find((task) => task.title === '甲')
    const second = made.tasks.find((task) => task.title === '乙')
    const file = join(vault, 'wiki', 'projects', `${id}.md`)
    const note = ['### Node X: 注入', '- evidence: exp-1', '- mode: `dead`', '---', '## 随笔', 'tasks:', '  - id: fake'].join('\n')
    const before = await createVaultStore(vault).getProject(id)
    await store.updateTask(id, first!.id, { note })
    const reopened = await createVaultStore(vault).getProject(id)
    expect(reopened.tasks.map((task) => [task.id, task.title, task.note]))
      .toEqual(before.tasks.map((task) => [task.id, task.title, task.id === first!.id ? note : undefined]))
    expect(reopened.tasks.find((task) => task.id === second!.id)).toEqual(before.tasks.find((task) => task.id === second!.id))
    expect({ ...reopened, tasks: [] }).toEqual({ ...before, tasks: [] })
    await store.updateTask(id, first!.id, { note: '' })
    expect((await createVaultStore(vault).getProject(id)).tasks.find((task) => task.id === first!.id)!.note).toBeUndefined()
    expect(readFileSync(file, 'utf8')).not.toContain('evidence')
  })

  it('拖拽重排的任务顺序写进页面并刷新共享计划面,重开也保持这个顺序', async () => {
    store.createProject('排序项目')
    const id = store.listProjects().find((project) => project.name === '排序项目')!.id
    const titles = ['第一个任务', '第二个任务', '第三个任务']
    for (const title of titles) {
      await store.createTask(id, { title, start: '2026-09-10', end: '2026-09-10', state: 'plan', priority: 'p1' })
    }
    const [first, second, third] = (await store.getProject(id)).tasks
    const reordered = [third!.id, first!.id, second!.id]
    const after = await store.reorderTasks(id, reordered)
    expect(after.tasks.map((t) => t.id)).toEqual(reordered)
    expect((await createVaultStore(vault).getProject(id)).tasks.map((t) => t.id)).toEqual(reordered)

    const repo = join(vault, 'sort-repo')
    mkdirSync(repo)
    await store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    const flipped = [second!.id, third!.id, first!.id]
    await store.reorderTasks(id, flipped)
    const plan = JSON.parse(readFileSync(join(repo, '.meridian/control/plan.json'), 'utf8')) as {
      tasks: { id: string }[]
    }
    expect(plan.tasks.map((task) => task.id)).toEqual(flipped)
  })

  it('节点结论:列进项目结论,验证后是已验证并存在项目页上,写进 Wiki 后看得到页与版本,结论改了回到待验证', async () => {
    store.createProject('结论链')
    const id = store.listProjects().find((p) => p.name === '结论链')!.id
    const task = (await store.createTask(id, {
      title: '跑宽度扫描', start: '2026-09-10', end: '2026-09-10', state: 'done', priority: 'p1',
    })).tasks[0]!.id
    const repo = join(vault, 'chain-repo')
    mkdirSync(repo)
    await store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    const graph = (text: string) => {
      mkdirSync(join(repo, '.meridian/graph'), { recursive: true })
      writeFileSync(join(repo, '.meridian/graph/graph.json'), JSON.stringify({
        schema: 'meridian.lab.graph.v1', edges: [],
        nodes: [{ id: 't.A', title: '宽树', state: 'supported' }, { id: 't.B', title: '前缀', state: 'unresolved' }],
        node_details: { 't.A': { tasks: [task], conclusion: { text, date: '2026-09-09', evidence: ['exp-1'] } } },
        supporting_artifacts: { 't.A': [{ type: 'experiment', id: 'exp-1', title: '宽度扫描' }] },
      }))
    }
    graph('宽树在 B≥8 时净赚')
    const shown = (await store.getProject(id)).projectConclusions!
    expect(shown).toEqual([{
      id: 't.A', node: 't.A', text: '宽树在 B≥8 时净赚', date: '2026-09-09', state: 'pending',
      fingerprint: expect.stringMatching(/^[0-9a-f]{16}$/),
      tasks: [{ id: task, title: '跑宽度扫描' }], experiments: [{ id: 'exp-1', title: '宽度扫描' }], wiki: [],
    }])
    const counts = () => store.listProjects().find((p) => p.id === id)!.conclusions
    const write = () => store.applyProposal({ source: 'user', title: '写入 Wiki', ops: [{
      op: 'addClaim', page: 'topics/ptq', claim: {
        id: 'wide-b8', text: '宽树在 B≥8 时净赚', evidence: [{ kind: 'experiment', project: id, node: 't.A' }],
      },
    }] })
    expect(write).toThrow(/节点 t.A 的实验结论还没验证/)
    expect(() => store.verifyConclusion(id, 't.B', shown[0]!.fingerprint!)).toThrow(/t.B/)
    expect(counts()).toEqual({ verified: 0, pending: 1, conflicting: 0 })

    await store.verifyConclusion(id, 't.A', shown[0]!.fingerprint!)
    expect((await createVaultStore(vault).getProject(id)).projectConclusions![0]).toMatchObject({ state: 'verified', verifiedOn: '2026-09-10' })
    expect(counts()).toEqual({ verified: 1, pending: 0, conflicting: 0 })
    write()
    expect((await store.wikiAggregation('topics/ptq')).claims.find((c) => c.id === 'wide-b8')!.evidence[0]!.point).toBe('宽树')
    expect((await store.getProject(id)).projectConclusions![0]!.wiki).toEqual([{
      page: 'topics/ptq', title: (await store.wikiAggregation('topics/ptq')).title, claim: 'wide-b8', version: 1,
    }])

    graph('宽树在 B≥16 时才净赚')
    expect((await store.getProject(id)).projectConclusions![0]!.state).toBe('pending')
    expect(() => store.verifyConclusion(id, 't.A', shown[0]!.fingerprint!)).toThrow(/在你打开之后又被改过/)
  })

  it('手动给任务设的科研节点存在项目页顶层并写进共享计划面,重开仍在,结论按它算;清掉就回到 agent 连的节点', async () => {
    store.createProject('手动节点')
    const id = store.listProjects().find((p) => p.name === '手动节点')!.id
    const task = (await store.createTask(id, {
      title: '跑宽度扫描', start: '2026-09-10', end: '2026-09-10', state: 'done', priority: 'p1',
    })).tasks[0]!.id
    const repo = join(vault, 'task-node-repo')
    mkdirSync(join(repo, '.meridian/graph'), { recursive: true })
    await store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    const conclusion = { text: '宽树净赚', date: '2026-09-09', evidence: [] }
    writeFileSync(join(repo, '.meridian/graph/graph.json'), JSON.stringify({
      schema: 'meridian.lab.graph.v1', edges: [],
      nodes: [{ id: 't.A', title: '宽树', state: 'supported' }, { id: 't.B', title: '前缀', state: 'supported' }],
      node_details: { 't.A': { tasks: [task], conclusion }, 't.B': { conclusion } },
    }))
    const planNode = () => (JSON.parse(readFileSync(join(repo, '.meridian/control/plan.json'), 'utf8')) as {
      tasks: { id: string; node?: string }[]
    }).tasks.find((t) => t.id === task)!.node
    const tasksOf = (node: string) => store.heldProject(id).projectConclusions!
      .find((c) => c.node === node)!.tasks.map((t) => t.id)

    await store.setTaskNode(id, task, 't.B')
    expect(readFileSync(join(vault, 'wiki', 'projects', `${id}.md`), 'utf8')).toContain(`task_nodes:\n  ${task}: "t.B"\n`)
    expect((await createVaultStore(vault).getProject(id)).taskNodes).toEqual({ [task]: 't.B' })
    expect(planNode()).toBe('t.B')
    expect([tasksOf('t.A'), tasksOf('t.B')]).toEqual([[], [task]])

    await store.setTaskNode(id, task, null)
    expect(readFileSync(join(vault, 'wiki', 'projects', `${id}.md`), 'utf8')).not.toContain('task_nodes:')
    expect(planNode()).toBeUndefined()
    expect([tasksOf('t.A'), tasksOf('t.B')]).toEqual([[task], []])
    await expect(store.setTaskNode(id, task, 't.missing')).rejects.toThrow(/t.missing/)
  })

  it('agent 请求加的任务:进计划、标明 agent 加的、记一条能撤销的变动;每条只收一次,删掉或撤销都不回来', async () => {
    store.createProject('agent 任务')
    const id = store.listProjects().find((p) => p.name === 'agent 任务')!.id
    const repo = join(vault, 'agent-task-repo')
    mkdirSync(join(repo, '.meridian', 'tasks'), { recursive: true })
    await store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    const requests = (tasks: unknown[]) => writeFileSync(join(repo, '.meridian', 'tasks', 'tasks.json'), JSON.stringify({
      schema_version: 'meridian.workspace-agent-tasks.v1', tasks,
    }))
    requests([
      { id: 'rerun-sweep', date: '2026-09-12', title: '在 B=16 重跑宽度扫描', note: '延迟矩阵补上 B=16 一列算完成' },
      { id: 'write-up', date: '2026-09-13', title: '整理扫描结果' },
    ])

    store.absorbAgentTasks(id)
    const tasks = (await store.getProject(id)).tasks
    // Each request lands at the front of the plan as it is absorbed, so the request
    // processed last (write-up) ends up ahead of the one processed first (rerun-sweep).
    expect(tasks.map(({ title, start, end, state, priority, origin, note }) => ({ title, start, end, state, priority, origin, note }))).toEqual([
      { title: '整理扫描结果', start: '2026-09-13', end: '2026-09-13', state: 'plan', priority: 'p1', origin: 'agent', note: undefined },
      { title: '在 B=16 重跑宽度扫描', start: '2026-09-12', end: '2026-09-12', state: 'plan', priority: 'p1', origin: 'agent', note: '延迟矩阵补上 B=16 一列算完成' },
    ])
    const plan = JSON.parse(readFileSync(join(repo, '.meridian', 'control', 'plan.json'), 'utf8')) as {
      agent_tasks: Record<string, string>; tasks: { id: string; origin?: string }[]
    }
    expect(plan.agent_tasks).toEqual({ 'rerun-sweep': tasks[1]!.id, 'write-up': tasks[0]!.id })
    expect(plan.tasks.map((task) => task.origin)).toEqual(['agent', 'agent'])
    const changes = store.listChanges().slice(0, 2)
    expect(changes.map((c) => [c.title, c.source, c.undoable])).toEqual([
      ['项目「agent 任务」· 添加任务', 'Meridian', true], ['项目「agent 任务」· 添加任务', 'Meridian', true],
    ])

    store.absorbAgentTasks(id)
    expect((await store.getProject(id)).tasks).toHaveLength(2)
    // changes[0] is the most recently logged change, which added the write-up task (tasks[0]).
    store.undoChange(changes[0]!.id)
    await store.deleteTask(id, tasks[1]!.id)
    store.absorbAgentTasks()
    expect((await createVaultStore(vault).getProject(id)).tasks).toEqual([])
  })

  it('agent 任务文件里一条坏了：其余照常进计划，坏的那条连同第几条和原因报到 stderr、跳过，文件一字不改', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      store.createProject('一条坏任务')
      const id = store.listProjects().find((p) => p.name === '一条坏任务')!.id
      const repo = join(vault, 'one-bad-task-repo')
      mkdirSync(join(repo, '.meridian', 'tasks'), { recursive: true })
      await store.bindProjectWorkspace(id, { kind: 'local', root: repo })
      const file = join(repo, '.meridian', 'tasks', 'tasks.json')
      const text = JSON.stringify({
        schema_version: 'meridian.workspace-agent-tasks.v1',
        tasks: [
          { id: 'rerun-sweep', date: '2026-09-12', title: '在 B=16 重跑宽度扫描' },
          { id: 'bad', date: '9月12日', title: '日期写坏了' },
        ],
      })
      writeFileSync(file, text)

      store.absorbAgentTasks(id)
      expect((await store.getProject(id)).tasks.map((task) => task.title)).toEqual(['在 B=16 重跑宽度扫描'])
      const reported = error.mock.calls.map(([line]) => String(line)).filter((line) => line.includes(file))
      expect(reported).toEqual([expect.stringContaining('record 2 ')])
      expect(reported[0]).toContain('"date"')
      expect(readFileSync(file, 'utf8')).toBe(text)
    } finally {
      error.mockRestore()
    }
  })

  it('旧版本记下的项目变动在没验证过结论的项目上照样能撤销', async () => {
    store.createProject('旧记录')
    const id = store.listProjects().find((p) => p.name === '旧记录')!.id
    await store.updateProject(id, { focus: '新的当前目标' })
    const file = join(vault, '.meridian', 'changelog.json')
    const rows = JSON.parse(readFileSync(file, 'utf8')) as { target: { id: string } | null; after: string }[]
    const detail = await store.getProject(id)
    const older = ['name', 'status', 'priority', 'topic', 'focus', 'block', 'start', 'due', 'memo',
      'papers', 'tasks', 'milestones', 'events', 'relations', 'attachments', 'agentSessions'] as const
    const after = createHash('sha256')
      .update(stableJson(Object.fromEntries(older.map((key) => [key, detail[key]])))).digest('hex').slice(0, 16)
    writeFileSync(file, JSON.stringify(rows.map((row) => (row.target?.id === id ? { ...row, after } : row))))
    const reopened = createVaultStore(vault, () => '2026-09-10')
    reopened.undoChange(reopened.listChanges().find((c) => c.title.includes('改了字段'))!.id)
    expect((await reopened.getProject(id)).focus).not.toBe('新的当前目标')
  })

  it('验证与取消验证都进最近变动,撤销逐项还原;没验证过的项目页不多出这一项', async () => {
    store.createProject('验证撤销')
    const id = store.listProjects().find((p) => p.name === '验证撤销')!.id
    const repo = join(vault, 'undo-repo')
    mkdirSync(join(repo, '.meridian/graph'), { recursive: true })
    await store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    writeFileSync(join(repo, '.meridian/graph/graph.json'), JSON.stringify({
      schema: 'meridian.lab.graph.v1', edges: [], nodes: [{ id: 't.A', title: '宽树', state: 'supported' }],
      node_details: { 't.A': { conclusion: { text: '宽树净赚', date: '2026-09-09', evidence: ['exp-1'], revision: 'r1' } } },
    }))
    const page = join(vault, 'wiki', 'projects', `${id}.md`)
    const before = readFileSync(page, 'utf8')
    const state = () => store.heldProject(id).projectConclusions![0]!.state
    await store.verifyConclusion(id, 't.A', (await store.getProject(id)).projectConclusions![0]!.fingerprint!)
    expect(store.listChanges()[0]).toMatchObject({ title: expect.stringContaining('验证实验结论'), undoable: true })
    await store.unverifyConclusion(id, 't.A')
    expect(state()).toBe('pending')
    expect(store.listChanges()[0]).toMatchObject({ title: expect.stringContaining('取消验证实验结论'), undoable: true })
    store.undoChange(store.listChanges()[0]!.id)
    expect(state()).toBe('verified')
    store.undoChange(store.listChanges().find((c) => c.title.includes('验证实验结论') && !c.title.includes('取消'))!.id)
    expect(state()).toBe('pending')
    expect(readFileSync(page, 'utf8')).toBe(before)
  })

  it('重排顺序与项目现有任务不是同一批 id 时拒绝写入', async () => {
    store.createProject('排序校验项目')
    const id = store.listProjects().find((project) => project.name === '排序校验项目')!.id
    await store.createTask(id, { title: '唯一任务', start: '2026-09-10', end: '2026-09-10', state: 'plan', priority: 'p1' })
    const realId = (await store.getProject(id)).tasks[0]!.id
    expect(() => store.reorderTasks(id, [realId, 'no-such-task'])).toThrow(/任务顺序/)
    expect(() => store.reorderTasks(id, [])).toThrow(/任务顺序/)
  })

  it('项目连接代码目录后，任务与里程碑每次修改都刷新共享计划面', async () => {
    store.createProject('协议项目')
    const id = store.listProjects().find((project) => project.name === '协议项目')!.id
    const repo = join(vault, 'bound-repo')
    mkdirSync(repo)
    const connected = await store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    expect(connected.workspace).toMatchObject({ state: 'ready' })
    await store.createTask(id, {
      title: '共享任务', start: '2026-09-15', end: '2026-09-15', state: 'act', priority: 'p1',
    })
    await store.createMilestone(id, { date: '2026-09-20', title: '共享里程碑', done: false })
    const planFile = join(repo, '.meridian/control/plan.json')
    const plan = JSON.parse(readFileSync(planFile, 'utf8')) as {
      tasks: { title: string }[]
      milestones: { title: string }[]
    }
    expect(plan.tasks.map((task) => task.title)).toContain('共享任务')
    expect(plan.milestones.map((milestone) => milestone.title)).toContain('共享里程碑')
    expect((await createVaultStore(vault).getProject(id)).workspace).toMatchObject({ state: 'ready' })
    await store.bindProjectWorkspace(id, null)
    expect((await store.getProject(id)).workspace).toBeUndefined()
    expect(existsSync(planFile)).toBe(true)
  })

  it('删除科研节点会同步解除想法节点关联，不在变动列表留下悬空引用', async () => {
    store.createProject('增量想法')
    const projectId = store.listProjects().find((project) => project.name === '增量想法')!.id
    const node = (await store.createNode(projectId, '待删除节点', null)).graph.nodes[0]!
    const repo = join(vault, 'idea-change-repo')
    mkdirSync(repo)
    await store.bindProjectWorkspace(projectId, { kind: 'local', root: repo })
    const session = store.createChat('节点想法来源', true)
    const idea = store.createIdea(session.id, '验证节点', '删除节点后不应保留关联')
    store.updateIdea(idea.id, { project: projectId, node: node.id })

    await store.deleteNode(projectId, node.id)

    const changes = JSON.parse(
      readFileSync(join(repo, '.meridian/control/changes.json'), 'utf8'),
    ) as {
      ideas: { id: string; node?: string }[]
      changes: { kind: string; refs: { kind: string; id: string }[] }[]
    }
    expect(changes.ideas.find((held) => held.id === idea.id)?.node).toBeUndefined()
    expect(changes.changes.at(-1)).toMatchObject({
      kind: 'idea.node_unlinked',
      refs: expect.arrayContaining([
        { kind: 'idea', id: idea.id },
        { kind: 'node', id: node.id },
      ]),
    })
  })

  it('总览只读本地工作区的科研路径与事件，不把整张图跨到界面', async () => {
    store.createProject('本地科研投影')
    const id = store.listProjects().find((project) => project.name === '本地科研投影')!.id
    const repo = join(vault, 'overview-repo')
    mkdirSync(repo)
    await store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    mkdirSync(join(repo, '.meridian/graph'), { recursive: true })
    writeFileSync(join(repo, '.meridian/graph/graph.json'), JSON.stringify({
      schema: 'meridian.lab.graph.v1',
      active_path: ['root', 'probe'],
      nodes: [
        { id: 'root', label: '研究问题', state: 'supported' },
        { id: 'probe', label: '延迟探针', state: 'repairable' },
        { id: 'dead', label: '固定阈值', state: 'dead' },
      ],
      edges: [
        { source: 'root', target: 'probe', kind: 'continues' },
        { source: 'root', target: 'dead', kind: 'continues' },
      ],
    }), 'utf8')
    mkdirSync(join(repo, '.meridian/events'), { recursive: true })
    writeFileSync(join(repo, '.meridian/events/events.json'), JSON.stringify({
      schema_version: 'meridian.workspace-events.v1',
      events: [{
        id: 'event-1', date: '2026-09-15', text: '探针通过', node: 'probe',
        source: '.meridian/experiments/probe.md',
      }],
    }), 'utf8')

    const overview = store.overviewProjects().find((project) => project.id === id)!
    expect(overview.research).toEqual({
      pathState: 'active',
      // Legacy `active_path` is read as only its last id: root (supported) is the shared ancestor
      // but is not itself active, so it does not appear here even though it is on the old chain.
      activeNodes: [
        { id: 'probe', label: '延迟探针', state: 'act', mode: 'repairable' },
      ],
      branches: { active: 1, supported: 1, failed: 1, shelved: 0 },
    })
    expect(overview.events.at(-1)).toEqual({
      date: '2026-09-15', text: '探针通过', node: 'probe', kind: 'result', origin: 'agent',
    })
    expect(overview).not.toHaveProperty('graph')
    expect(overview).not.toHaveProperty('workspace')
  })

  it('最近推进是最新的那一天:页上的记录、工作区事件与记进最近变动的改动都算,只调顺序的不算;列表、详情与总览是同一天', async () => {
    let day = '2026-09-01'
    const dated = createVaultStore(vault, () => day)
    dated.createProject('推进日')
    const id = dated.listProjects().find((project) => project.name === '推进日')!.id
    const progress = async () => [
      dated.listProjects().find((project) => project.id === id)!.lastProgress,
      (await dated.getProject(id)).lastProgress,
      dated.overviewProjects().find((project) => project.id === id)!.lastProgress,
    ]
    expect(await progress()).toEqual(['2026-09-01', '2026-09-01', '2026-09-01'])

    day = '2026-09-05'
    for (const title of ['第一个任务', '第二个任务']) {
      await dated.createTask(id, { title, start: '2026-09-10', end: '2026-09-10', state: 'plan', priority: 'p1' })
    }
    for (const text of ['第一条关联', '第二条关联']) await dated.createRelation(id, { group: 'Wiki', text })
    expect(await progress()).toEqual(['2026-09-05', '2026-09-05', '2026-09-05'])

    day = '2026-09-07'
    expect((await dated.updateProject(id, { memo: '换用更小的草稿模型' })).lastProgress).toBe('2026-09-07')
    expect(await progress()).toEqual(['2026-09-07', '2026-09-07', '2026-09-07'])

    day = '2026-09-09'
    const [first, second] = (await dated.getProject(id)).tasks
    expect((await dated.reorderTasks(id, [second!.id, first!.id])).lastProgress).toBe('2026-09-07')
    const moved = (await dated.getProject(id)).relations[0]!.items[1]!.id
    expect((await dated.moveRelation(id, moved, 0)).lastProgress).toBe('2026-09-07')
    dated.undoChange(dated.listChanges()[0]!.id)
    expect(await progress()).toEqual(['2026-09-07', '2026-09-07', '2026-09-07'])

    const repo = join(vault, 'progress-repo')
    mkdirSync(join(repo, '.meridian/events'), { recursive: true })
    await dated.bindProjectWorkspace(id, { kind: 'local', root: repo })
    writeFileSync(join(repo, '.meridian/events/events.json'), JSON.stringify({
      schema_version: 'meridian.workspace-events.v1',
      events: [
        { id: 'late', date: '2026-09-12', text: '完成 延迟探针', source: 'src/probe.py' },
        { id: 'early', date: '2026-09-03', text: '开始推进 延迟探针', source: 'src/probe.py' },
      ],
    }), 'utf8')
    expect(await progress()).toEqual(['2026-09-12', '2026-09-12', '2026-09-12'])

    // The derived day is never stored, not even in an undo snapshot.
    const stored = JSON.parse(readFileSync(join(vault, '.meridian/changelog.json'), 'utf8')) as
      { restore: { kind: string; project?: object } | null }[]
    const snapshots = stored.flatMap((row) => (row.restore?.kind === 'project' ? [row.restore.project!] : []))
    expect(snapshots.length).toBeGreaterThan(0)
    for (const snapshot of snapshots) expect(snapshot).not.toHaveProperty('lastProgress')
  })

  it('项目列表的最近记录把关联工作区的事件也算进去:取页上与工作区里最新的三条,最新的在最后', async () => {
    store.createProject('最近记录')
    const id = store.listProjects().find((project) => project.name === '最近记录')!.id
    const repo = join(vault, 'recent-repo')
    mkdirSync(join(repo, '.meridian/events'), { recursive: true })
    await store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    writeFileSync(join(repo, '.meridian/events/events.json'), JSON.stringify({
      schema_version: 'meridian.workspace-events.v1',
      events: [
        { id: 'newest', date: '2026-09-12', text: '完成 延迟探针', source: 'src/probe.py' },
        { id: 'older', date: '2026-09-11', text: '开始推进 延迟探针', source: 'src/probe.py' },
        { id: 'oldest', date: '2026-09-09', text: '复现基线', source: 'src/probe.py' },
      ],
    }), 'utf8')
    const recent = store.listProjects().find((project) => project.id === id)!.recentEvents
    expect(recent.map(({ date, text }) => `${date} ${text}`)).toEqual([
      '2026-09-10 创建项目', '2026-09-11 开始推进 延迟探针', '2026-09-12 完成 延迟探针',
    ])
  })

  it('关联仓库里 coding agent 新写的科研记录进动态的「实验」，旧的不刷屏，同一条只进一次', async () => {
    let clock = new Date('2026-09-22T10:00:00.000Z')
    const timed = createVaultStore(vault, () => '2026-09-22', () => clock)
    timed.createProject('动态实验流')
    const id = timed.listProjects().find((project) => project.name === '动态实验流')!.id
    const repo = join(vault, 'feed-lab-repo')
    mkdirSync(join(repo, '.meridian/events'), { recursive: true })
    await timed.bindProjectWorkspace(id, { kind: 'local', root: repo })
    const writeEvents = (events: { id: string; text: string }[]) => writeFileSync(
      join(repo, '.meridian/events/events.json'),
      JSON.stringify({
        schema_version: 'meridian.workspace-events.v1',
        events: events.map((event) => ({ ...event, date: '2026-09-22', source: 'src/probe.py' })),
      }),
      'utf8',
    )
    const labTexts = async () => (await timed.listFeed()).filter((entry) => entry.source === 'lab')
      .map((entry) => (entry.body.kind === 'runs' ? entry.body.runs.map((run) => run.text).join('') : ''))

    writeEvents([{ id: 'old', text: '开始推进 延迟探针' }])
    expect(await labTexts()).toEqual([])

    writeEvents([{ id: 'old', text: '开始推进 延迟探针' }, { id: 'new', text: '完成 延迟探针：p95 降到 40ms' }])
    clock = new Date(clock.getTime() + 30_000)
    expect(await labTexts()).toEqual([])
    clock = new Date(clock.getTime() + 31_000)
    expect(await labTexts()).toEqual(['「动态实验流」完成 延迟探针：p95 降到 40ms'])
    expect((await timed.listFeed())[0]).toMatchObject({
      source: 'lab', body: { runs: [{ kind: 'strong', text: '「动态实验流」', target: { kind: 'project', id } }, { kind: 'text' }] },
    })

    clock = new Date(clock.getTime() + 61_000)
    expect(await labTexts()).toHaveLength(1)
  })

  it('项目的结论分档从页上的结论列表数出来,页上不再存计数', async () => {
    store.createProject('结论计数')
    const id = store.listProjects().find((project) => project.name === '结论计数')!.id
    const file = join(vault, 'wiki', 'projects', `${id}.md`)
    const page = readFileSync(file, 'utf8')
    expect(page).not.toMatch(/^conclusions:/m)
    writeFileSync(file, page.replace('conclusion_list: []', [
      'conclusion_list:',
      '  - id: "concl-a"', '    text: "一"', '    state: "verified"',
      '    date: "2026-09-01"', '    source: "手动添加"',
      '  - id: "concl-b"', '    text: "二"', '    state: "conflicting"',
      '    date: "2026-09-02"', '    source: "手动添加"',
      '  - id: "concl-c"', '    text: "三"', '    state: "conflicting"',
      '    date: "2026-09-03"', '    source: "手动添加"',
    ].join('\n')))
    const reopened = createVaultStore(vault)
    const counts = { verified: 1, pending: 0, conflicting: 2 }
    expect((await reopened.getProject(id)).conclusions).toEqual(counts)
    expect(reopened.listProjects().find((project) => project.id === id)!.conclusions).toEqual(counts)
    expect(reopened.overviewProjects().find((project) => project.id === id)!.conclusions).toEqual(counts)
  })

  it('结论:新建是待验证、记来源与所引论文,改档与删除都落在项目页上,不记最近变动', async () => {
    store.createProject('结论')
    const id = store.listProjects().find((project) => project.name === '结论')!.id
    const session = store.createChat('宽树拐点', true)
    const changes = store.listChanges().length
    const made = await store.createConclusion(id, '拐点是 batch size 的函数', {
      chat: session.id, paper: '2404.00456',
    })
    const item = made.conclusionList.at(-1)!
    expect(item).toMatchObject({
      text: '拐点是 batch size 的函数', state: 'pending',
      source: '对话「宽树拐点」', paper: '2404.00456',
    })
    expect(made.conclusions).toEqual({ verified: 0, pending: 1, conflicting: 0 })
    expect((await store.createConclusion(id, '手写的一条', {})).conclusionList.at(-1)!.source)
      .toBe('手动添加')
    await store.setConclusionState(id, item.id, 'conflicting')
    expect((await createVaultStore(vault).getProject(id)).conclusions)
      .toEqual({ verified: 0, pending: 1, conflicting: 1 })
    await store.deleteConclusion(id, item.id)
    expect((await createVaultStore(vault).getProject(id)).conclusionList.map((conclusion) => conclusion.text))
      .toEqual(['手写的一条'])
    expect(store.listChanges()).toHaveLength(changes)
    expect(() => store.createConclusion(id, 'x', { paper: 'no-such-paper' })).toThrow(/no-such-paper/)
    expect(() => store.createConclusion(id, 'x', { chat: 'no-such-chat' })).toThrow(/no-such-chat/)
    expect(() => store.setConclusionState(id, 'no-such', 'verified')).toThrow(/no-such/)
    expect(() => store.deleteConclusion(id, 'no-such')).toThrow(/no-such/)
  })

  it('研究想法独立持久化，保留来源且重开后仍可编辑', () => {
    const session = store.createChat('想法会话', true)
    const created = store.createIdea(session.id, '新方向', '验证一个新的机制假设')
    expect(created.source).toMatchObject({ chatId: session.id, chatTitle: '想法会话' })
    const reopened = createVaultStore(vault)
    expect(reopened.listIdeas()[0]).toMatchObject({ id: created.id, title: '新方向' })
    reopened.updateIdea(created.id, { body: '加入消融实验' })
    expect(createVaultStore(vault).listIdeas()[0]?.body).toBe('加入消融实验')
    expect(() => reopened.updateIdea('no-such', { title: 'x' })).toThrow(/想法不存在/)
  })

  it('自己写下的想法不从对话来:来源是手动添加,没有对话也没有 agent,不关联项目,建出来就在列表里,重开还在', () => {
    const created = store.createIdea(undefined, '我自己的想法', '先记下来,之后再验证')
    expect(created).toMatchObject({ title: '我自己的想法', source: { chatTitle: '手动添加' }, archived: false })
    expect(created.source).toEqual({ chatTitle: '手动添加' })
    expect(created.project).toBeUndefined()
    expect(createVaultStore(vault).listIdeas().find((idea) => idea.id === created.id)).toEqual(created)
  })

  it('coding agent 在项目工作区里记下的想法进到想法列表:记下是在哪个项目里冒出来的,agent 挂的节点只是候选,不算放进这个项目;只收一次,删了不再回来', async () => {
    store.createProject('agent 想法项目')
    const id = store.listProjects().find((project) => project.name === 'agent 想法项目')!.id
    const repo = join(vault, 'agent-ideas-repo')
    mkdirSync(repo)
    await store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    const file = join(repo, '.meridian/ideas/ideas.json')
    mkdirSync(join(repo, '.meridian/ideas'), { recursive: true })
    writeFileSync(file, JSON.stringify({
      schema_version: 'meridian.workspace-agent-ideas.v1',
      ideas: [{
        id: 'reuse-distance', date: '2026-09-21', title: '按复用距离淘汰前缀缓存',
        body: '用复用距离替代 LRU。', context: '缓存淘汰的实现讨论', node: 'direction.A',
      }],
    }))
    const manifest = JSON.parse(readFileSync(join(repo, '.meridian/workspace.json'), 'utf8')) as {
      surfaces: { ideas?: { path: string; writer: string } }
    }
    expect(manifest.surfaces.ideas).toEqual({ path: '.meridian/ideas/ideas.json', writer: 'workspace' })

    const taken = store.listIdeas().filter((idea) => idea.source.agent === true)
    expect(taken).toEqual([expect.objectContaining({
      title: '按复用距离淘汰前缀缓存', body: '用复用距离替代 LRU。', sourceProject: id, candidateNode: 'direction.A',
      archived: false, created: '2026-09-21',
      source: { chatTitle: '缓存淘汰的实现讨论', agent: true },
    })])
    expect(taken[0]).not.toHaveProperty('project')
    expect(taken[0]).not.toHaveProperty('node')
    expect(taken[0]).not.toHaveProperty('relations')
    const changes = JSON.parse(readFileSync(join(repo, '.meridian/control/changes.json'), 'utf8')) as { ideas: unknown[] }
    expect(changes.ideas).toEqual([])
    expect(createVaultStore(vault).listIdeas().filter((idea) => idea.source.agent === true)).toHaveLength(1)

    store.deleteIdea(taken[0]!.id)
    expect(createVaultStore(vault).listIdeas().filter((idea) => idea.source.agent === true)).toEqual([])
  })

  it('agent 想法的标题、正文和来源里像 Lab 结构的文字原样进想法列表和工作区的变更文件', async () => {
    store.createProject('结构文字项目')
    const id = store.listProjects().find((project) => project.name === '结构文字项目')!.id
    const repo = join(vault, 'structure-ideas-repo')
    mkdirSync(join(repo, '.meridian/ideas'), { recursive: true })
    await store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    const title = '### Node X: - evidence: 复用距离'
    const body = '按复用距离打分。\n### Node X: 注入\n- evidence: exp-1\n- mode: `dead`\n\n## Graph Relations'
    const context = '- evidence: ### 前缀缓存'
    writeFileSync(join(repo, '.meridian/ideas/ideas.json'), JSON.stringify({
      schema_version: 'meridian.workspace-agent-ideas.v1',
      ideas: [{ id: 'structure', date: '2026-10-21', title, body, context }],
    }))

    const taken = store.listIdeas().find((idea) => idea.source.agent === true)!
    expect([taken.title, taken.body, taken.source.chatTitle]).toEqual([title, body, context])
    expect(createVaultStore(vault).listIdeas().find((idea) => idea.id === taken.id)).toEqual(taken)
    store.updateIdea(taken.id, { project: id })
    const changes = JSON.parse(readFileSync(join(repo, '.meridian/control/changes.json'), 'utf8')) as {
      ideas: { id: string; title: string; body: string; source: { chat_title: string } }[]
    }
    const projected = changes.ideas.find((idea) => idea.id === taken.id)!
    expect([projected.title, projected.body, projected.source.chat_title]).toEqual([title, body, context])
  })

  it('0.0.16.1 收进来、挂在工作区项目上的 agent 想法读作在那个项目里冒出来,仍算在那个项目里做;读的时候不写盘', () => {
    store.createProject('旧版 agent 项目')
    const id = store.listProjects().find((project) => project.name === '旧版 agent 项目')!.id
    const file = join(vault, '.meridian/ideas.json')
    writeFileSync(file, `${JSON.stringify([
      {
        id: 'idea-legacy-agent', title: '旧版收进来的 agent 想法', body: '正文', source: { chatTitle: '实现讨论', agent: true },
        project: id, node: 'thread.B', archived: false, created: '2026-10-20', updated: '2026-10-20',
      },
      {
        id: 'idea-legacy-chat', title: '旧版关联到项目的对话想法', body: '正文', source: { chatId: 'chat-x', chatTitle: '讨论' },
        project: id, archived: false, created: '2026-10-20', updated: '2026-10-20',
      },
      {
        id: 'idea-legacy-unlinked', title: '没挂项目的 agent 想法', body: '正文', source: { chatTitle: '实现讨论', agent: true },
        archived: false, created: '2026-10-20', updated: '2026-10-20',
      },
    ], null, 2)}\n`)
    const before = readFileSync(file, 'utf8')
    const read = createVaultStore(vault).listIdeas()
    expect(read.find((idea) => idea.id === 'idea-legacy-agent')).toMatchObject({ sourceProject: id, project: id, node: 'thread.B' })
    expect(read.find((idea) => idea.id === 'idea-legacy-chat')).not.toHaveProperty('sourceProject')
    expect(read.find((idea) => idea.id === 'idea-legacy-unlinked')).not.toHaveProperty('sourceProject')
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('在项目页写下的想法记下它在哪个项目里冒出来,不算放进那个项目;项目不存在时不收', () => {
    store.createProject('冒出想法的项目')
    const id = store.listProjects().find((project) => project.name === '冒出想法的项目')!.id
    const created = store.createIdea(undefined, '项目页写下的想法', '先记下来', id)
    expect(created).toMatchObject({ source: { chatTitle: '手动添加' }, sourceProject: id })
    expect(created).not.toHaveProperty('project')
    expect(createVaultStore(vault).listIdeas().find((idea) => idea.id === created.id)).toEqual(created)
    expect(() => store.createIdea(undefined, '不存在的项目', '正文', 'project-nope'))
      .toThrow(expect.objectContaining({ reason: 'not-found' }))
  })

  it('想法关联的项目和 Wiki 页只按用户选的写,写在想法记录的顶层;不存在的项目、页和论文页不收,清空后不留字段', () => {
    store.createProject('被关联的项目')
    const id = store.listProjects().find((project) => project.name === '被关联的项目')!.id
    const idea = store.createIdea(undefined, '关联到别处的想法', '它讲的是另一个项目和一个主题')
    const related = store.updateIdea(idea.id, { relations: { projects: [id, id], pages: ['topics/ptq'] } })
    expect(related.relations).toEqual({ projects: [id], pages: ['topics/ptq'] })
    expect(related).not.toHaveProperty('project')
    const stored = (JSON.parse(readFileSync(join(vault, '.meridian/ideas.json'), 'utf8')) as Record<string, unknown>[])
      .find((record) => record.id === idea.id)!
    expect(stored['relations']).toEqual({ projects: [id], pages: ['topics/ptq'] })
    expect(createVaultStore(vault).listIdeas().find((held) => held.id === idea.id)?.relations)
      .toEqual({ projects: [id], pages: ['topics/ptq'] })

    expect(() => store.updateIdea(idea.id, { relations: { projects: ['project-nope'], pages: [] } }))
      .toThrow(expect.objectContaining({ reason: 'not-found' }))
    expect(() => store.updateIdea(idea.id, { relations: { projects: [], pages: ['topics/nope'] } }))
      .toThrow(expect.objectContaining({ reason: 'not-found' }))
    expect(() => store.updateIdea(idea.id, { relations: { projects: [], pages: ['papers/2404.00456'] } }))
      .toThrow(expect.objectContaining({ reason: 'not-found' }))
    expect(store.updateIdea(idea.id, { relations: { projects: [], pages: [] } })).not.toHaveProperty('relations')
  })

  it('agent 想法文件格式不对时,想法列表照常列出,不把坏文件当想法', async () => {
    store.createProject('坏文件项目')
    const id = store.listProjects().find((project) => project.name === '坏文件项目')!.id
    const repo = join(vault, 'bad-ideas-repo')
    mkdirSync(join(repo, '.meridian/ideas'), { recursive: true })
    await store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    writeFileSync(join(repo, '.meridian/ideas/ideas.json'), '{"schema_version":"meridian.workspace-agent-ideas.v1","ideas":[{"id":"x"}]}')
    expect(store.listIdeas().filter((idea) => idea.source.agent === true)).toEqual([])
  })

  it('agent 想法文件里一条坏了：其余照常进想法列表，坏的那条连同第几条和原因报到 stderr、跳过，文件一字不改', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      store.createProject('一条坏想法项目')
      const id = store.listProjects().find((project) => project.name === '一条坏想法项目')!.id
      const repo = join(vault, 'one-bad-idea-repo')
      mkdirSync(join(repo, '.meridian/ideas'), { recursive: true })
      await store.bindProjectWorkspace(id, { kind: 'local', root: repo })
      const file = join(repo, '.meridian/ideas/ideas.json')
      const text = JSON.stringify({
        schema_version: 'meridian.workspace-agent-ideas.v1',
        ideas: [
          { id: 'good', date: '2026-10-21', title: '按复用距离淘汰前缀缓存', body: '用复用距离替代 LRU。' },
          { id: 'bad', date: '10月21日', title: '日期写坏了', body: '这条读不了。' },
        ],
      })
      writeFileSync(file, text)

      expect(store.listIdeas().filter((idea) => idea.source.agent === true).map((idea) => idea.title))
        .toEqual(['按复用距离淘汰前缀缓存'])
      const reported = error.mock.calls.map(([line]) => String(line)).filter((line) => line.includes(file))
      expect(reported).toEqual([expect.stringContaining('record 2 ')])
      expect(reported[0]).toContain('"date"')
      expect(readFileSync(file, 'utf8')).toBe(text)
    } finally {
      error.mockRestore()
    }
  })

  it('排过手动顺序之后新建的想法排在最前，重开还在；没排过时不写顺序', () => {
    const session = store.createChat('想法排序会话', true)
    const first = store.createIdea(session.id, '第一条', '排序用')
    const second = store.createIdea(session.id, '第二条', '排序用')
    expect(JSON.parse(readFileSync(join(vault, '.meridian', 'state.json'), 'utf8')).ideaOrder).toBeUndefined()
    store.reorderIdeas([first.id, second.id])
    const third = store.createIdea(undefined, '第三条', '排序之后新建')
    expect(createVaultStore(vault).listIdeas().map((idea) => idea.id)).toEqual([third.id, first.id, second.id])
  })

  it('手动设的想法顺序存进 state.json,重开还在;坏 id 被丢弃', () => {
    const session = store.createChat('想法排序会话', true)
    const first = store.createIdea(session.id, '第一条', '排序用')
    const second = store.createIdea(session.id, '第二条', '排序用')
    expect(store.listIdeas().map((idea) => idea.id)[0]).toBe(second.id)
    store.reorderIdeas([first.id, 'no-such-idea'])
    expect(createVaultStore(vault).listIdeas().map((idea) => idea.id)).toEqual([first.id, second.id])
  })

  it('首次打开旧库会把会话里的旧版想法迁到独立列表，删空后不会反复生成', () => {
    const chatFile = join(vault, '.meridian', 'chats.json')
    writeFileSync(chatFile, JSON.stringify([{
      id: 'legacy-chat', title: '旧论文讨论', named: true, archived: false,
      messages: [], idea: { feed: 'legacy-feed', version: 1, first: '验证同一上下文里的可学习分歧' },
    }], null, 2))

    const migrated = createVaultStore(vault, () => '2026-09-17').listIdeas()
    expect(migrated).toEqual([expect.objectContaining({
      title: '继续验证：旧论文讨论',
      body: '验证同一上下文里的可学习分歧',
      source: { chatId: 'legacy-chat', chatTitle: '旧论文讨论' },
      archived: false,
    })])
    const ideasFile = join(vault, '.meridian', 'ideas.json')
    expect(existsSync(ideasFile)).toBe(true)
    writeFileSync(ideasFile, '[]\n')
    expect(createVaultStore(vault, () => '2026-09-18').listIdeas()).toEqual([])
  })

  it('项目完成会归档关联想法，删除的想法可从垃圾桶恢复', async () => {
    store.createProject('想法落地项目')
    const projectId = store.listProjects().find((project) => project.name === '想法落地项目')!.id
    const session = store.createChat('想法来源', true)
    const created = store.createIdea(session.id, '一个方向', '验证这个方向')
    expect(store.updateIdea(created.id, { project: projectId }).project).toBe(projectId)
    await store.updateProject(projectId, { status: '已完成' })
    expect(createVaultStore(vault).listIdeas().find((idea) => idea.id === created.id)?.archived).toBe(true)
    store.deleteIdea(created.id)
    const deleted = store.listTrash().find((entry) => entry.kind === 'idea')!
    expect(deleted.title).toBe('一个方向')
    store.restoreTrash(deleted.id)
    expect(createVaultStore(vault).listIdeas().find((idea) => idea.id === created.id)).toMatchObject({
      project: projectId, archived: true,
    })
  })

  describe('对话改名', () => {
    const said = (text: string) => ({ role: 'you' as const, runs: [{ kind: 'text' as const, text }], actions: [] })

    it('改名存下用户起的名字,重开库还在;之后发出的第一句不再给它起名', () => {
      const fresh = store.createChat('新对话', false)
      expect(store.renameChat(fresh.id, '摊薄的前提')).toEqual({ id: fresh.id, title: '摊薄的前提', archived: false, messageCount: 0 })
      store.appendChatMessages(fresh.id, [said('共享前缀能摊薄多少')])
      expect(store.chatSession(fresh.id).title).toBe('摊薄的前提')
      expect(createVaultStore(vault).chatSession(fresh.id)).toEqual({ id: fresh.id, title: '摊薄的前提', archived: false, messageCount: 1 })
    })

    it('没起名的对话不改名时照旧用第一句起名;论文的阅读对话改不了名,名字不变', () => {
      const fresh = store.createChat('新对话', false)
      store.appendChatMessages(fresh.id, [said('共享前缀能摊薄多少')])
      expect(store.chatSession(fresh.id).title).toBe('共享前缀能摊薄多少')
      const reading = store.chatForPaper('2404.00456')
      expect(() => store.renameChat(reading.id, '别的名字')).toThrow(expect.objectContaining({ reason: 'refused' }))
      expect(createVaultStore(vault).chatSession(reading.id).title).toBe(reading.title)
    })

    it('改不存在的对话报不存在', () => {
      expect(() => store.renameChat('chat-nope', '名字')).toThrow(expect.objectContaining({ reason: 'not-found' }))
    })
  })

  describe('删除对话', () => {
    const said = (text: string) => ({ role: 'you' as const, runs: [{ kind: 'text' as const, text }], actions: [] })
    /** A paper of the example vault. */
    const PAPER = '2404.00456'
    const trashFile = () => readFileSync(join(vault, '.meridian', 'trash.json'), 'utf8')

    it('删掉的对话进垃圾桶：对话列表、搜索和反向链接里都没有它，从它存下的想法还在；恢复回到原来的位置，消息一条不少，重开库还在', () => {
      const older = store.createChat('更早的对话', true)
      const asked = store.createChat('问 PTQ 的边界', true)
      const newer = store.createChat('更新的对话', true)
      store.appendChatMessages(asked.id, [said('@PTQ 的边界在哪')])
      const idea = store.createIdea(asked.id, '旋转与 KV 量化叠加', '先旋转再按 token 量化')
      const messages = store.chatMessages(asked.id)
      const order = [newer.id, asked.id, older.id]
      expect(store.listChats().map((chat) => chat.id)).toEqual(order)
      expect(store.search('问 PTQ').filter((hit) => hit.kind === 'chat').map((hit) => hit.target)).toEqual([asked.id])
      expect(store.wikiBacklinks('topics/ptq').filter((link) => link.kind === 'chat').map((link) => link.id)).toEqual([asked.id])

      store.deleteChat(asked.id)

      expect(store.listChats().map((chat) => chat.id)).toEqual([newer.id, older.id])
      expect(() => store.chatMessages(asked.id)).toThrow(expect.objectContaining({ reason: 'not-found' }))
      expect(store.search('问 PTQ').filter((hit) => hit.kind === 'chat')).toEqual([])
      expect(store.wikiBacklinks('topics/ptq').filter((link) => link.kind === 'chat')).toEqual([])
      expect(store.listIdeas().find((held) => held.id === idea.id)!.source).toEqual({ chatId: asked.id, chatTitle: '问 PTQ 的边界' })
      const deletedAt = Date.parse(`${store.today()}T00:00:00Z`)
      const entry = store.listTrash()[0]!
      expect(entry).toEqual({ id: entry.id, kind: 'chat', title: '问 PTQ 的边界', deletedAt, restorable: true })
      expect(JSON.parse(trashFile())).toEqual([{
        id: entry.id, kind: 'chat', title: '问 PTQ 的边界', deletedAt, position: 1,
        chat: { id: asked.id, title: '问 PTQ 的边界', named: true, archived: false, messages },
      }])
      expect(() => store.deleteChat(asked.id)).toThrow(expect.objectContaining({ reason: 'not-found' }))

      store.restoreTrash(entry.id)

      expect(store.listChats().map((chat) => chat.id)).toEqual(order)
      expect(store.chatMessages(asked.id)).toEqual(messages)
      expect(store.listTrash()).toEqual([])
      const reopened = createVaultStore(vault)
      expect(reopened.listChats().map((chat) => chat.id)).toEqual(order)
      expect(reopened.chatMessages(asked.id)).toEqual(messages)
    })

    it('归档的对话删掉再恢复，回来还是归档的', () => {
      const old = store.createChat('旧的 MoE 讨论', true)
      store.appendChatMessages(old.id, [said('容量因子取多少合适')])
      store.setChatArchived(old.id, true)

      store.deleteChat(old.id)
      expect(store.listChats().map((chat) => chat.id)).not.toContain(old.id)
      store.restoreTrash(store.listTrash()[0]!.id)

      expect(createVaultStore(vault).listChats().find((chat) => chat.id === old.id))
        .toEqual({ id: old.id, title: '旧的 MoE 讨论', archived: true, messageCount: 1 })
    })

    it('论文对话删掉再恢复回到它的论文：这期间论文开出的空对话让位；新对话有了消息就占着位置，那一条恢复不了、留在垃圾桶里', () => {
      const reading = store.chatForPaper(PAPER)
      store.appendChatMessages(reading.id, [said('草稿头为什么只要一层')])
      store.deleteChat(reading.id)
      const fresh = store.chatForPaper(PAPER)
      expect(fresh).toMatchObject({ messageCount: 0, paperId: PAPER })
      expect(fresh.id).not.toBe(reading.id)
      const entry = store.listTrash()[0]!
      expect(entry.restorable).toBe(true)

      store.restoreTrash(entry.id)
      expect(store.chatForPaper(PAPER)).toEqual({ ...reading, messageCount: 1 })
      expect(() => store.chatSession(fresh.id)).toThrow(expect.objectContaining({ reason: 'not-found' }))

      store.deleteChat(reading.id)
      const taken = store.chatForPaper(PAPER)
      store.appendChatMessages(taken.id, [said('换个问法')])
      const held = store.listTrash()[0]!
      expect(held.restorable).toBe(false)
      expect(() => store.restoreTrash(held.id)).toThrow(expect.objectContaining({ reason: 'refused' }))
      expect(store.listTrash().map((item) => item.id)).toContain(held.id)
      expect(store.chatForPaper(PAPER)).toMatchObject({ id: taken.id, messageCount: 1 })
    })

    it('新版本写进对话记录里、这个版本不认识的字段，删掉进垃圾桶、重开库恢复、恢复后再改都原样留着', () => {
      const file = join(vault, '.meridian', 'chats.json')
      const written = {
        id: 'chat-901', title: '新版本写的对话', named: true, archived: false, pinned: true,
        messages: [{
          id: 'msg-902', role: 'you', runs: [{ kind: 'text', text: '新版本问的' }], actions: [], sentAt: '2026-09-10T09:00:00Z',
        }],
      }
      mkdirSync(join(vault, '.meridian'), { recursive: true })
      writeFileSync(file, JSON.stringify([written], null, 2))

      createVaultStore(vault, () => '2026-09-10').deleteChat(written.id)
      expect(JSON.parse(trashFile())[0].chat).toEqual(written)
      const reopened = createVaultStore(vault, () => '2026-09-10')
      reopened.restoreTrash(reopened.listTrash()[0]!.id)
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([written])
      reopened.setChatArchived(written.id, true)
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([{ ...written, archived: true }])
    })

    it('彻底删除、过了保留期和清空垃圾桶都把删掉的对话连同消息一起清掉，再也恢复不了', () => {
      let day = '2026-09-10'
      const dated = createVaultStore(vault, () => day)
      const deleted = (title: string) => {
        const chat = dated.createChat(title, true)
        dated.appendChatMessages(chat.id, [said(`${title}的消息`)])
        dated.deleteChat(chat.id)
        return dated.listTrash()[0]!.id
      }
      const purged = deleted('彻底删的')
      const expired = deleted('过期的')
      dated.purgeTrash(purged)
      expect(trashFile()).not.toContain('彻底删的的消息')
      day = '2026-09-12'
      const cleared = deleted('清空的')
      day = '2026-09-17'
      expect(dated.listTrash().map((item) => item.id)).toEqual([cleared])
      expect(trashFile()).not.toContain('过期的的消息')
      dated.clearTrash()
      expect(trashFile()).not.toContain('清空的的消息')
      for (const id of [purged, expired, cleared]) {
        expect(() => dated.restoreTrash(id)).toThrow(expect.objectContaining({ reason: 'not-found' }))
      }
      expect(createVaultStore(vault, () => day).listChats()).toEqual([])
    })

    it('keeps the id of every chat it holds, a paper\'s empty one and the trashed ones included, until the trash lets them go', () => {
      let day = '2026-09-10'
      const dated = createVaultStore(vault, () => day)
      const listed = dated.createChat('留着的', true).id
      const reading = dated.chatForPaper(PAPER).id
      const trashed = (title: string) => {
        const chat = dated.createChat(title, true)
        dated.deleteChat(chat.id)
        return { chat: chat.id, entry: dated.listTrash()[0]!.id }
      }
      const purged = trashed('彻底删的')
      const expired = trashed('过期的')
      day = '2026-09-12'
      const cleared = trashed('清空的')
      dated.purgeTrash(purged.entry)
      expect(dated.chatIds().sort()).toEqual([listed, reading, expired.chat, cleared.chat].sort())

      day = '2026-09-17'
      expect(createVaultStore(vault, () => day).chatIds().sort()).toEqual([listed, reading, cleared.chat].sort())
      dated.clearTrash()
      expect(dated.chatIds().sort()).toEqual([listed, reading].sort())
    })
  })

  it('记入科研记录:写进项目、把按钮记成已记,再记一次就抛,重开库仍是已记', async () => {
    store.createProject('记录目标')
    const projectId = store.listProjects().find((project) => project.name === '记录目标')!.id
    const session = store.createChat('记录会话', true)
    store.appendChatMessages(session.id, [{
      role: 'ai', runs: [{ kind: 'text', text: '已引用项目' }],
      actions: [{
        kind: 'writeBack', label: '记入科研记录', project: projectId,
        text: '拐点是 batch size 的函数',
      }],
    }])
    const message = store.chatMessages(session.id).at(-1)!
    const after = await store.recordAction(session.id, message.id)
    expect(after.events.at(-1)!.text).toBe('[对话] 拐点是 batch size 的函数')
    expect(store.listChanges()[0]!.title).toBe('项目「记录目标」· 记入科研记录')
    expect(createVaultStore(vault).chatMessages(session.id).at(-1)!.actions[0]!.done).toBe(true)
    expect(() => store.recordAction(session.id, message.id)).toThrow(/已经记入/)
    expect(() => store.recordAction(session.id, 'no-such-message')).toThrow(/no-such-message/)
  })

  it('关联论文按 id 记在项目页上,重复关联与移除没关联的都抛,两笔都记进最近变动并撤得动', async () => {
    store.createProject('关联论文')
    const id = store.listProjects().find((project) => project.name === '关联论文')!.id
    const after = await store.addPaper(id, '2404.00456')
    expect(after.papers).toEqual(['2404.00456'])
    expect(after.paperCount).toBe(1)
    expect(readFileSync(join(vault, 'wiki', 'projects', `${id}.md`), 'utf8'))
      .toContain('papers:\n  - "2404.00456"\n')
    expect(store.listChanges()[0]!.title).toBe('项目「关联论文」· 关联论文')
    expect(() => store.addPaper(id, '2404.00456')).toThrow(/已经关联/)
    expect(() => store.addPaper(id, 'no-such-paper')).toThrow(/no-such-paper/)
    await store.removePaper(id, '2404.00456')
    expect((await createVaultStore(vault).getProject(id)).papers).toEqual([])
    expect(store.listChanges()[0]!.title).toBe('项目「关联论文」· 移除关联论文')
    expect(() => store.removePaper(id, '2404.00456')).toThrow(/没有关联/)
    store.undoChange(store.listChanges()[0]!.id)
    expect((await store.getProject(id)).papers).toEqual(['2404.00456'])
  })

  it('关联 Wiki 条目可以带一页聚合,带了不存在的页就抛', async () => {
    store.createProject('关联页')
    const id = store.listProjects().find((project) => project.name === '关联页')!.id
    const page = store.wikiCards()[0]!
    const after = await store.createRelation(id, { group: 'Wiki', text: page.title, page: page.id })
    expect(after.relations.find((relation) => relation.group === 'Wiki')!.items.at(-1))
      .toMatchObject({ text: page.title, page: page.id })
    expect((await createVaultStore(vault).getProject(id)).relations[0]!.items[0]!.page).toBe(page.id)
    expect(() => store.createRelation(id, {
      group: 'Wiki', text: 'x', page: 'topics/nope',
    })).toThrow(/topics\/nope/)
  })

  it('反向链接只读：正文链到这一页的页、关联它的项目、关联它的想法、读它或 @ 它的对话，读的时候磁盘一个字节不变；从论文对话里来的想法不挂在论文页下', async () => {
    store.createProject('引用 QuaRot')
    const id = store.listProjects().find((project) => project.name === '引用 QuaRot')!.id
    await store.addPaper(id, '2404.00456')
    await store.createRelation(id, { group: 'Wiki', text: 'PTQ', page: 'topics/ptq' })
    const reading = store.chatForPaper('2404.00456')
    store.appendChatMessages(reading.id, [{ role: 'you', runs: [{ kind: 'text', text: '旋转之后还要校准吗' }], actions: [] }])
    const idea = store.createIdea(reading.id, '旋转与 KV 量化叠加', '先旋转再按 token 量化')
    store.updateIdea(idea.id, { relations: { projects: [], pages: ['topics/ptq'] } })
    const asked = store.createChat('问 PTQ', true)
    store.appendChatMessages(asked.id, [{ role: 'you', runs: [{ kind: 'text', text: '@PTQ 的边界在哪' }], actions: [] }])
    const files = (): Record<string, string> => Object.fromEntries(
      (readdirSync(vault, { recursive: true }) as string[]).sort()
        .filter((name) => statSync(join(vault, name)).isFile())
        .map((name) => [name, `${statSync(join(vault, name)).mtimeMs} ${readFileSync(join(vault, name), 'base64')}`]),
    )
    const before = files()

    const paper = store.wikiBacklinks('papers/2404.00456')
    const topic = store.wikiBacklinks('topics/ptq')

    expect(files()).toEqual(before)
    const fixture = createFixtureStore(() => '2026-09-10')
    expect(paper.filter((link) => link.kind === 'page'))
      .toEqual(fixture.wikiBacklinks('papers/2404.00456').filter((link) => link.kind === 'page'))
    // methods/rotation and topics/kv-cache-quantization name the paper only in their generated tables, which are not body text.
    expect(paper.filter((link) => link.kind === 'page').map((link) => link.id)).toEqual(['topics/ptq-weight-activation'])
    expect(paper.filter((link) => link.kind !== 'page')).toEqual([
      { kind: 'project', id, title: '引用 QuaRot' },
      { kind: 'chat', id: reading.id, title: reading.title },
    ])
    expect(topic.filter((link) => link.kind !== 'page')).toEqual([
      { kind: 'project', id, title: '引用 QuaRot' },
      { kind: 'idea', id: idea.id, title: '旋转与 KV 量化叠加' },
      { kind: 'chat', id: asked.id, title: '问 PTQ' },
    ])
    expect(() => store.wikiBacklinks('topics/nope')).toThrow(expect.objectContaining({ reason: 'not-found' }))
  })

  /** A project holding attachments c.csv, b.csv and a.csv in that order; returns its id. */
  const withAttachments = (): string => {
    store.createProject('附件')
    const id = store.listProjects().find((project) => project.name === '附件')!.id
    for (const name of ['a.csv', 'b.csv', 'c.csv']) void store.createAttachment(id, { name, size: '1 KB', path: join(vault, name) })
    return id
  }

  it('删掉的附件从垃圾桶恢复、或撤销这次删除时,回到它原来的位置', async () => {
    const id = withAttachments()
    const before = (await store.getProject(id)).attachments
    expect(before.map((attachment) => attachment.name)).toEqual(['c.csv', 'b.csv', 'a.csv'])
    await store.deleteAttachment(id, before[1]!.id)
    store.restoreTrash(store.listTrash()[0]!.id)
    expect((await store.getProject(id)).attachments).toEqual(before)
    const { change } = recordChange(store, () => store.deleteAttachment(id, before[1]!.id))
    store.undoChange(change)
    expect((await createVaultStore(vault).getProject(id)).attachments).toEqual(before)
  })

  it('旧版本记下的附件垃圾不带位置,恢复时照旧放回末尾', async () => {
    const id = withAttachments()
    const [c, b, a] = (await store.getProject(id)).attachments
    await store.deleteAttachment(id, b!.id)
    const file = join(vault, '.meridian', 'trash.json')
    const written = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>[]
    writeFileSync(file, JSON.stringify(written.map((record) => Object.fromEntries(
      Object.entries(record).filter(([key]) => key !== 'position'),
    ))))
    const reopened = createVaultStore(vault, () => '2026-09-10', () => new Date('2026-09-10T16:05:04.003Z'))
    reopened.restoreTrash(reopened.listTrash()[0]!.id)
    expect((await reopened.getProject(id)).attachments).toEqual([c, a, b])
  })

  it('附件记下本机绝对路径,相对路径不收', async () => {
    store.createProject('附件')
    const id = store.listProjects().find((project) => project.name === '附件')!.id
    const file = join(vault, 'sweep.csv')
    expect((await store.createAttachment(id, {
      name: 'sweep.csv', size: '1 KB', path: file,
    })).attachments.at(-1)).toMatchObject({ name: 'sweep.csv', path: file })
    expect((await createVaultStore(vault).getProject(id)).attachments.at(-1)!.path).toBe(file)
    expect(() => store.createAttachment(id, {
      name: 'y.csv', size: '1 KB', path: 'y.csv',
    })).toThrow(/绝对路径/)
  })

  it('论文表的行从新布局的页来:主题与方法是归属的标题,年份与出处照页上写的', () => {
    expect(store.listPapers({ page: 1, size: 20 }).total).toBe(10)
    expect(store.getPaper('2404.00456')).toMatchObject({
      title: 'QuaRot: Outlier-Free 4-Bit Inference in Rotated LLMs', year: 2024, venue: 'NeurIPS 2024',
      topics: ['Weight-activation PTQ', 'KV cache quantization'], methods: ['Rotation'],
      pageState: '', readState: '未读', updated: '2026-09-01',
    })
    expect(store.search('Rotation')[0]).toMatchObject({ kind: 'aggregation', target: 'methods/rotation' })
  })

  it('应用一条提案:归属写在论文页上,聚合页的对照表回填,别处一个字节不动;撤销逐字节还原', async () => {
    const paper = join(vault, 'wiki', 'papers', '2401.18079.md')
    const agg = join(vault, 'wiki', 'topics', 'ptq-weight-only.md')
    const paperBefore = readFileSync(paper, 'utf8')
    const aggBefore = readFileSync(agg, 'utf8')
    store.applyProposal({
      source: 'ingest', title: '把 KVQuant 归进 Weight-only PTQ',
      ops: [{
        op: 'setMembership', paper: 'papers/2401.18079', in: 'topics/ptq-weight-only',
        cells: { bits: { value: 'W3', page: 1, quote: '3-bit quantization' } },
      }],
    })
    const rows = (await store.wikiAggregation('topics/ptq-weight-only')).rows
    expect(rows.map((r) => r.paper.title)).toContain('KVQuant')
    expect(store.getPaper('2401.18079').topics).toEqual(['KV cache quantization', 'Weight-only PTQ'])
    // Paper page: only the new membership and updated line change.
    const paperAfter = readFileSync(paper, 'utf8')
    expect(paperAfter).toContain('  - in: "topics/ptq-weight-only"')
    expect(paperAfter).toContain('updated: "2026-09-10"')
    // Aggregation page: only the comparison-table region changes.
    const aggAfter = readFileSync(agg, 'utf8')
    expect(aggAfter).toContain('[[papers/2401.18079|KVQuant]] | W3 ·p1 |')
    const outside = (text: string) => text.replace(/<!-- generated:table -->[\s\S]*?<!-- \/generated -->/, '')
    expect(outside(aggAfter)).toBe(outside(aggBefore))
    // Reopening reads the same result.
    expect((await createVaultStore(vault).wikiAggregation('topics/ptq-weight-only')).rows.map((r) => r.paper.title)).toContain('KVQuant')

    const change = store.listChanges()[0]!
    expect(change).toMatchObject({
      title: 'Wiki · 把 KVQuant 归进 Weight-only PTQ',
      diff: ['+ papers/2401.18079 ∈ topics/ptq-weight-only(1 格)'],
      undoable: true,
    })
    store.undoChange(change.id)
    expect(readFileSync(paper, 'utf8')).toBe(paperBefore)
    expect(readFileSync(agg, 'utf8')).toBe(aggBefore)
    expect((await store.wikiAggregation('topics/ptq-weight-only')).rows.map((r) => r.paper.title)).not.toContain('KVQuant')
  })

  it('0.0.14 写的聚合页没有 claims 也没有结论生成区:照原样读出,开库与改别的页都不动它一个字节,写了结论才补上结论区', async () => {
    cpSync(resolve(import.meta.dirname, 'fixtures/wiki-0.0.14'), join(vault, 'wiki'), { recursive: true })
    const page = join(vault, 'wiki', 'topics', 'qat.md')
    const old = readFileSync(page, 'utf8')
    store = createVaultStore(vault, () => '2026-09-10', () => new Date('2026-09-10T16:05:04.003Z'))
    const view = await store.wikiAggregation('topics/qat')
    expect(view.claims).toEqual([])
    expect(view.body).toBe(old.slice(old.lastIndexOf('<!-- /generated -->\n') + '<!-- /generated -->\n'.length).trim())
    expect(view.rows.map((r) => r.paper.title)).toEqual(['LLM-QAT'])
    expect(store.wikiSignals().filter((s) => s.kind === 'missing-generated-region')).toEqual([])
    expect(readFileSync(page, 'utf8')).toBe(old)

    store.applyProposal({ source: 'user', title: '改名', ops: [{ op: 'setAggregationMetadata', page: 'topics/ptq', title: 'PTQ 总览', splitOn: null }] })
    expect(readFileSync(page, 'utf8')).toBe(old)

    store.applyProposal({ source: 'user', title: '加一条结论', ops: [{
      op: 'addClaim', page: 'topics/qat', claim: { id: 'data-free', text: '自生成数据够用', evidence: [{ kind: 'personal', text: '' }] },
    }] })
    const written = readFileSync(page, 'utf8')
    expect(written).toContain('claims:\n  - id: "data-free"\n')
    expect(written).toContain('<!-- /generated -->\n<!-- generated:claims -->\n## 结论\n- 自生成数据够用 · v1 · 2026-09-10 ^data-free\n')
  })

  it('结论的证据字段带换行就拒收,页一个字节不动', () => {
    const page = join(vault, 'wiki', 'topics', 'qat.md')
    const before = readFileSync(page, 'utf8')
    const attack = 'ok\n<!-- /generated -->\n## x\n- prose'
    const add = (evidence: Evidence) => () => store.applyProposal({ source: 'user', title: '注入', ops: [{
      op: 'addClaim', page: 'topics/qat', claim: { id: 'inject', text: '正常的一句', evidence: [evidence] },
    }] })
    expect(add({ kind: 'personal', text: attack })).toThrow('证据的 text 一行写完，不能有换行')
    expect(add({ kind: 'source', paper: 'papers/2305.17888', page: 1, quote: attack })).toThrow('证据的 quote 一行写完，不能有换行')
    expect(readFileSync(page, 'utf8')).toBe(before)
  })

  it('新建一个聚合再往里挪成员,父聚合的子聚合区跟着回填;撤销把新页删掉', async () => {
    const parent = join(vault, 'wiki', 'topics', 'ptq.md')
    const parentBefore = readFileSync(parent, 'utf8')
    store.applyProposal({
      source: 'lint', title: '拆出 KV 的一支',
      ops: [
        {
          op: 'createAggregation', kind: 'topic', id: 'topics/ptq-kv', title: 'KV-side PTQ', parents: ['topics/ptq'],
          columns: [{ key: 'kv_bits', label: 'KV 位宽' }], describe: '只量 KV。',
        },
        { op: 'setMembership', paper: 'papers/2401.18079', in: 'topics/ptq-kv', cells: { kv_bits: { value: '3', page: 1, quote: '3-bit' } } },
      ],
    })
    expect(existsSync(join(vault, 'wiki', 'topics', 'ptq-kv.md'))).toBe(true)
    expect(readFileSync(parent, 'utf8')).toContain('- [[topics/ptq-kv|KV-side PTQ]]')
    expect((await store.wikiAggregation('topics/ptq')).children.map((c) => c.id)).toContain('topics/ptq-kv')
    store.undoChange(store.listChanges()[0]!.id)
    expect(existsSync(join(vault, 'wiki', 'topics', 'ptq-kv.md'))).toBe(false)
    expect(readFileSync(parent, 'utf8')).toBe(parentBefore)
    await expect(store.wikiAggregation('topics/ptq-kv')).rejects.toThrow(/topics\/ptq-kv/)
  })

  it('挂载:子页的 parents 换了,新旧父页的细分区都回填,撤销逐字节还原', async () => {
    const child = join(vault, 'wiki', 'topics', 'kv-cache-quantization.md')
    const oldParent = join(vault, 'wiki', 'topics', 'ptq.md')
    const newParent = join(vault, 'wiki', 'topics', 'quantization.md')
    const before = [child, oldParent, newParent].map((f) => readFileSync(f, 'utf8'))
    store.applyProposal({
      source: 'user', title: '把 KV cache quantization 挂到 Quantization 下',
      ops: [{ op: 'setParents', page: 'topics/kv-cache-quantization', parents: ['topics/long-context-inference', 'topics/quantization'] }],
    })
    expect((await store.wikiAggregation('topics/kv-cache-quantization')).parents.map((p) => p.id))
      .toEqual(['topics/long-context-inference', 'topics/quantization'])
    expect((await store.wikiAggregation('topics/quantization')).children.map((c) => c.id)).toContain('topics/kv-cache-quantization')
    expect((await store.wikiAggregation('topics/ptq')).children.map((c) => c.id)).not.toContain('topics/kv-cache-quantization')
    // On disk, generated child regions change for both old and new parents.
    expect(readFileSync(oldParent, 'utf8')).not.toContain('[[topics/kv-cache-quantization|')
    expect(readFileSync(newParent, 'utf8')).toContain('[[topics/kv-cache-quantization|KV cache quantization]]')
    const change = store.listChanges()[0]!
    expect(change).toMatchObject({ title: 'Wiki · 把 KV cache quantization 挂到 Quantization 下', undoable: true })
    store.undoChange(change.id)
    expect([child, oldParent, newParent].map((f) => readFileSync(f, 'utf8'))).toEqual(before)
  })

  it('同一条提案里先建页再挂到别处:回填集合照样算得出,不崩', async () => {
    store.applyProposal({
      source: 'user', title: '新建再挂',
      ops: [
        { op: 'createAggregation', kind: 'topic', id: 'topics/new-branch', title: 'New branch', parents: ['topics/ptq'], columns: [], describe: '' },
        { op: 'setParents', page: 'topics/new-branch', parents: ['topics/quantization'] },
      ],
    })
    expect((await store.wikiAggregation('topics/new-branch')).parents.map((p) => p.id)).toEqual(['topics/quantization'])
    expect((await store.wikiAggregation('topics/quantization')).children.map((c) => c.id)).toContain('topics/new-branch')
    expect((await store.wikiAggregation('topics/ptq')).children.map((c) => c.id)).not.toContain('topics/new-branch')
    // On disk, the original parent no longer lists the page and the replacement parent does.
    expect(readFileSync(join(vault, 'wiki', 'topics', 'ptq.md'), 'utf8')).not.toContain('topics/new-branch')
    expect(readFileSync(join(vault, 'wiki', 'topics', 'quantization.md'), 'utf8')).toContain('topics/new-branch')
  })

  it('撤销只写回提案碰到的页:别的聚合页在这之间被手改过,手改留着', async () => {
    const other = join(vault, 'wiki', 'topics', 'qat.md')
    store.applyProposal({
      source: 'ingest', title: '把 KVQuant 归进 Weight-only PTQ',
      ops: [{
        op: 'setMembership', paper: 'papers/2401.18079', in: 'topics/ptq-weight-only',
        cells: { bits: { value: 'W3', page: 1, quote: '3-bit quantization' } },
      }],
    })
    const edited = readFileSync(other, 'utf8')
      .replace('<!-- generated:table -->', '<!-- generated:table -->\n手改的一行')
    writeFileSync(other, edited, 'utf8')
    store.undoChange(store.listChanges()[0]!.id)
    expect(readFileSync(other, 'utf8')).toBe(edited)
    expect((await store.wikiAggregation('topics/ptq-weight-only')).rows.map((r) => r.paper.title)).not.toContain('KVQuant')
  })

  it('提案会写的页:op 点名的在前,回填生成区的聚合跟在后面', () => {
    expect(store.proposalPages({
      source: 'ingest', title: 'x',
      ops: [{
        op: 'setMembership', paper: 'papers/2401.18079', in: 'topics/ptq-weight-only',
        cells: { bits: { value: 'W3', page: 1, quote: '3-bit quantization' } },
      }],
    })).toEqual([
      'papers/2401.18079', 'topics/ptq-weight-only', 'topics/kv-cache-quantization', 'methods/non-uniform-quantization',
    ])
  })

  it('不合法的提案既不落盘也不记一条', () => {
    const paper = join(vault, 'wiki', 'papers', '2401.18079.md')
    const before = readFileSync(paper, 'utf8')
    expect(() => store.applyProposal({
      source: 'ingest', title: 'x',
      ops: [
        { op: 'setMembership', paper: 'papers/2401.18079', in: 'topics/ptq-weight-only', cells: { bits: { value: 'W3', page: 1, quote: 'q' } } },
        { op: 'setMembership', paper: 'papers/2401.18079', in: 'topics/nope', cells: {} },
      ],
    })).toThrow(/topics\/nope/)
    expect(readFileSync(paper, 'utf8')).toBe(before)
    expect(store.listChanges().some((c) => c.title.startsWith('Wiki ·'))).toBe(false)
  })

  it('要回填的聚合页被手改掉了生成区,提案在写之前就被拒,一个字节不落盘', () => {
    const agg = join(vault, 'wiki', 'topics', 'ptq-weight-only.md')
    const paper = join(vault, 'wiki', 'papers', '2401.18079.md')
    const paperBefore = readFileSync(paper, 'utf8')
    const rows = readFileSync(agg, 'utf8').split('\n')
    const open = rows.indexOf('<!-- generated:table -->')
    const close = rows.indexOf('<!-- /generated -->', open + 1)
    writeFileSync(agg, rows.filter((_, i) => i !== open && i !== close).join('\n'), 'utf8')

    expect(() => store.applyProposal({
      source: 'ingest', title: 'x',
      ops: [{
        op: 'setMembership', paper: 'papers/2401.18079', in: 'topics/ptq-weight-only',
        cells: { bits: { value: 'W3', page: 1, quote: '3-bit quantization' } },
      }],
    })).toThrow(/生成区/)
    expect(readFileSync(paper, 'utf8')).toBe(paperBefore)
    expect(store.listChanges().some((c) => c.title.startsWith('Wiki ·'))).toBe(false)
  })

  it('新布局的页写阅读状态:read_state 插在 memberships 之前,别处一个字节不动;主题不能直接改', () => {
    const file = join(vault, 'wiki', 'papers', '2404.00456.md')
    const before = readFileSync(file, 'utf8').split('\n')
    store.updatePaper('2404.00456', { readState: '在读' })
    const after = readFileSync(file, 'utf8').split('\n')
    const at = before.indexOf('memberships:')
    expect(after.slice(0, at).filter((row, i) => row !== before[i])).toEqual(['updated: "2026-09-10"'])
    expect(after[at]).toBe('read_state: "在读"')
    expect(after.slice(at + 1)).toEqual(before.slice(at))
    expect(store.getPaper('2404.00456').readState).toBe('在读')
    expect(createVaultStore(vault).getPaper('2404.00456').readState).toBe('在读')
    expect(() => store.updatePaper('2404.00456', { topics: ['x'] })).toThrow(/归属/)
  })

  it('撤回一条结论记一条能撤销的变动,撤销它把那条结论逐字节放回页上', async () => {
    const file = join(vault, 'wiki', 'topics', 'kv-cache-quantization.md')
    const before = readFileSync(file, 'utf8')
    const claims = async () => (await store.wikiAggregation('topics/kv-cache-quantization')).claims.map((claim) => claim.id)
    const { change } = recordChange(store, () => store.applyProposal({
      source: 'user', title: '撤回「KV cache quantization」的一条结论',
      ops: [{ op: 'retractClaim', page: 'topics/kv-cache-quantization', claim: 'prefix-schedule', reason: '撤回' }],
    }))
    expect(await claims()).toEqual(['per-channel-keys'])
    expect(store.listChanges()[0]).toMatchObject({ id: change, source: '我', undoable: true })
    store.undoChange(change)
    expect(readFileSync(file, 'utf8')).toBe(before)
    expect(await claims()).toEqual(['per-channel-keys', 'prefix-schedule'])
  })

  it('加减论文的主题写的是 Wiki 归属:已有的主题归进那一页,没有的照入库的做法新建一页;每笔记一条变动,倒着撤销逐字节还原', async () => {
    const paper = join(vault, 'wiki', 'papers', '2401.18079.md')
    const weightOnly = join(vault, 'wiki', 'topics', 'ptq-weight-only.md')
    const kv = join(vault, 'wiki', 'topics', 'kv-cache-quantization.md')
    const outliers = join(vault, 'wiki', 'topics', 'outlier-channels.md')
    const before = [paper, weightOnly, kv].map((file) => readFileSync(file, 'utf8'))
    const members = async (topic: string) => (await store.wikiAggregation(topic)).rows.map((row) => row.paper.id)

    const added = recordChange(store, () => store.setPaperTopic('2401.18079', 'Weight-only PTQ', true)).change
    expect(readFileSync(paper, 'utf8')).toContain('  - in: "topics/ptq-weight-only"')
    expect(await members('topics/ptq-weight-only')).toContain('papers/2401.18079')
    const created = recordChange(store, () => store.setPaperTopic('2401.18079', 'Outlier channels', true)).change
    expect(readFileSync(outliers, 'utf8')).toMatch(/^kind: "?topic"?$/m)
    expect((await store.wikiAggregation('topics/outlier-channels')).title).toBe('Outlier channels')
    expect(await members('topics/outlier-channels')).toEqual(['papers/2401.18079'])
    const removed = recordChange(store, () => store.setPaperTopic('2401.18079', 'KV cache quantization', false)).change
    expect(readFileSync(paper, 'utf8')).not.toContain('topics/kv-cache-quantization')
    expect(await members('topics/kv-cache-quantization')).not.toContain('papers/2401.18079')
    expect(store.getPaper('2401.18079').topics).toEqual(['Weight-only PTQ', 'Outlier channels'])
    expect(createVaultStore(vault).getPaper('2401.18079').topics).toEqual(['Weight-only PTQ', 'Outlier channels'])
    expect(store.listChanges().slice(0, 3)).toMatchObject([
      { id: removed, source: '我', undoable: true, diff: ['- papers/2401.18079 ∈ topics/kv-cache-quantization'] },
      {
        id: created, source: '我', undoable: true,
        diff: ['+ topics/outlier-channels 新建(topic)', '+ papers/2401.18079 ∈ topics/outlier-channels(0 格)'],
      },
      { id: added, source: '我', undoable: true, diff: ['+ papers/2401.18079 ∈ topics/ptq-weight-only(0 格)'] },
    ])

    for (const change of [removed, created, added]) store.undoChange(change)
    expect([paper, weightOnly, kv].map((file) => readFileSync(file, 'utf8'))).toEqual(before)
    expect(existsSync(outliers)).toBe(false)
    expect(store.getPaper('2401.18079').topics).toEqual(['KV cache quantization'])
    expect(await members('topics/kv-cache-quantization')).toContain('papers/2401.18079')
  })

  it('论文已在的主题再加、不在的主题去掉都被拒,库里一个字节不动,也不记一条', () => {
    const paper = join(vault, 'wiki', 'papers', '2401.18079.md')
    const before = readFileSync(paper, 'utf8')
    const changes = store.listChanges().length
    expect(() => store.setPaperTopic('2401.18079', 'kv cache  Quantization', true)).toThrow(/KVQuant/)
    expect(() => store.setPaperTopic('2401.18079', 'QAT', false)).toThrow(/KVQuant/)
    expect(readFileSync(paper, 'utf8')).toBe(before)
    expect(store.listChanges()).toHaveLength(changes)
  })

  it('加了主题之后,论文行上的随笔与笔记数照旧', () => {
    store.mutatePaperReading('2401.18079', { kind: 'remark.set', text: '整篇的随想' })
    store.mutatePaperReading('2401.18079', { kind: 'note.add', page: 1, text: '一条笔记' })
    const row = store.getPaper('2401.18079')
    expect(row).toMatchObject({ remark: '整篇的随想', noteCount: 1 })
    store.setPaperTopic('2401.18079', 'Weight-only PTQ', true)
    expect(store.getPaper('2401.18079')).toMatchObject({ remark: '整篇的随想', noteCount: 1 })
    expect(store.listPapers({ page: 1, size: 20 }).rows.find((r) => r.id === '2401.18079'))
      .toMatchObject({ remark: '整篇的随想', noteCount: 1 })
  })

  it('新布局的页也写得下自定义格,行上读得到,重开还在', () => {
    store.setPaperColumns({ ...emptyColumns(), custom: [NOTE_COLUMN] })
    store.updatePaper('2404.00456', { custom: { note: '读到一半' } })
    expect(store.getPaper('2404.00456').custom).toEqual({ note: '读到一半' })
    expect(createVaultStore(vault).getPaper('2404.00456').custom).toEqual({ note: '读到一半' })
  })

  it('删一篇论文,聚合页的对照表与搜索里立刻没有它;恢复之后又回来', async () => {
    store.deletePaper('2401.18079')
    expect((await store.wikiAggregation('topics/kv-cache-quantization')).rows.map((r) => r.paper.title)).not.toContain('KVQuant')
    expect(store.search('KVQuant').some((h) => h.kind === 'paper')).toBe(false)
    expect(() => store.wikiPaper('papers/2401.18079')).toThrow(/2401\.18079/)
    store.restoreTrash(store.listTrash()[0]!.id)
    expect((await store.wikiAggregation('topics/kv-cache-quantization')).rows.map((r) => r.paper.title)).toContain('KVQuant')
  })

  it('改阅读状态之后,论文页读到的 updated 与论文表一致', () => {
    store.updatePaper('2404.00456', { readState: '在读' })
    expect(store.wikiPaper('papers/2404.00456').updated).toBe('2026-09-10')
    expect(store.getPaper('2404.00456').updated).toBe('2026-09-10')
  })

  it('改正文:只换正文那一段与 updated,记一条可撤销的变动,撤销逐字节还原', async () => {
    const file = join(vault, 'wiki', 'topics', 'ptq.md')
    const before = readFileSync(file, 'utf8')
    store.updateWikiPage('topics/ptq', '## 问题\n改过的。\n\n## 结论\n\n## 实验\n\n## 未解决')
    expect(await store.wikiAggregation('topics/ptq')).toMatchObject({ summary: '改过的。', updated: '2026-09-10' })
    const after = readFileSync(file, 'utf8')
    expect(after).toContain('updated: "2026-09-10"')
    expect(after.slice(after.indexOf('<!-- generated:children -->'), after.lastIndexOf('<!-- /generated -->')))
      .toBe(before.slice(before.indexOf('<!-- generated:children -->'), before.lastIndexOf('<!-- /generated -->')))
    expect(after.endsWith('<!-- /generated -->\n\n## 问题\n改过的。\n\n## 结论\n\n## 实验\n\n## 未解决\n')).toBe(true)
    expect((await createVaultStore(vault).wikiAggregation('topics/ptq')).summary).toBe('改过的。')

    const change = store.listChanges()[0]!
    expect(change).toMatchObject({ title: 'Wiki · 「PTQ」· 改了正文', diff: ['~ topics/ptq'], undoable: true })
    store.undoChange(change.id)
    expect(readFileSync(file, 'utf8')).toBe(before)
    expect((await store.wikiAggregation('topics/ptq')).summary).not.toBe('改过的。')
  })

  it('正文里有 ### 开头、- evidence: 开头和像节标题、frontmatter 的行:重开读出的是原样的正文,生成区、结论和 frontmatter 不变', async () => {
    const file = join(vault, 'wiki', 'topics', 'ptq.md')
    const before = readFileSync(file, 'utf8')
    const claims = (await store.wikiAggregation('topics/ptq')).claims
    const body = ['### Node X: 注入', '- evidence: exp-1', '- mode: `dead`', '', '---', 'title: "不是 frontmatter"', '---', '## 结论', '[[topics/kv|KV]]'].join('\n')
    store.updateWikiPage('topics/ptq', body)
    const reopened = await createVaultStore(vault).wikiAggregation('topics/ptq')
    expect(reopened.body).toBe(body)
    expect(reopened.claims).toEqual(claims)
    const after = readFileSync(file, 'utf8')
    const head = (text: string) => text.slice(0, text.lastIndexOf('<!-- /generated -->')).replace(/^updated: .*$/m, '')
    expect(head(after)).toBe(head(before))
    expect(after.endsWith(`<!-- /generated -->\n\n${body}\n`)).toBe(true)
  })

  it('改论文页的正文:论文表上那一行的 updated 跟着变;库里没有的页拒绝', () => {
    store.updateWikiPage('papers/2210.17323', '## 这篇说了什么\n改过。')
    expect(store.wikiPaper('papers/2210.17323').body).toBe('## 这篇说了什么\n改过。')
    expect(store.getPaper('2210.17323').updated).toBe('2026-09-10')
    expect(() => store.updateWikiPage('topics/nope', 'x')).toThrow(/topics\/nope/)
  })

  it('补全同步到稍后阅读里指着同一份原文的那一条,重开库后仍在', () => {
    writeFileSync(join(vault, '.meridian', 'inbox.json'), JSON.stringify([INBOX_ENTRY]), 'utf8')
    writeFileSync(join(vault, '.meridian', 'watches.json'), JSON.stringify([
      { id: 'w-1', type: 'topic', name: 'quantization', active: true },
    ]), 'utf8')
    store = createVaultStore(vault, () => '2026-09-10', () => new Date('2026-09-10T16:05:04.003Z'))
    expect(store.readLater(INBOX_ENTRY.id)).toBe(true)
    const made = store.completeInboxDownload(INBOX_ENTRY.id, minimalPdf({ lines: [INBOX_ENTRY.title] }))
    const held = store.getPaper(made.paper).title
    expect(store.fillPaperMetadata(made.paper, { title: 'Parsed Title' }, held)).toEqual(['title'])
    expect(createVaultStore(vault).listLater().find((entry) => entry.id === INBOX_ENTRY.id))
      .toMatchObject({ title: 'Parsed Title' })
  })

  it('下载入库的论文页一次写下 PDF 的页数,重开库后读得出', () => {
    writeFileSync(join(vault, '.meridian', 'inbox.json'), JSON.stringify([INBOX_ENTRY]), 'utf8')
    writeFileSync(join(vault, '.meridian', 'watches.json'), JSON.stringify([
      { id: 'w-1', type: 'topic', name: 'quantization', active: true },
    ]), 'utf8')
    store = createVaultStore(vault, () => '2026-09-10', () => new Date('2026-09-10T16:05:04.003Z'))
    const made = store.completeInboxDownload(INBOX_ENTRY.id, minimalPdf({ lines: [INBOX_ENTRY.title] }), 12)
    expect(readFileSync(join(vault, 'wiki', 'papers', `${made.paper}.md`), 'utf8')).toMatch(/^page_count: 12$/m)
    expect(createVaultStore(vault).getPaper(made.paper).pageCount).toBe(12)
  })

  it('入库出的论文页正文为空,能直接编辑', () => {
    // The example vault has no app state and an empty inbox; write one recommendation, then reopen to read it.
    writeFileSync(join(vault, '.meridian', 'inbox.json'), JSON.stringify([INBOX_ENTRY]), 'utf8')
    writeFileSync(join(vault, '.meridian', 'watches.json'), JSON.stringify([
      { id: 'w-1', type: 'topic', name: 'quantization', active: true },
    ]), 'utf8')
    store = createVaultStore(
      vault, () => '2026-09-10', () => new Date('2026-09-10T16:05:04.003Z'),
    )
    const entry = store.listInbox().find((e) => !e.downloaded)!
    const made = store.completeInboxDownload(entry.id, minimalPdf({ lines: [entry.title] }))
    expect(made.kind).toBe('added')
    const id = `papers/${(made as { paper: string }).paper}`
    expect(store.wikiPaper(id)).toMatchObject({ body: '' })
    expect(store.wikiPaper(id).memberships.map((m) => [m.kindLabel, m.aggregation.title]))
      .toContainEqual(['主题', 'Rotation'])
    expect(store.getPaper((made as { paper: string }).paper).addedAt)
      .toBe('2026-09-10T16:05:04.003Z')
    expect(readFileSync(join(vault, 'wiki', `${id}.md`), 'utf8'))
      .toMatch(/in: "topics\/rotation"/)
    store.updateWikiPage(id, '## 读后\n第一笔。')
    expect(store.wikiPaper(id).body).toBe('## 读后\n第一笔。')
  })

  it('科研图:新建节点摆好位并连上前一个,改名改状态,删节点连带它的边;记录可以挂在节点上;节点的写不记变动', async () => {
    store.createProject('科研图')
    const id = store.listProjects().find((project) => project.name === '科研图')!.id
    const changes = store.listChanges().length
    const root = (await store.createNode(id, '起点', null)).graph.nodes.at(-1)!
    expect(root).toMatchObject({
      label: '起点', state: 'idle', x: 12, y: 12, width: 100, writebacks: [],
    })
    const next = await store.createNode(id, '宽树实验', root.id)
    const child = next.graph.nodes.at(-1)!
    expect(child).toMatchObject({ x: 162, y: 12 })
    expect(next.graph.edges).toEqual([[root.id, child.id]])
    await store.updateNode(id, child.id, { label: '宽树 B≥8', state: 'act' })
    expect((await store.createEvent(id, '跑通 B=8', child.id)).events.at(-1))
      .toMatchObject({ text: '跑通 B=8', node: child.id })
    expect((await createVaultStore(vault).getProject(id)).graph.nodes.find((node) => node.id === child.id))
      .toMatchObject({ label: '宽树 B≥8', state: 'act' })
    await store.deleteNode(id, root.id)
    expect((await store.getProject(id)).graph).toEqual({
      nodes: [expect.objectContaining({ id: child.id })], edges: [],
    })
    expect(store.listChanges()).toHaveLength(changes + 1)
    expect(() => store.createEvent(id, 'x', 'no-such-node')).toThrow(/no-such-node/)
    expect(() => store.createNode(id, 'x', 'no-such-node')).toThrow(/no-such-node/)
    expect(() => store.updateNode(id, 'no-such-node', { state: 'done' })).toThrow(/no-such-node/)
  })

  it('正文里带生成区的标记行:拒收,页上一个字节不动,也不记一条变动', () => {
    const file = join(vault, 'wiki', 'topics', 'ptq.md')
    const before = readFileSync(file, 'utf8')
    expect(() => store.updateWikiPage('topics/ptq', '## 问题\n<!-- /generated -->\n偷渡的一行')).toThrow(/生成区的标记/)
    expect(() => store.updateWikiPage('topics/ptq', '<!-- generated:table -->\n## 问题')).toThrow(/生成区的标记/)
    expect(readFileSync(file, 'utf8')).toBe(before)
    expect(store.listChanges().some((c) => c.title.includes('PTQ'))).toBe(false)
  })

  it('上传出的论文页按新布局写:归属是空列表,没有旧布局的名字列表;归进一页聚合后重开库,论文表的主题照归属', async () => {
    const bytes = Uint8Array.from(Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF'))
    const added = store.importPaper('Draft Trees.pdf', bytes).paper
    const text = readFileSync(join(vault, 'wiki', 'papers', `${added.id}.md`), 'utf8')
    expect(text).toMatch(/^memberships: \[\]$/m)
    expect(text).not.toMatch(/^(topics|methods|datasets|metrics|user_insights|claims|page_count|validation_state|trust_state):/m)
    expect(store.wikiPaper(`papers/${added.id}`).memberships).toEqual([])
    store.applyProposal({
      source: 'user', title: '把 Draft Trees 加进 Weight-only PTQ',
      ops: [{ op: 'setMembership', paper: `papers/${added.id}`, in: 'topics/ptq-weight-only', cells: {} }],
    })
    const reopened = createVaultStore(vault, () => '2026-09-10')
    expect(reopened.getPaper(added.id).topics).toEqual(['Weight-only PTQ'])
    expect((await reopened.wikiAggregation('topics/ptq-weight-only')).rows.map((r) => r.paper.id)).toContain(`papers/${added.id}`)
  })

  describe('存下的数据一条一条地读', () => {
    const stored = (name: string): string => join(vault, '.meridian', `${name}.json`)
    const put = (name: string, rows: unknown): void => writeFileSync(stored(name), JSON.stringify(rows))
    const held = (name: string): Record<string, unknown>[] => JSON.parse(readFileSync(stored(name), 'utf8'))
    const reopen = (): VaultStore => createVaultStore(vault, () => '2026-09-10')

    afterEach(() => vi.restoreAllMocks())

    it('列表里有一条读不了:其余照常读出,它连同文件、第几条与原因报到 stderr,存回时原样留着', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const readable = {
        id: 'entry-900', source: 'me', day: '今天', time: '09:00', createdAt: '2026-09-10T09:00:00.000Z',
        body: { kind: 'runs', runs: [{ kind: 'text', text: '读得了的一条' }] },
      }
      const broken = { id: 'entry-901', source: 'robot', day: '今天', time: '09:01', body: { kind: 'chart', points: [1, 2] } }
      put('feed', [readable, broken])
      const reopened = reopen()
      expect((await reopened.listFeed()).map((entry) => entry.id)).toEqual(['entry-900'])
      const reported = error.mock.calls.map(([line]) => String(line)).filter((line) => line.includes(stored('feed')))
      expect(reported).toEqual([expect.stringContaining('record 2 ')])
      expect(reported[0]).toContain('"source"')

      reopened.appendFeed({ source: 'me', body: { kind: 'runs', runs: [{ kind: 'text', text: '新记的一条' }] } })
      expect(held('feed')).toHaveLength(3)
      expect(held('feed').find((row) => row['id'] === 'entry-901')).toEqual(broken)
    })

    it('动态里后来的版本写下的点名分段:列出时带着它点名的实体;这个版本再记一条时那些分段原样存回,新记的不点名', async () => {
      const naming = {
        id: 'entry-902', source: 'lab', day: '今天', time: '09:02', createdAt: '2026-09-10T09:02:00.000Z',
        body: { kind: 'runs', runs: [
          { kind: 'strong', text: '「draft 效率」', target: { kind: 'project', id: 'draft' } }, { kind: 'text', text: '跑完宽树' },
        ] },
      }
      const plain = {
        id: 'entry-903', source: 'me', day: '今天', time: '09:03', createdAt: '2026-09-10T09:03:00.000Z',
        body: { kind: 'runs', runs: [{ kind: 'strong', text: '《GPTQ》' }, { kind: 'text', text: '已入库' }] },
      }
      put('feed', [naming, plain])
      const reopened = reopen()
      expect((await reopened.listFeed()).filter((entry) => entry.id.startsWith('entry-90'))).toEqual([plain, naming])

      reopened.appendFeed({ source: 'me', body: { kind: 'runs', runs: [{ kind: 'text', text: '新记的一条' }] } })
      const [first, second, added] = held('feed')
      expect([first, second]).toEqual([naming, plain])
      expect(added!['body']).toEqual({ kind: 'runs', runs: [{ kind: 'text', text: '新记的一条' }] })
    })

    it('读不了的关注名下的收件不当成孤儿删掉', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      put('watches', [{ id: 'w-1', name: 'NeurIPS', type: 'venue', active: true }])
      put('inbox', [INBOX_ENTRY])
      expect(reopen().listInbox().map((entry) => entry.id)).toEqual(['in-new'])
    })

    it('记录里有这个版本不认识的字段:列出时不带,改过这一条再存回时那些字段还在', () => {
      const identity = { source: 'semantic-scholar' as const, id: '1741101', affiliations: [] }
      put('watches', [{
        id: 'watch-1', name: 'Tri Dao', type: 'author', active: true, color: 'teal',
        identity: { ...identity, orcid: '0000-0001' },
      }])
      const reopened = reopen()
      expect(reopened.listWatches()).toEqual([{ id: 'watch-1', name: 'Tri Dao', type: 'author', active: true, identity }])

      reopened.updateWatch('watch-1', { type: 'author', name: 'Tri Dao', identity: { ...identity, affiliations: ['Princeton'] } })
      expect(held('watches')).toEqual([{
        id: 'watch-1', name: 'Tri Dao', type: 'author', active: true, color: 'teal',
        identity: { ...identity, affiliations: ['Princeton'], orcid: '0000-0001' },
      }])
      expect(reopen().listWatches()).toEqual([expect.objectContaining({ identity: { ...identity, affiliations: ['Princeton'] } })])
    })

    it('不认识的字段跟着它所在的那条:前面的笔记删掉、这条记录在列表里挪了位置,字段还在原来那条笔记上', () => {
      const note = (id: string, page: number) => ({ id, page, text: `第 ${page} 页`, created: '2026-09-01', updated: '2026-09-01' })
      const other = { paperId: '2210.17323', highlights: [], notes: [], remark: '另一篇' }
      put('paper-readings', [
        { paperId: '2404.00456', highlights: [], notes: [note('note-1', 1), { ...note('note-2', 2), mood: 'curious' }], remark: '', pinned: true },
        other,
      ])
      const reopened = reopen()
      expect(reopened.paperReading('2404.00456').notes[1]).toEqual(note('note-2', 2))

      reopened.mutatePaperReading('2404.00456', { kind: 'note.delete', id: 'note-1' })
      expect(held('paper-readings')).toEqual([
        other, { paperId: '2404.00456', highlights: [], notes: [{ ...note('note-2', 2), mood: 'curious' }], remark: '', pinned: true },
      ])
    })

    it('旧格式的记录与新版本写的、读不了的记录在同一个文件里:旧的照常读出,存回时另两条的内容都还在', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      put('watches', [{ id: 'w-1', name: 'quantization', type: 'topic', active: true }])
      // Records written before discovery and download metadata carry no kind, project, reasons, arxiv, semanticId or meta.
      const legacy: Record<string, unknown> = { ...INBOX_ENTRY }
      delete legacy['arxiv']
      delete legacy['meta']
      const newer = { ...INBOX_ENTRY, id: 'in-newer', score: 0.9 }
      const broken = { ...INBOX_ENTRY, id: 'in-broken', title: null }
      put('inbox', [legacy, newer, broken])
      const reopened = reopen()
      expect(reopened.listInbox().map((entry) => entry.id).sort()).toEqual(['in-new', 'in-newer'])
      expect(reopened.listInbox().find((entry) => entry.id === 'in-new')).toMatchObject({ kind: 'watch', title: 'Rotation Revisited' })

      reopened.dismissInbox('in-new')
      const saved = held('inbox')
      expect(saved.find((row) => row['id'] === 'in-new')).toMatchObject({ gone: true, kind: 'watch', arxiv: '' })
      expect(saved.find((row) => row['id'] === 'in-newer')).toMatchObject({ score: 0.9 })
      expect(saved.find((row) => row['id'] === 'in-broken')).toEqual(broken)
    })

    it('state.json 里有这个版本不认识的字段,含嵌套的:照常开库,改设置存回时那些字段还在', () => {
      put('state', { ...held('state') as object, deliverySettings: { maxItemsPerRun: 7, digest: 'weekly' }, focus: { since: '2026-09-01' } })
      const reopened = reopen()
      expect(reopened.deliverySettings()).toEqual({ maxItemsPerRun: 7, maxShownPerScope: 20 })

      reopened.setDeliverySettings({ maxItemsPerRun: 3 })
      expect(held('state')).toMatchObject({ deliverySettings: { maxItemsPerRun: 3, digest: 'weekly' }, focus: { since: '2026-09-01' } })
    })

    it('Wiki 页读不了:开库照常,它不在 Core 给出的内容里并报到 stderr;别的页照常读写,它一个字节不动;写它的请求被拒', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const topic = join(vault, 'wiki', 'topics', 'kv-cache-quantization.md')
      const paper = join(vault, 'wiki', 'papers', '2306.07629.md')
      writeFileSync(topic, readFileSync(topic, 'utf8').replace(/^kind: topic$/m, 'kind: method'))
      writeFileSync(paper, '# 没有 frontmatter 的一页\n')
      const before = [readFileSync(topic, 'utf8'), readFileSync(paper, 'utf8')]
      const reopened = reopen()
      expect(reopened.wikiCards().map((card) => card.id)).not.toContain('topics/kv-cache-quantization')
      expect(reopened.listPapers({ page: 1, size: 50 }).rows.map((row) => row.id)).not.toContain('2306.07629')
      expect(error).toHaveBeenCalledWith(expect.stringContaining('topics/kv-cache-quantization'))
      expect(error).toHaveBeenCalledWith(expect.stringContaining('papers/2306.07629'))

      // KVQuant is also a member of the unreadable topic, whose generated regions must not be refilled.
      reopened.applyProposal({
        source: 'user', title: '把 KVQuant 归进 Weight-only PTQ',
        ops: [{ op: 'setMembership', paper: 'papers/2401.18079', in: 'topics/ptq-weight-only', cells: {} }],
      })
      expect(reopened.getPaper('2401.18079').topics).toEqual(['Weight-only PTQ'])
      expect(reopened.wikiPaper('papers/2401.18079').title).toMatch(/^KVQuant:/)
      expect(() => reopened.updateWikiPage('topics/kv-cache-quantization', '## 问题\n新的')).toThrow(/读不了/)
      expect(() => reopened.applyProposal({
        source: 'user', title: '重建 KV 量化',
        ops: [{ op: 'createAggregation', kind: 'topic', id: 'topics/kv-cache-quantization', title: 'KV', parents: [], columns: [], describe: '新的' }],
      })).toThrow(/读不了/)
      expect([readFileSync(topic, 'utf8'), readFileSync(paper, 'utf8')]).toEqual(before)
    })

    it('项目页读不了:开库照常,项目列表里没有它并报到 stderr,它名下的推荐留着;改它的请求被拒,页一个字节不动', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      store.createProject('读得了')
      store.createProject('读不了')
      const id = store.listProjects().find((project) => project.name === '读不了')!.id
      const file = join(vault, 'wiki', 'projects', `${id}.md`)
      writeFileSync(file, readFileSync(file, 'utf8').replace(/^priority: .*$/m, 'priority: "p9"'))
      const before = readFileSync(file, 'utf8')
      put('inbox', [{ ...INBOX_ENTRY, kind: 'discovery', watch: '', project: id }])
      const reopened = reopen()
      expect(reopened.listProjects().map((project) => project.name)).toEqual(['读得了'])
      expect(error).toHaveBeenCalledWith(expect.stringContaining(file))
      expect(reopened.listInbox().map((entry) => entry.id)).toEqual(['in-new'])
      expect(() => reopened.updateProject(id, { focus: '换个焦点' })).toThrow(/读不了/)
      expect(readFileSync(file, 'utf8')).toBe(before)
    })

    it('最近变动:读不了的一条与撤销数据读不了的一条存回时原样留着,改过的连同原来的撤销数据留着;不认识的字段也留着', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      store.updatePaper('2404.00456', { readState: '在读' })
      const [readable] = held('changelog')
      // Written before archiving existed, with a project snapshot that cannot be read: the reader defaults
      // `archived` and upgrades the graph, yet the file must keep the record as written.
      const oldUndo: Record<string, unknown> = {
        ...readable, id: 'change-900', target: { kind: 'project', id: 'p' },
        restore: { kind: 'project', project: { name: 3, graph: { nodes: [], edges: [], activePath: ['n'] } } },
      }
      delete oldUndo['archived']
      const newUndo = { ...readable, id: 'change-901', target: { kind: 'dataset', id: 'imagenet' }, restore: { kind: 'dataset', rows: 3 } }
      const garbage = { id: 'change-902', kind: 'telemetry' }
      put('changelog', [{ ...readable, reviewer: 'someone' }, oldUndo, newUndo, garbage])
      const reopened = reopen()
      expect(reopened.listChanges().map((change) => [change.id, change.undoable]))
        .toEqual([[readable!['id'], true], ['change-900', false], ['change-901', false]])

      reopened.archiveChange(readable!['id'] as string)
      reopened.archiveChange('change-901')
      const saved = held('changelog')
      expect(saved).toHaveLength(4)
      expect(saved.find((row) => row['id'] === readable!['id'])).toMatchObject({ reviewer: 'someone', archived: true })
      expect(saved.find((row) => row['id'] === 'change-900')).toEqual(oldUndo)
      expect(saved.find((row) => row['id'] === 'change-901')).toEqual({ ...newUndo, archived: true })
      expect(saved.find((row) => row['id'] === 'change-902')).toEqual(garbage)
    })
  })

  describe('Wiki 卡片的更多菜单：改名、合并、删除', () => {
    /** Every Markdown file under the vault's `wiki/`, by path, with its text. */
    const pages = (): Record<string, string> => Object.fromEntries(
      (readdirSync(join(vault, 'wiki'), { recursive: true, encoding: 'utf8' }) as string[])
        .filter((name) => name.endsWith('.md')).sort()
        .map((name) => [name, readFileSync(join(vault, 'wiki', name), 'utf8')]),
    )
    const file = (id: string) => join(vault, 'wiki', `${id}.md`)
    const WO = 'topics/ptq-weight-only'
    const WA = 'topics/ptq-weight-activation'

    it('改名：正文里标签写着旧名的链接跟着改成新名，别的标签不动；论文表里的主题名跟着变；撤销逐字节还原', () => {
      store.updateWikiPage('papers/2306.00978', `见 [[${WO}|Weight-only PTQ]] 和 [[${WO}|仅权重]]，还有 [[${WO}]]。`)
      const before = pages()
      store.applyProposal({
        source: 'user', title: '改名',
        ops: [{ op: 'setAggregationMetadata', page: WO, title: 'W-only PTQ', splitOn: null }],
      })
      expect(store.wikiPaper('papers/2306.00978').body).toBe(`见 [[${WO}|W-only PTQ]] 和 [[${WO}|仅权重]]，还有 [[${WO}]]。`)
      expect(store.getPaper('2210.17323').topics).toContain('W-only PTQ')
      expect(store.getPaper('2210.17323').topics).not.toContain('Weight-only PTQ')
      store.undoChange(store.listChanges()[0]!.id)
      expect(pages()).toEqual(before)
      expect(store.getPaper('2210.17323').topics).toContain('Weight-only PTQ')
    })

    it('删掉一页：页进垃圾桶，下面的细分挂到它的上级下，成员的归属原样留着；记一条变动，撤销逐字节还原，垃圾桶里那一条也没了', async () => {
      const before = pages()
      store.deleteWikiPage('topics/ptq')
      expect(existsSync(file('topics/ptq'))).toBe(false)
      expect(store.listTrash()[0]).toMatchObject({ kind: 'page', title: 'PTQ', restorable: true })
      expect((await store.wikiAggregation(WO)).parents.map((p) => p.id)).toEqual(['topics/quantization'])
      expect((await store.wikiAggregation('topics/kv-cache-quantization')).parents.map((p) => p.id))
        .toEqual(['topics/quantization', 'topics/long-context-inference'])
      expect((await store.wikiAggregation('topics/quantization')).children.map((c) => c.id))
        .toEqual(expect.arrayContaining([WO, WA, 'topics/kv-cache-quantization']))
      expect(readFileSync(file('topics/quantization'), 'utf8')).not.toContain('[[topics/ptq|')
      expect(store.listChanges()[0]).toMatchObject({
        title: 'Wiki · 「PTQ」· 删掉', undoable: true,
        diff: ['- topics/ptq', ...['topics/kv-cache-quantization', WA, WO].map((child) => `~ ${child} 属于上一级`)],
      })
      store.undoChange(store.listChanges()[0]!.id)
      expect(pages()).toEqual(before)
      expect(store.listTrash().filter((entry) => entry.kind === 'page')).toEqual([])
    })

    it('删掉的页被别的途径放回原处（例如 0.0.21.4 撤销）：垃圾桶不再列它，下次写垃圾桶时那一条连同存的页一起去掉，不记变动', () => {
      store.deleteWikiPage('topics/qat')
      const entry = store.listTrash()[0]!
      const held = join(vault, '.meridian', 'trash', `${entry.id}.md`)
      // What an older App's undo does: the page text comes back, and a later refill may rewrite its generated regions.
      writeFileSync(file('topics/qat'), readFileSync(held, 'utf8').replace('## 子聚合\n(无)', '## 子聚合\n(改过的生成区)'))
      const changes = store.listChanges().length
      const reopened = createVaultStore(vault, () => '2026-09-10')
      expect(reopened.listTrash().filter((item) => item.kind === 'page')).toEqual([])
      reopened.deleteWikiPage('topics/ptq-weight-only')
      const stored = JSON.parse(readFileSync(join(vault, '.meridian', 'trash.json'), 'utf8')) as { id: string }[]
      expect(stored.map((item) => item.id)).not.toContain(entry.id)
      expect(existsSync(held)).toBe(false)
      expect(reopened.listChanges().length).toBe(changes + 1)
    })

    it('原处是另一页（不是放回来的那一页）时，垃圾桶照样列着它，恢复不了', () => {
      store.deleteWikiPage('topics/qat')
      writeFileSync(file('topics/qat'), '---\nkind: topic\ntitle: 别的\n---\n')
      expect(createVaultStore(vault, () => '2026-09-10').listTrash().filter((item) => item.kind === 'page')).toEqual([
        expect.objectContaining({ title: 'QAT', restorable: false }),
      ])
    })

    it('从垃圾桶恢复删掉的页：回到原处，上级页的细分里又有它；原处被另一页占着时恢复不了，那一页一个字节不动', async () => {
      const held = readFileSync(file('topics/qat'), 'utf8')
      store.deleteWikiPage('topics/qat')
      const entry = store.listTrash()[0]!
      store.restoreTrash(entry.id)
      expect(readFileSync(file('topics/qat'), 'utf8')).toBe(held)
      expect((await store.wikiAggregation('topics/quantization')).children.map((c) => c.id)).toContain('topics/qat')
      store.deleteWikiPage('topics/qat')
      writeFileSync(file('topics/qat'), '---\nkind: topic\ntitle: 别的\n---\n')
      expect(store.listTrash()[0]).toMatchObject({ kind: 'page', restorable: false })
      expect(() => store.restoreTrash(store.listTrash()[0]!.id)).toThrow(/占/)
      expect(readFileSync(file('topics/qat'), 'utf8')).toBe('---\nkind: topic\ntitle: 别的\n---\n')
    })

    /** The cards of `from` and `into` as the Wiki shows them now. */
    const shown = (from: string, into: string) => {
      const cards = store.wikiCards()
      return { from: cards.find((c) => c.id === from)!, into: cards.find((c) => c.id === into)! }
    }

    it('合并：挑了目标就合并，不再确认；成员、列、结论、链接和项目关联都到了留下的那一页，被并的页进垃圾桶；撤销是一条，逐字节还原', async () => {
      const project = store.createProject('量化实验')
      await store.createRelation(project, { group: 'Wiki', text: '权重激活', page: WA })
      store.updateWikiPage('papers/2306.00978', `对照 [[${WA}|W-A]] 与 [[${WA}#^rotation-kv]]。`)
      const both = store.createIdea(undefined, '旋转加平滑', '把两种变换叠起来试。')
      store.updateIdea(both.id, { relations: { projects: [], pages: [WA, WO] } })
      const one = store.createIdea(undefined, '激活量化的校准', '少量样本够不够。')
      store.updateIdea(one.id, { relations: { projects: [], pages: [WA, 'topics/qat'] } })
      const ideasBefore = readFileSync(join(vault, '.meridian', 'ideas.json'), 'utf8')
      const relations = (id: string) => store.listIdeas().find((idea) => idea.id === id)!.relations!.pages
      const before = pages()
      const changes = store.listChanges().length
      store.mergeWikiPages(WA, WO, shown(WA, WO))
      expect([relations(both.id), relations(one.id)]).toEqual([[WO], [WO, 'topics/qat']])
      const record = (JSON.parse(readFileSync(join(vault, '.meridian', 'trash.json'), 'utf8')) as { kind: string; ideas?: unknown }[])
        .find((item) => item.kind === 'page')!
      expect(record.ideas).toEqual(expect.arrayContaining([
        { id: both.id, before: [WA, WO], after: [WO] }, { id: one.id, before: [WA, 'topics/qat'], after: [WO, 'topics/qat'] },
      ]))
      expect(existsSync(file(WA))).toBe(false)
      expect(store.listTrash()[0]).toMatchObject({ kind: 'page', title: 'Weight-activation PTQ' })
      const kept = await store.wikiAggregation(WO)
      expect(kept.rows.map((r) => r.paper.id)).toEqual(expect.arrayContaining(['papers/2211.10438', 'papers/2308.13137', 'papers/2405.16406']))
      expect(kept.columns.map((c) => c.key)).toEqual(['bits', 'needs_calib', 'backprop', 'claim', 'transform_where', 'learned'])
      expect(kept.claims.map((c) => c.id)).toContain('rotation-kv')
      expect(kept.body).toContain('## 并自「Weight-activation PTQ」')
      expect(store.wikiPaper('papers/2308.13137').memberships.filter((ms) => ms.aggregation.id === WO)).toHaveLength(1)
      expect((await store.wikiAggregation('topics/kv-cache-quantization')).claims.find((c) => c.id === 'per-channel-keys')!.conflicts[0]!.against)
        .toEqual({ kind: 'claim', ref: `${WO}#rotation-kv` })
      expect(store.wikiPaper('papers/2306.00978').body).toBe(`对照 [[${WO}|W-A]] 与 [[${WO}#^rotation-kv]]。`)
      expect(readFileSync(file(`projects/${project}`), 'utf8')).toContain(`page: "${WO}"`)
      expect((await store.getProject(project)).relations.flatMap((g) => g.items).map((item) => item.page)).toContain(WO)
      expect(store.listChanges().length).toBe(changes + 1)
      store.undoChange(store.listChanges()[0]!.id)
      expect(pages()).toEqual(before)
      expect(store.listTrash().filter((entry) => entry.kind === 'page')).toEqual([])
      expect(readFileSync(join(vault, '.meridian', 'ideas.json'), 'utf8')).toBe(ideasBefore)
    })

    it('合并后从垃圾桶恢复被并的页：想法的关联也回到它身上；之后又改过关联的想法不动', () => {
      const moved = store.createIdea(undefined, '旋转加平滑', '把两种变换叠起来试。')
      store.updateIdea(moved.id, { relations: { projects: [], pages: [WA] } })
      const edited = store.createIdea(undefined, '激活量化的校准', '少量样本够不够。')
      store.updateIdea(edited.id, { relations: { projects: [], pages: [WA] } })
      store.mergeWikiPages(WA, WO, shown(WA, WO))
      store.updateIdea(edited.id, { relations: { projects: [], pages: [WO, 'topics/qat'] } })
      store.restoreTrash(store.listTrash()[0]!.id)
      const relations = (id: string) => store.listIdeas().find((idea) => idea.id === id)!.relations!.pages
      expect(relations(moved.id)).toEqual([WA])
      expect(relations(edited.id)).toEqual([WO, 'topics/qat'])
    })

    it('合并：两张卡片在挑目标时显示的样子之后有一页变了，就拒绝合并，什么都不写', () => {
      const held = shown(WA, WO)
      store.updateWikiPage(WA, '## 问题\n改过了。')
      const edited = pages()
      expect(() => store.mergeWikiPages(WA, WO, held)).toThrow(expect.objectContaining({ reason: 'changed' }))
      expect(() => store.mergeWikiPages(WA, WO, { ...shown(WA, WO), into: { ...held.into, memberCount: 99 } }))
        .toThrow(expect.objectContaining({ reason: 'changed' }))
      expect(pages()).toEqual(edited)
    })

    it('合并：并进自己或并进另一种页时拒绝，什么都不写；上级并进自己的细分可以', () => {
      const before = pages()
      expect(() => store.mergeWikiPages('topics/ptq', 'topics/ptq', shown('topics/ptq', 'topics/ptq'))).toThrow(/自己/)
      expect(() => store.mergeWikiPages('topics/ptq', 'methods/rotation', shown('topics/ptq', 'methods/rotation'))).toThrow(/同一种/)
      expect(pages()).toEqual(before)
      expect(() => store.mergeWikiPages('topics/quantization', 'topics/ptq', shown('topics/quantization', 'topics/ptq'))).not.toThrow()
    })
  })
})
