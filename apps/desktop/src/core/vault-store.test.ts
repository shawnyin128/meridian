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
  PaperRowSchema, SearchHitSchema, WikiAggregationCardSchema, WikiHomeSchema, WikiPaperSchema, type Evidence,
} from '../shared/contract.js'
import { stableJson } from './changelog.js'
import { createFixtureStore } from './fixture-store.js'
import { emptyColumns } from './paper-library/index.js'
import type { VaultStore } from './vault.js'
import { createDesktopVaultStore, createVaultStore, isGitManaged } from './vault-store.js'
import { generatedChildren, generatedTable, pageVersion, readWikiData } from './wiki/index.js'
import { prepareSelectedLibrary } from './workspace-layout.js'
import { minimalPdf } from './net/minimal-pdf.js'

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

  it('论文行带上记着它的项目,按项目名能筛能分组,结论数加上引它的项目结论', () => {
    const before = store.getPaper(WITH_SOURCE).conclusionCount
    store.createProject('项目甲')
    const id = store.listProjects().find((project) => project.name === '项目甲')!.id
    store.addPaper(id, WITH_SOURCE)
    store.createConclusion(id, '引了这一篇', { paper: WITH_SOURCE })
    expect(store.getPaper(WITH_SOURCE).projects).toEqual([{ id, name: '项目甲' }])
    expect(store.getPaper(WITH_SOURCE).conclusionCount).toBe(before + 1)
    expect(store.listPapers({ page: 1, size: 5, filter: '项目甲' }).rows.map((paper) => paper.id))
      .toEqual([WITH_SOURCE])
    expect(store.facetPapers('projects'))
      .toEqual([expect.objectContaining({ value: '项目甲', count: 1 })])
    expect(store.listPapers({
      page: 1, size: 5, facet: { field: 'projects', value: '项目甲' },
    }).total).toBe(1)
    store.updateProject(id, { name: '项目乙' })
    expect(store.getPaper(WITH_SOURCE).projects).toEqual([{ id, name: '项目乙' }])
  })

  it('项目发现档案从关联论文取种子,结果与反馈重开后仍保留', () => {
    store.updatePaper(WITH_SOURCE, { identifier: 'arXiv:2211.17192' })
    store.createProject('发现项目')
    const projectId = store.listProjects().find((project) => project.name === '发现项目')!.id
    store.addPaper(projectId, WITH_SOURCE)
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

  it('推荐方向的核心与启停偏好重开后仍保留,且不写入 Wiki 页面', () => {
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
    store.addPaper(projectId, WITH_SOURCE)
    store.addPaper(projectId, imported.id)
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

  it('阻塞:写上就在页上多一行,清掉就把那一行去掉,撤销放回原样', () => {
    store.createProject('阻塞')
    const id = store.listProjects().find((project) => project.name === '阻塞')!.id
    const file = join(vault, 'wiki', 'projects', `${id}.md`)
    const before = readFileSync(file, 'utf8')
    expect(store.updateProject(id, { block: '等 A100 机时' }).block).toBe('等 A100 机时')
    expect(readFileSync(file, 'utf8')).toMatch(/^block: "等 A100 机时"$/m)
    expect(store.listProjects().find((project) => project.id === id)!.block).toBe('等 A100 机时')
    const cleared = store.updateProject(id, { block: null })
    expect('block' in cleared).toBe(false)
    expect(readFileSync(file, 'utf8')).toBe(before)
    store.undoChange(store.listChanges()[0]!.id)
    expect(createVaultStore(vault).getProject(id).block).toBe('等 A100 机时')
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
      expect(() => createVaultStore(bare)).toThrow(`库里没有论文页目录:${join(bare, 'wiki', 'papers')}`)
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
      expect(() => createVaultStore(bare)).toThrow(`库里没有 Wiki 结构文件:${join(bare, 'wiki', 'schema.yaml')}`)
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

  it('两页记着同一份原文这件事被当成数据质量信号报出来,不是藏掉一页', () => {
    const dir = join(vault, 'wiki', 'papers')
    copyFileSync(join(dir, `${WITH_SOURCE}.md`), join(dir, 'STAR-again.md'))
    const said = JSON.stringify(createVaultStore(vault).listFeed())
    expect(said).toContain(SOURCE_ID)
    expect(said).toContain('STAR-again')
    expect(said).toContain(WITH_SOURCE)
    // Report the condition only once.
    expect(createVaultStore(vault).listFeed().length)
      .toBe(JSON.parse(said).length)
  })

  it('每页原文各一份的库不报这件事', () => {
    expect(JSON.stringify(store.listFeed())).not.toContain('各被不止一页记着')
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

  it('取不存在的页会抛出而不是给一页空的', () => {
    expect(() => store.wikiPaper('papers/no-such-paper')).toThrow(/no-such-paper/)
    expect(() => store.wikiAggregation('topics/no-such-topic')).toThrow(/no-such-topic/)
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

  it('手动设的项目顺序存进 state.json,重开还在;坏 id 被丢弃', () => {
    store.createProject('顺序甲')
    store.createProject('顺序乙')
    const [a, b] = store.listProjects().filter((p) => p.name === '顺序甲' || p.name === '顺序乙')
    expect(store.listProjects().map((p) => p.id)).toEqual([a!.id, b!.id])
    store.reorderProjects([b!.id, 'no-such-project'])
    const reordered = createVaultStore(vault).listProjects().map((p) => p.id)
    expect(reordered.indexOf(b!.id)).toBeLessThan(reordered.indexOf(a!.id))
  })

  it('论文推送配置有默认值，写进 state.json 后重开仍保留', () => {
    expect(store.deliverySettings()).toEqual({ maxItemsPerRun: 10 })
    store.setDeliverySettings({ maxItemsPerRun: 7 })
    expect(createVaultStore(vault).deliverySettings()).toEqual({ maxItemsPerRun: 7 })
    expect(JSON.parse(readFileSync(join(vault, '.meridian', 'state.json'), 'utf8')))
      .toMatchObject({ deliverySettings: { maxItemsPerRun: 7 } })
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

  it('读出来的首页、聚合页、论文页与 fixture store 的一模一样;页版本是磁盘上那一页的版本', () => {
    const fixture = createFixtureStore(() => '2026-09-10')
    // The fixture has no files; its versions fingerprint the page as Core would write it, not the hand-written example.
    const unversioned = <T extends { version: unknown }>(view: T): Omit<T, 'version'> => {
      const { version, ...rest } = view
      expect(version).toMatchObject({ fm: expect.stringMatching(/^[0-9a-f]{16}$/) })
      return rest
    }
    expect(store.wikiHome()).toEqual(fixture.wikiHome())
    expect(unversioned(store.wikiAggregation('topics/ptq-weight-only')))
      .toEqual(unversioned(fixture.wikiAggregation('topics/ptq-weight-only')))
    expect(unversioned(store.wikiPaper('papers/2404.00456'))).toEqual(unversioned(fixture.wikiPaper('papers/2404.00456')))
    expect(store.wikiAggregation('topics/ptq').version)
      .toEqual(pageVersion(readFileSync(join(vault, 'wiki', 'topics', 'ptq.md'), 'utf8')))
    expect(store.wikiCards().map((c) => c.id)).toEqual(fixture.wikiCards().map((c) => c.id))
  })

  it('项目的论文数只数库里还在的那几篇,标题取完整标题', () => {
    store.createProject('论文数')
    const id = store.listProjects().find((p) => p.name === '论文数')!.id
    store.putProject({ ...store.getProject(id), papers: ['2404.00456', 'no-such-paper'] })
    const detail = store.getProject(id)
    expect(detail.papers).toEqual(['2404.00456', 'no-such-paper'])
    expect(detail.paperTitles).toEqual({ '2404.00456': store.getPaper('2404.00456').title })
    expect(detail.paperTitles['2404.00456']).toMatch(/^QuaRot: /)
    expect(detail.paperCount).toBe(1)
    expect(store.listProjects().find((p) => p.id === id)!.paperCount).toBe(1)
    const page = readFileSync(join(vault, 'wiki', 'projects', `${id}.md`), 'utf8')
    expect(page).toContain('papers:\n  - "2404.00456"\n  - "no-such-paper"\n')
    expect(page).not.toMatch(/^paper_count:/m)
    expect(createVaultStore(vault).getProject(id).paperCount).toBe(1)
  })

  it('项目任务的两小时窗口写进页面,重开仍在,也能清回全天', () => {
    store.createProject('分时规划')
    const id = store.listProjects().find((project) => project.name === '分时规划')!.id
    const made = store.createTask(id, {
      title: '实现窗口控制', start: '2026-09-10', end: '2026-09-10',
      window: { start: '14:00', end: '18:00' }, state: 'plan', priority: 'p0',
    })
    const task = made.tasks[0]!
    expect(createVaultStore(vault).getProject(id).tasks[0]!.window)
      .toEqual({ start: '14:00', end: '18:00' })
    store.updateTask(id, task.id, { window: null })
    expect(createVaultStore(vault).getProject(id).tasks[0]!.window).toBeUndefined()
  })

  it('拖拽重排的任务顺序写进页面并刷新共享计划面,重开也保持这个顺序', () => {
    store.createProject('排序项目')
    const id = store.listProjects().find((project) => project.name === '排序项目')!.id
    const titles = ['第一个任务', '第二个任务', '第三个任务']
    for (const title of titles) {
      store.createTask(id, { title, start: '2026-09-10', end: '2026-09-10', state: 'plan', priority: 'p1' })
    }
    const [first, second, third] = store.getProject(id).tasks
    const reordered = [third!.id, first!.id, second!.id]
    const after = store.reorderTasks(id, reordered)
    expect(after.tasks.map((t) => t.id)).toEqual(reordered)
    expect(createVaultStore(vault).getProject(id).tasks.map((t) => t.id)).toEqual(reordered)

    const repo = join(vault, 'sort-repo')
    mkdirSync(repo)
    store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    const flipped = [second!.id, third!.id, first!.id]
    store.reorderTasks(id, flipped)
    const plan = JSON.parse(readFileSync(join(repo, '.meridian/control/plan.json'), 'utf8')) as {
      tasks: { id: string }[]
    }
    expect(plan.tasks.map((task) => task.id)).toEqual(flipped)
  })

  it('节点结论:列进项目结论,验证后是已验证并存在项目页上,写进 Wiki 后看得到页与版本,结论改了回到待验证', () => {
    store.createProject('结论链')
    const id = store.listProjects().find((p) => p.name === '结论链')!.id
    const task = store.createTask(id, {
      title: '跑宽度扫描', start: '2026-09-10', end: '2026-09-10', state: 'done', priority: 'p1',
    }).tasks[0]!.id
    const repo = join(vault, 'chain-repo')
    mkdirSync(repo)
    store.bindProjectWorkspace(id, { kind: 'local', root: repo })
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
    const shown = store.getProject(id).projectConclusions!
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
    expect(write).toThrow(/节点 t.A 的结论还没验证/)
    expect(() => store.verifyConclusion(id, 't.B', shown[0]!.fingerprint!)).toThrow(/t.B/)
    expect(counts()).toEqual({ verified: 0, pending: 1, conflicting: 0 })

    store.verifyConclusion(id, 't.A', shown[0]!.fingerprint!)
    expect(createVaultStore(vault).getProject(id).projectConclusions![0]).toMatchObject({ state: 'verified', verifiedOn: '2026-09-10' })
    expect(counts()).toEqual({ verified: 1, pending: 0, conflicting: 0 })
    write()
    expect(store.getProject(id).projectConclusions![0]!.wiki).toEqual([{
      page: 'topics/ptq', title: store.wikiAggregation('topics/ptq').title, claim: 'wide-b8', version: 1,
    }])

    graph('宽树在 B≥16 时才净赚')
    expect(store.getProject(id).projectConclusions![0]!.state).toBe('pending')
    expect(() => store.verifyConclusion(id, 't.A', shown[0]!.fingerprint!)).toThrow(/在你打开之后又被改过/)
  })

  it('旧版本记下的项目变动在没验证过结论的项目上照样能撤销', () => {
    store.createProject('旧记录')
    const id = store.listProjects().find((p) => p.name === '旧记录')!.id
    store.updateProject(id, { focus: '新的当前目标' })
    const file = join(vault, '.meridian', 'changelog.json')
    const rows = JSON.parse(readFileSync(file, 'utf8')) as { target: { id: string } | null; after: string }[]
    const detail = store.getProject(id)
    const older = ['name', 'status', 'priority', 'topic', 'focus', 'block', 'start', 'due', 'memo',
      'papers', 'tasks', 'milestones', 'events', 'relations', 'attachments', 'agentSessions'] as const
    const after = createHash('sha256')
      .update(stableJson(Object.fromEntries(older.map((key) => [key, detail[key]])))).digest('hex').slice(0, 16)
    writeFileSync(file, JSON.stringify(rows.map((row) => (row.target?.id === id ? { ...row, after } : row))))
    const reopened = createVaultStore(vault, () => '2026-09-10')
    reopened.undoChange(reopened.listChanges().find((c) => c.title.includes('改了字段'))!.id)
    expect(reopened.getProject(id).focus).not.toBe('新的当前目标')
  })

  it('验证与取消验证都进最近变动,撤销逐项还原;没验证过的项目页不多出这一项', () => {
    store.createProject('验证撤销')
    const id = store.listProjects().find((p) => p.name === '验证撤销')!.id
    const repo = join(vault, 'undo-repo')
    mkdirSync(join(repo, '.meridian/graph'), { recursive: true })
    store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    writeFileSync(join(repo, '.meridian/graph/graph.json'), JSON.stringify({
      schema: 'meridian.lab.graph.v1', edges: [], nodes: [{ id: 't.A', title: '宽树', state: 'supported' }],
      node_details: { 't.A': { conclusion: { text: '宽树净赚', date: '2026-09-09', evidence: ['exp-1'], revision: 'r1' } } },
    }))
    const page = join(vault, 'wiki', 'projects', `${id}.md`)
    const before = readFileSync(page, 'utf8')
    const state = () => store.getProject(id).projectConclusions![0]!.state
    store.verifyConclusion(id, 't.A', store.getProject(id).projectConclusions![0]!.fingerprint!)
    expect(store.listChanges()[0]).toMatchObject({ title: expect.stringContaining('验证结论'), undoable: true })
    store.unverifyConclusion(id, 't.A')
    expect(state()).toBe('pending')
    expect(store.listChanges()[0]).toMatchObject({ title: expect.stringContaining('取消验证结论'), undoable: true })
    store.undoChange(store.listChanges()[0]!.id)
    expect(state()).toBe('verified')
    store.undoChange(store.listChanges().find((c) => c.title.includes('验证结论') && !c.title.includes('取消'))!.id)
    expect(state()).toBe('pending')
    expect(readFileSync(page, 'utf8')).toBe(before)
  })

  it('重排顺序与项目现有任务不是同一批 id 时拒绝写入', () => {
    store.createProject('排序校验项目')
    const id = store.listProjects().find((project) => project.name === '排序校验项目')!.id
    store.createTask(id, { title: '唯一任务', start: '2026-09-10', end: '2026-09-10', state: 'plan', priority: 'p1' })
    const realId = store.getProject(id).tasks[0]!.id
    expect(() => store.reorderTasks(id, [realId, 'no-such-task'])).toThrow(/任务顺序/)
    expect(() => store.reorderTasks(id, [])).toThrow(/任务顺序/)
  })

  it('项目连接代码目录后，任务与里程碑每次修改都刷新共享计划面', () => {
    store.createProject('协议项目')
    const id = store.listProjects().find((project) => project.name === '协议项目')!.id
    const repo = join(vault, 'bound-repo')
    mkdirSync(repo)
    const connected = store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    expect(connected.workspace).toMatchObject({ state: 'ready' })
    store.createTask(id, {
      title: '共享任务', start: '2026-09-15', end: '2026-09-15', state: 'act', priority: 'p1',
    })
    store.createMilestone(id, { date: '2026-09-20', title: '共享里程碑', done: false })
    const planFile = join(repo, '.meridian/control/plan.json')
    const plan = JSON.parse(readFileSync(planFile, 'utf8')) as {
      tasks: { title: string }[]
      milestones: { title: string }[]
    }
    expect(plan.tasks.map((task) => task.title)).toContain('共享任务')
    expect(plan.milestones.map((milestone) => milestone.title)).toContain('共享里程碑')
    expect(createVaultStore(vault).getProject(id).workspace).toMatchObject({ state: 'ready' })
    store.bindProjectWorkspace(id, null)
    expect(store.getProject(id).workspace).toBeUndefined()
    expect(existsSync(planFile)).toBe(true)
  })

  it('删除科研节点会同步解除想法节点关联，不在变动列表留下悬空引用', () => {
    store.createProject('增量想法')
    const projectId = store.listProjects().find((project) => project.name === '增量想法')!.id
    const node = store.createNode(projectId, '待删除节点', null).graph.nodes[0]!
    const repo = join(vault, 'idea-change-repo')
    mkdirSync(repo)
    store.bindProjectWorkspace(projectId, { kind: 'local', root: repo })
    const session = store.createChat('节点想法来源', true)
    const idea = store.createIdea(session.id, '验证节点', '删除节点后不应保留关联')
    store.updateIdea(idea.id, { project: projectId, node: node.id })

    store.deleteNode(projectId, node.id)

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

  it('总览只读本地工作区的科研路径与事件，不把整张图跨到界面', () => {
    store.createProject('本地科研投影')
    const id = store.listProjects().find((project) => project.name === '本地科研投影')!.id
    const repo = join(vault, 'overview-repo')
    mkdirSync(repo)
    store.bindProjectWorkspace(id, { kind: 'local', root: repo })
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

  it('关联仓库里 coding agent 新写的科研记录进动态的「实验」，旧的不刷屏，同一条只进一次', () => {
    let clock = new Date('2026-09-22T10:00:00.000Z')
    const timed = createVaultStore(vault, () => '2026-09-22', () => clock)
    timed.createProject('动态实验流')
    const id = timed.listProjects().find((project) => project.name === '动态实验流')!.id
    const repo = join(vault, 'feed-lab-repo')
    mkdirSync(join(repo, '.meridian/events'), { recursive: true })
    timed.bindProjectWorkspace(id, { kind: 'local', root: repo })
    const writeEvents = (events: { id: string; text: string }[]) => writeFileSync(
      join(repo, '.meridian/events/events.json'),
      JSON.stringify({
        schema_version: 'meridian.workspace-events.v1',
        events: events.map((event) => ({ ...event, date: '2026-09-22', source: 'src/probe.py' })),
      }),
      'utf8',
    )
    const labTexts = () => timed.listFeed().filter((entry) => entry.source === 'lab')
      .map((entry) => (entry.body.kind === 'runs' ? entry.body.runs.map((run) => run.text).join('') : ''))

    writeEvents([{ id: 'old', text: '开始推进 延迟探针' }])
    expect(labTexts()).toEqual([])

    writeEvents([{ id: 'old', text: '开始推进 延迟探针' }, { id: 'new', text: '完成 延迟探针：p95 降到 40ms' }])
    clock = new Date(clock.getTime() + 30_000)
    expect(labTexts()).toEqual([])
    clock = new Date(clock.getTime() + 31_000)
    expect(labTexts()).toEqual(['「动态实验流」完成 延迟探针：p95 降到 40ms'])
    expect(timed.listFeed()[0]!.source).toBe('lab')

    clock = new Date(clock.getTime() + 61_000)
    expect(labTexts()).toHaveLength(1)
  })

  it('项目的结论分档从页上的结论列表数出来,页上不再存计数', () => {
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
    expect(reopened.getProject(id).conclusions).toEqual(counts)
    expect(reopened.listProjects().find((project) => project.id === id)!.conclusions).toEqual(counts)
    expect(reopened.overviewProjects().find((project) => project.id === id)!.conclusions).toEqual(counts)
  })

  it('结论:新建是待验证、记来源与所引论文,改档与删除都落在项目页上,不记最近变动', () => {
    store.createProject('结论')
    const id = store.listProjects().find((project) => project.name === '结论')!.id
    const session = store.createChat('宽树拐点', true)
    const changes = store.listChanges().length
    const made = store.createConclusion(id, '拐点是 batch size 的函数', {
      chat: session.id, paper: '2404.00456',
    })
    const item = made.conclusionList.at(-1)!
    expect(item).toMatchObject({
      text: '拐点是 batch size 的函数', state: 'pending',
      source: '对话「宽树拐点」', paper: '2404.00456',
    })
    expect(made.conclusions).toEqual({ verified: 0, pending: 1, conflicting: 0 })
    expect(store.createConclusion(id, '手写的一条', {}).conclusionList.at(-1)!.source)
      .toBe('手动添加')
    store.setConclusionState(id, item.id, 'conflicting')
    expect(createVaultStore(vault).getProject(id).conclusions)
      .toEqual({ verified: 0, pending: 1, conflicting: 1 })
    store.deleteConclusion(id, item.id)
    expect(createVaultStore(vault).getProject(id).conclusionList.map((conclusion) => conclusion.text))
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

  it('coding agent 在项目工作区里记下的想法进到想法列表,只收一次,删了不再回来', () => {
    store.createProject('agent 想法项目')
    const id = store.listProjects().find((project) => project.name === 'agent 想法项目')!.id
    const repo = join(vault, 'agent-ideas-repo')
    mkdirSync(repo)
    store.bindProjectWorkspace(id, { kind: 'local', root: repo })
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
      title: '按复用距离淘汰前缀缓存', body: '用复用距离替代 LRU。', project: id, node: 'direction.A',
      archived: false, created: '2026-09-21',
      source: { chatTitle: '缓存淘汰的实现讨论', agent: true },
    })])
    expect(createVaultStore(vault).listIdeas().filter((idea) => idea.source.agent === true)).toHaveLength(1)

    store.deleteIdea(taken[0]!.id)
    expect(createVaultStore(vault).listIdeas().filter((idea) => idea.source.agent === true)).toEqual([])
  })

  it('agent 想法文件格式不对时,想法列表照常列出,不把坏文件当想法', () => {
    store.createProject('坏文件项目')
    const id = store.listProjects().find((project) => project.name === '坏文件项目')!.id
    const repo = join(vault, 'bad-ideas-repo')
    mkdirSync(join(repo, '.meridian/ideas'), { recursive: true })
    store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    writeFileSync(join(repo, '.meridian/ideas/ideas.json'), '{"schema_version":"meridian.workspace-agent-ideas.v1","ideas":[{"id":"x"}]}')
    expect(store.listIdeas().filter((idea) => idea.source.agent === true)).toEqual([])
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

  it('项目完成会归档关联想法，删除的想法可从垃圾桶恢复', () => {
    store.createProject('想法落地项目')
    const projectId = store.listProjects().find((project) => project.name === '想法落地项目')!.id
    const session = store.createChat('想法来源', true)
    const created = store.createIdea(session.id, '一个方向', '验证这个方向')
    expect(store.updateIdea(created.id, { project: projectId }).project).toBe(projectId)
    store.updateProject(projectId, { status: '已完成' })
    expect(createVaultStore(vault).listIdeas().find((idea) => idea.id === created.id)?.archived).toBe(true)
    store.deleteIdea(created.id)
    const deleted = store.listTrash().find((entry) => entry.kind === 'idea')!
    expect(deleted.title).toBe('一个方向')
    store.restoreTrash(deleted.id)
    expect(createVaultStore(vault).listIdeas().find((idea) => idea.id === created.id)).toMatchObject({
      project: projectId, archived: true,
    })
  })

  it('记入科研记录:写进项目、把按钮记成已记,再记一次就抛,重开库仍是已记', () => {
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
    const after = store.recordAction(session.id, message.id)
    expect(after.events.at(-1)!.text).toBe('[对话] 拐点是 batch size 的函数')
    expect(store.listChanges()[0]!.title).toBe('项目「记录目标」· 新增科研记录')
    expect(createVaultStore(vault).chatMessages(session.id).at(-1)!.actions[0]!.done).toBe(true)
    expect(() => store.recordAction(session.id, message.id)).toThrow(/已经记入/)
    expect(() => store.recordAction(session.id, 'no-such-message')).toThrow(/no-such-message/)
  })

  it('关联论文按 id 记在项目页上,重复关联与移除没关联的都抛,两笔都记进最近变动并撤得动', () => {
    store.createProject('关联论文')
    const id = store.listProjects().find((project) => project.name === '关联论文')!.id
    const after = store.addPaper(id, '2404.00456')
    expect(after.papers).toEqual(['2404.00456'])
    expect(after.paperCount).toBe(1)
    expect(readFileSync(join(vault, 'wiki', 'projects', `${id}.md`), 'utf8'))
      .toContain('papers:\n  - "2404.00456"\n')
    expect(store.listChanges()[0]!.title).toBe('项目「关联论文」· 关联论文')
    expect(() => store.addPaper(id, '2404.00456')).toThrow(/已经关联/)
    expect(() => store.addPaper(id, 'no-such-paper')).toThrow(/no-such-paper/)
    store.removePaper(id, '2404.00456')
    expect(createVaultStore(vault).getProject(id).papers).toEqual([])
    expect(store.listChanges()[0]!.title).toBe('项目「关联论文」· 移除关联论文')
    expect(() => store.removePaper(id, '2404.00456')).toThrow(/没有关联/)
    store.undoChange(store.listChanges()[0]!.id)
    expect(store.getProject(id).papers).toEqual(['2404.00456'])
  })

  it('关联 Wiki 条目可以带一页聚合,带了不存在的页就抛', () => {
    store.createProject('关联页')
    const id = store.listProjects().find((project) => project.name === '关联页')!.id
    const page = store.wikiCards()[0]!
    const after = store.createRelation(id, { group: 'Wiki', text: page.title, page: page.id })
    expect(after.relations.find((relation) => relation.group === 'Wiki')!.items.at(-1))
      .toMatchObject({ text: page.title, page: page.id })
    expect(createVaultStore(vault).getProject(id).relations[0]!.items[0]!.page).toBe(page.id)
    expect(() => store.createRelation(id, {
      group: 'Wiki', text: 'x', page: 'topics/nope',
    })).toThrow(/topics\/nope/)
  })

  it('附件记下本机绝对路径,相对路径不收', () => {
    store.createProject('附件')
    const id = store.listProjects().find((project) => project.name === '附件')!.id
    const file = join(vault, 'sweep.csv')
    expect(store.createAttachment(id, {
      name: 'sweep.csv', size: '1 KB', path: file,
    }).attachments.at(-1)).toMatchObject({ name: 'sweep.csv', path: file })
    expect(createVaultStore(vault).getProject(id).attachments.at(-1)!.path).toBe(file)
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

  it('应用一条提案:归属写在论文页上,聚合页的对照表回填,别处一个字节不动;撤销逐字节还原', () => {
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
    const rows = store.wikiAggregation('topics/ptq-weight-only').rows
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
    expect(createVaultStore(vault).wikiAggregation('topics/ptq-weight-only').rows.map((r) => r.paper.title)).toContain('KVQuant')

    const change = store.listChanges()[0]!
    expect(change).toMatchObject({
      title: 'Wiki · 把 KVQuant 归进 Weight-only PTQ',
      diff: ['+ papers/2401.18079 ∈ topics/ptq-weight-only(1 格)'],
      undoable: true,
    })
    store.undoChange(change.id)
    expect(readFileSync(paper, 'utf8')).toBe(paperBefore)
    expect(readFileSync(agg, 'utf8')).toBe(aggBefore)
    expect(store.wikiAggregation('topics/ptq-weight-only').rows.map((r) => r.paper.title)).not.toContain('KVQuant')
  })

  it('0.0.14 写的聚合页没有 claims 也没有结论生成区:照原样读出,开库与改别的页都不动它一个字节,写了结论才补上结论区', () => {
    cpSync(resolve(import.meta.dirname, 'fixtures/wiki-0.0.14'), join(vault, 'wiki'), { recursive: true })
    const page = join(vault, 'wiki', 'topics', 'qat.md')
    const old = readFileSync(page, 'utf8')
    store = createVaultStore(vault, () => '2026-09-10', () => new Date('2026-09-10T16:05:04.003Z'))
    const view = store.wikiAggregation('topics/qat')
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
    expect(add({ kind: 'personal', text: attack })).toThrow('证据的 text 一行写完,不能有换行')
    expect(add({ kind: 'source', paper: 'papers/2305.17888', page: 1, quote: attack })).toThrow('证据的 quote 一行写完,不能有换行')
    expect(readFileSync(page, 'utf8')).toBe(before)
  })

  it('新建一个聚合再往里挪成员,父聚合的子聚合区跟着回填;撤销把新页删掉', () => {
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
    expect(store.wikiAggregation('topics/ptq').children.map((c) => c.id)).toContain('topics/ptq-kv')
    store.undoChange(store.listChanges()[0]!.id)
    expect(existsSync(join(vault, 'wiki', 'topics', 'ptq-kv.md'))).toBe(false)
    expect(readFileSync(parent, 'utf8')).toBe(parentBefore)
    expect(() => store.wikiAggregation('topics/ptq-kv')).toThrow(/topics\/ptq-kv/)
  })

  it('挂载:子页的 parents 换了,新旧父页的细分区都回填,撤销逐字节还原', () => {
    const child = join(vault, 'wiki', 'topics', 'kv-cache-quantization.md')
    const oldParent = join(vault, 'wiki', 'topics', 'ptq.md')
    const newParent = join(vault, 'wiki', 'topics', 'quantization.md')
    const before = [child, oldParent, newParent].map((f) => readFileSync(f, 'utf8'))
    store.applyProposal({
      source: 'user', title: '把 KV cache quantization 挂到 Quantization 下',
      ops: [{ op: 'setParents', page: 'topics/kv-cache-quantization', parents: ['topics/long-context-inference', 'topics/quantization'] }],
    })
    expect(store.wikiAggregation('topics/kv-cache-quantization').parents.map((p) => p.id))
      .toEqual(['topics/long-context-inference', 'topics/quantization'])
    expect(store.wikiAggregation('topics/quantization').children.map((c) => c.id)).toContain('topics/kv-cache-quantization')
    expect(store.wikiAggregation('topics/ptq').children.map((c) => c.id)).not.toContain('topics/kv-cache-quantization')
    // On disk, generated child regions change for both old and new parents.
    expect(readFileSync(oldParent, 'utf8')).not.toContain('[[topics/kv-cache-quantization|')
    expect(readFileSync(newParent, 'utf8')).toContain('[[topics/kv-cache-quantization|KV cache quantization]]')
    const change = store.listChanges()[0]!
    expect(change).toMatchObject({ title: 'Wiki · 把 KV cache quantization 挂到 Quantization 下', undoable: true })
    store.undoChange(change.id)
    expect([child, oldParent, newParent].map((f) => readFileSync(f, 'utf8'))).toEqual(before)
  })

  it('同一条提案里先建页再挂到别处:回填集合照样算得出,不崩', () => {
    store.applyProposal({
      source: 'user', title: '新建再挂',
      ops: [
        { op: 'createAggregation', kind: 'topic', id: 'topics/new-branch', title: 'New branch', parents: ['topics/ptq'], columns: [], describe: '' },
        { op: 'setParents', page: 'topics/new-branch', parents: ['topics/quantization'] },
      ],
    })
    expect(store.wikiAggregation('topics/new-branch').parents.map((p) => p.id)).toEqual(['topics/quantization'])
    expect(store.wikiAggregation('topics/quantization').children.map((c) => c.id)).toContain('topics/new-branch')
    expect(store.wikiAggregation('topics/ptq').children.map((c) => c.id)).not.toContain('topics/new-branch')
    // On disk, the original parent no longer lists the page and the replacement parent does.
    expect(readFileSync(join(vault, 'wiki', 'topics', 'ptq.md'), 'utf8')).not.toContain('topics/new-branch')
    expect(readFileSync(join(vault, 'wiki', 'topics', 'quantization.md'), 'utf8')).toContain('topics/new-branch')
  })

  it('撤销只写回提案碰到的页:别的聚合页在这之间被手改过,手改留着', () => {
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
    expect(store.wikiAggregation('topics/ptq-weight-only').rows.map((r) => r.paper.title)).not.toContain('KVQuant')
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

  it('新布局的页也写得下自定义格,行上读得到,重开还在', () => {
    store.setPaperColumns({ ...emptyColumns(), custom: [NOTE_COLUMN] })
    store.updatePaper('2404.00456', { custom: { note: '读到一半' } })
    expect(store.getPaper('2404.00456').custom).toEqual({ note: '读到一半' })
    expect(createVaultStore(vault).getPaper('2404.00456').custom).toEqual({ note: '读到一半' })
  })

  it('删一篇论文,聚合页的对照表与搜索里立刻没有它;恢复之后又回来', () => {
    store.deletePaper('2401.18079')
    expect(store.wikiAggregation('topics/kv-cache-quantization').rows.map((r) => r.paper.title)).not.toContain('KVQuant')
    expect(store.search('KVQuant').some((h) => h.kind === 'paper')).toBe(false)
    expect(() => store.wikiPaper('papers/2401.18079')).toThrow(/2401\.18079/)
    store.restoreTrash(store.listTrash()[0]!.id)
    expect(store.wikiAggregation('topics/kv-cache-quantization').rows.map((r) => r.paper.title)).toContain('KVQuant')
  })

  it('改阅读状态之后,论文页读到的 updated 与论文表一致', () => {
    store.updatePaper('2404.00456', { readState: '在读' })
    expect(store.wikiPaper('papers/2404.00456').updated).toBe('2026-09-10')
    expect(store.getPaper('2404.00456').updated).toBe('2026-09-10')
  })

  it('改正文:只换正文那一段与 updated,记一条可撤销的变动,撤销逐字节还原', () => {
    const file = join(vault, 'wiki', 'topics', 'ptq.md')
    const before = readFileSync(file, 'utf8')
    store.updateWikiPage('topics/ptq', '## 问题\n改过的。\n\n## 结论\n\n## 实验\n\n## 未解决')
    expect(store.wikiAggregation('topics/ptq')).toMatchObject({ summary: '改过的。', updated: '2026-09-10' })
    const after = readFileSync(file, 'utf8')
    expect(after).toContain('updated: "2026-09-10"')
    expect(after.slice(after.indexOf('<!-- generated:children -->'), after.lastIndexOf('<!-- /generated -->')))
      .toBe(before.slice(before.indexOf('<!-- generated:children -->'), before.lastIndexOf('<!-- /generated -->')))
    expect(after.endsWith('<!-- /generated -->\n\n## 问题\n改过的。\n\n## 结论\n\n## 实验\n\n## 未解决\n')).toBe(true)
    expect(createVaultStore(vault).wikiAggregation('topics/ptq').summary).toBe('改过的。')

    const change = store.listChanges()[0]!
    expect(change).toMatchObject({ title: 'Wiki · 「PTQ」· 改了正文', diff: ['~ topics/ptq'], undoable: true })
    store.undoChange(change.id)
    expect(readFileSync(file, 'utf8')).toBe(before)
    expect(store.wikiAggregation('topics/ptq').summary).not.toBe('改过的。')
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

  it('科研图:新建节点摆好位并连上前一个,改名改状态,删节点连带它的边;记录可以挂在节点上;节点的写不记变动', () => {
    store.createProject('科研图')
    const id = store.listProjects().find((project) => project.name === '科研图')!.id
    const changes = store.listChanges().length
    const root = store.createNode(id, '起点', null).graph.nodes.at(-1)!
    expect(root).toMatchObject({
      label: '起点', state: 'idle', x: 12, y: 12, width: 100, writebacks: [],
    })
    const next = store.createNode(id, '宽树实验', root.id)
    const child = next.graph.nodes.at(-1)!
    expect(child).toMatchObject({ x: 162, y: 12 })
    expect(next.graph.edges).toEqual([[root.id, child.id]])
    store.updateNode(id, child.id, { label: '宽树 B≥8', state: 'act' })
    expect(store.createEvent(id, '跑通 B=8', child.id).events.at(-1))
      .toMatchObject({ text: '跑通 B=8', node: child.id })
    expect(createVaultStore(vault).getProject(id).graph.nodes.find((node) => node.id === child.id))
      .toMatchObject({ label: '宽树 B≥8', state: 'act' })
    store.deleteNode(id, root.id)
    expect(store.getProject(id).graph).toEqual({
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

  it('上传出的论文页按新布局写:归属是空列表,没有旧布局的名字列表;归进一页聚合后重开库,论文表的主题照归属', () => {
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
    expect(reopened.wikiAggregation('topics/ptq-weight-only').rows.map((r) => r.paper.id)).toContain(`papers/${added.id}`)
  })

})
