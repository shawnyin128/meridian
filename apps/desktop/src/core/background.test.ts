import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBackground } from './background.js'
import { callFailure } from './call-error.js'
import { createFixtureStore } from './fixture-store.js'
import { FIRST_TICK_MS, TICK_MS } from './inbox/schedule.js'
import { unopenedStore } from './unopened-store.js'
import { createVaultStore } from './vault-store.js'
import type { VaultStore } from './vault.js'
import cannedNet from './fixtures/net.json' with { type: 'json' }
import { probePdf } from './paper-library/index.js'
import { createCannedGet, type CannedTable } from './net/canned-http.js'
import { searchUrl, watchQuery } from './net/arxiv.js'
import { minimalPdf } from './net/minimal-pdf.js'
import { semanticEmbeddingUrl } from './recommendation/index.js'

const VAULT = resolve(import.meta.dirname, 'fixtures/vault')
/** The user-data folders the Backgrounds of this file keep their embeddings in, removed after each case. */
const userDataDirs: string[] = []
const userData = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'meridian-user-data-'))
  userDataDirs.push(dir)
  return dir
}
const setup = (options: { semanticKey?: string } = {}) => {
  const store = createFixtureStore(() => '2026-08-25')
  const background = createBackground({
    userData: userData(),
    store, get: createCannedGet(cannedNet as CannedTable, VAULT), probe: probePdf,
    arxivIntervalMs: 0, sleep: async () => {}, now: () => 0,
    ...(options.semanticKey === undefined ? {} : { semanticScholarApiKey: () => options.semanticKey }),
  })
  return { store, background }
}

describe('createBackground', () => {
  afterEach(() => {
    vi.useRealTimers()
    for (const dir of userDataDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('论文库打不开时排好的定时什么也不做:十五秒后和之后的每一轮都不碰库、不联网', async () => {
    vi.useFakeTimers({ now: 0 })
    const empty = mkdtempSync(join(tmpdir(), 'meridian-no-vault-'))
    // Core opens the vault the same way and stands an unopened store in for one that throws.
    let store: VaultStore
    try {
      store = createVaultStore(empty)
    } catch (error) {
      store = unopenedStore(error instanceof Error ? error.message : String(error), callFailure(error))
    }
    rmSync(empty, { recursive: true, force: true })
    const get = vi.fn(async () => ({ status: 503, body: new Uint8Array() }))
    const background = createBackground({
    userData: userData(),
      store, get, probe: probePdf, arxivIntervalMs: 0, sleep: async () => {}, now: () => Date.now(),
    })
    const stop = background.armSchedule()
    await vi.advanceTimersByTimeAsync(FIRST_TICK_MS)
    await vi.advanceTimersByTimeAsync(3 * TICK_MS)
    expect(get).not.toHaveBeenCalled()
    stop()
  })

  it('导入立刻返回,随后在后台按 arXiv 补全', async () => {
    const { store, background } = setup()
    const result = background.importPaper('draft-trees.pdf', minimalPdf({ lines: ['arXiv:2509.01234v1'] }))
    expect(background.status().uploads).toHaveLength(1)
    await background.idle()
    expect(store.getPaper(result.paper.id)).toMatchObject({ title: 'Draft Trees Under Batched Serving', authors: ['Mei Lin', 'Arun Patel'] })
    expect(background.status()).toMatchObject({ uploads: [{ step: 'done', found: 'arxiv' }] })
  })

  it('同一内容重复导入不重复排解析', async () => {
    const { background } = setup()
    const bytes = minimalPdf({ lines: ['scan-0042'] })
    background.importPaper('scan.pdf', bytes)
    expect(background.importPaper('scan-again.pdf', bytes).kind).toBe('existing')
    await background.idle()
    expect(background.status().uploads).toHaveLength(1)
  })

  it('已有论文上次补全失败时,再次导入会重试', async () => {
    const { background } = setup()
    const bytes = minimalPdf({ lines: ['arXiv:2509.09999v1'] })
    background.importPaper('retry.pdf', bytes)
    await background.idle()
    expect(background.status().uploads).toMatchObject([{ step: 'failed' }])

    expect(background.importPaper('retry-again.pdf', bytes).kind).toBe('existing')
    expect(background.status().uploads).toHaveLength(2)
    await background.idle()
  })

  it('备好的响应表覆盖 fixture 的每条关注', () => {
    const store = createFixtureStore(() => '2026-08-25')
    for (const watch of store.listWatches()) {
      expect(Object.keys(cannedNet)).toContain(searchUrl(watchQuery(watch)))
    }
  })

  it('按关注抓取时收件加入新论文,状态从抓取中回到闲置并记下时间', async () => {
    const { store, background } = setup()
    const before = store.listInbox().length
    const running = background.fetchWatches()
    expect(background.status().fetch.state).toBe('checking')
    await running
    // The vault's Mixtral of Experts records 2026 and arXiv's 2024, more than a year apart, so it is another paper.
    expect(store.listInbox()).toHaveLength(before + 3)
    expect(store.listInbox().map((entry) => entry.title)).toEqual(expect.arrayContaining([
      'Tree Width in Batched Serving', 'Attention Kernels for Shared Prefixes', 'Mixtral of Experts',
    ]))
    expect(background.status().fetch).toEqual({
      state: 'idle', checkedAt: 0, reason: null, last: { watches: null, added: 3, at: 0 },
    })
    expect(background.status().writes).toBeGreaterThan(0)
  })

  it('排好定时后论文发现自己刷新,不必有人点刷新', async () => {
    vi.useFakeTimers({ now: 0 })
    const { store, background } = setup({ semanticKey: 'saved-key' })
    const stop = background.armSchedule()
    await vi.advanceTimersByTimeAsync(FIRST_TICK_MS)
    await vi.waitFor(() => expect(store.listInbox({ kind: 'discovery', project: 'draft' })).toHaveLength(2))
    expect((await store.listFeed()).map((entry) => entry.body)).toContainEqual(expect.objectContaining({
      runs: expect.arrayContaining([{ kind: 'text', text: '发现：' }]),
    }))
    stop()
  })

  it('定时刷新扫出的新方向写一条动态，带上它的项目', async () => {
    vi.useFakeTimers({ now: 0 })
    const { store, background } = setup({ semanticKey: 'saved-key' })
    const project = store.createProject('定时扫描')
    await store.addPaper(project, '2306.00978')
    const stop = background.armSchedule()
    await vi.advanceTimersByTimeAsync(FIRST_TICK_MS)
    await vi.waitFor(() => expect(store.listDiscoveryProfiles().find((profile) => profile.id === project)!.candidates).toHaveLength(1))
    const [found] = store.listDiscoveryProfiles().find((profile) => profile.id === project)!.candidates
    await vi.waitFor(async () => expect((await store.listFeed()).map((entry) => entry.body)).toContainEqual({
      kind: 'runs',
      runs: [
        { kind: 'text', text: '发现：' }, { kind: 'strong', text: `新方向「${found!.label}」` }, { kind: 'text', text: '（项目' },
        { kind: 'strong', text: '「定时扫描」', target: { kind: 'project', id: project } }, { kind: 'text', text: '）。' },
      ],
    }))
    stop()
  })

  it('点刷新扫出的新方向不写动态，留给刷新后的通知', async () => {
    const { store, background } = setup({ semanticKey: 'saved-key' })
    const project = store.createProject('点刷新扫描')
    await store.addPaper(project, '2306.00978')
    expect((await background.fetchDiscoveries()).directions).toHaveLength(1)
    expect(JSON.stringify((await store.listFeed()).map((entry) => entry.body))).not.toContain('新方向')
  })

  it('同时来两次论文发现时排队跑,后一次看得到前一次的进度,不重复请求', async () => {
    const asked: string[] = []
    const canned = createCannedGet(cannedNet as CannedTable, VAULT)
    const store = createFixtureStore(() => '2026-08-25')
    const background = createBackground({
    userData: userData(),
      store, probe: probePdf, arxivIntervalMs: 0, sleep: async () => {}, now: () => 0,
      semanticScholarApiKey: () => 'saved-key',
      get: (url, options) => {
        if (url.includes('/recommendations/')) asked.push(url)
        return canned(url, options)
      },
    })
    const [first, second] = await Promise.all([background.fetchDiscoveries('draft'), background.fetchDiscoveries('draft')])
    expect(asked).toHaveLength(3)
    expect(first).toMatchObject({ intents: 3, added: 2 })
    expect(second).toMatchObject({ intents: 0, cachedIntents: 3, added: 0 })
  })

  it('按项目论文生成独立发现流', async () => {
    const { store, background } = setup({ semanticKey: 'saved-key' })
    const result = await background.fetchDiscoveries('draft')
    expect(result).toEqual({
      projects: 1, intents: 3, added: 2, deferredProjects: 0,
      cachedIntents: 0, failedIntents: 0, nothingNew: false, lastFetchedAt: 0, directions: [],
    })
    const rows = store.listInbox({ kind: 'discovery', project: 'draft' })
    expect(rows).toHaveLength(2)
    expect((await store.listFeed())[0]).toMatchObject({
      source: 'inbox',
      body: { runs: [{ text: '发现：' }, { text: '2 篇新论文推荐' }, { text: '（1 个项目）。' }] },
    })
    expect(rows[0]).toMatchObject({
      kind: 'discovery', project: 'draft', source: '项目 · draft 效率',
      reasons: [
        { kind: 'intent', label: expect.stringMatching(/^方向「.+」$/) },
        { kind: 'seed', label: expect.stringMatching(/^接近《.+》$/), paperId: expect.stringMatching(/^ARXIV:/) },
      ],
    })
  })

  it('没存 key 时项目发现只搜 arXiv,也照样按模型给出方向和最近的种子作理由', async () => {
    const store = createFixtureStore(() => '2026-08-25')
    const canned = createCannedGet(cannedNet as CannedTable, VAULT)
    const hosts: string[] = []
    const background = createBackground({
    userData: userData(),
      store,
      get: async (url, options) => { hosts.push(new URL(url).hostname); return canned(url, options) },
      probe: probePdf, arxivIntervalMs: 0, sleep: async () => {}, now: () => Date.UTC(2026, 8, 22),
    })
    const result = await background.fetchDiscoveries('draft')
    expect(result.added).toBeGreaterThan(0)
    expect(new Set(hosts)).toEqual(new Set(['export.arxiv.org']))
    const rows = store.listInbox({ kind: 'discovery', project: 'draft' })
    expect(rows[0]!.reasons.map((reason) => reason.kind)).toEqual(['intent', 'seed'])
  })

  it('存的 key 被拒时论文发现照常送出,改按回退打分,Core 日志记一条不带 key 的错误', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const canned = createCannedGet(cannedNet as CannedTable, VAULT)
    const store = createFixtureStore(() => '2026-08-25')
    const background = createBackground({
      userData: userData(),
      store, probe: probePdf, arxivIntervalMs: 0, sleep: async () => {}, now: () => 0,
      semanticScholarApiKey: () => 'revoked-key',
      get: (url, options) => (url === semanticEmbeddingUrl
        ? Promise.resolve({ status: 401, body: new TextEncoder().encode('{"message":"Unauthorized"}') })
        : canned(url, options)),
    })
    await expect(background.fetchDiscoveries('draft')).resolves.toMatchObject({ added: 2 })
    expect(store.listInbox({ kind: 'discovery', project: 'draft' })).toHaveLength(2)
    expect(JSON.stringify(logged.mock.calls)).toMatch(/refused the saved key/)
    expect(JSON.stringify(logged.mock.calls)).not.toContain('revoked-key')
    vi.restoreAllMocks()
  })

  it('API 答出向量的一轮也按回退打分,每个方向在 Core 日志记一条两条路径的差距', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const canned = createCannedGet(cannedNet as CannedTable, VAULT)
    const store = createFixtureStore(() => '2026-08-25')
    const vectorOf = (id: string) => Array.from({ length: 8 }, (_, at) => 1 + ((id.charCodeAt(at % id.length) * (at + 3)) % 7) / 10)
    const background = createBackground({
      userData: userData(),
      store, probe: probePdf, arxivIntervalMs: 0, sleep: async () => {}, now: () => 0,
      semanticScholarApiKey: () => 'saved-key',
      get: (url, options) => (url === semanticEmbeddingUrl
        ? Promise.resolve({ status: 200, body: new TextEncoder().encode(JSON.stringify((JSON.parse(String(options.body)) as { ids: string[] }).ids
          .map((id) => ({ paperId: id, embedding: { model: 'specter_v2', vector: vectorOf(id) } })))) })
        : canned(url, options)),
    })
    await background.fetchDiscoveries('draft')
    const gaps = info.mock.calls.map(([line]) => String(line)).filter((line) => line.startsWith('[feed] gap '))
    expect(gaps.map((line) => line.split(' ')[2])).toEqual(store.discoveryIntents('draft').filter((intent) => intent.enabled)
      .map((intent) => `direction:draft:${intent.id}`))
    for (const line of gaps) expect(line).toMatch(/ papers=\d+ overlap@10=\d\.\d{3} ndcg@10=\d\.\d{3} spearman=-?\d\.\d{3}$/)
    vi.restoreAllMocks()
  })

  it('存了 key 后每次 Semantic Scholar 请求都带上，改了立即生效', async () => {
    const store = createFixtureStore(() => '2026-08-25')
    const canned = createCannedGet(cannedNet as CannedTable, VAULT)
    const keys: (string | undefined)[] = []
    const saved: { key?: string } = {}
    const background = createBackground({
    userData: userData(),
      store,
      get: async (url, options) => {
        if (url.includes('semanticscholar.org')) keys.push(options.headers?.['x-api-key'])
        return canned(url, options)
      },
      probe: probePdf, arxivIntervalMs: 0, sleep: async () => {}, now: () => Date.UTC(2026, 8, 22),
      semanticScholarApiKey: () => saved.key,
    })
    await background.fetchDiscoveries('draft')
    expect(keys).toEqual([])
    saved.key = 'saved-key'
    await background.fetchDiscoveries('draft', true)
    expect(keys.length).toBeGreaterThan(0)
    expect(new Set(keys)).toEqual(new Set(['saved-key']))
  })

  it('没存 key 时关注建议只问 arXiv，按姓名推荐作者', async () => {
    const { background } = setup()
    const result = await background.suggestWatches({
      focus: 'efficient inference with speculative decoding',
      seedTopics: ['batch-aware verification'],
    })
    if ('kind' in result) throw new Error(`没有建议：${result.reason}`)
    expect(result.paperCount).toBe(3)
    expect(result.topics).toEqual(expect.arrayContaining([
      { name: 'batch-aware verification', relatedPapers: 0 },
      { name: 'speculative decoding', relatedPapers: 2 },
    ]))
    expect(result.authors[0]).toEqual({ name: 'Mei Lin', relatedPapers: 2 })
  })

  it('存了 key 时关注建议先问 Semantic Scholar，失败再由 arXiv 回答；作者搜索只问 Semantic Scholar', async () => {
    const store = createFixtureStore(() => '2026-08-25')
    const canned = createCannedGet(cannedNet as CannedTable, VAULT)
    const hosts: string[] = []
    const clock = { now: Date.UTC(2026, 8, 22) }
    const background = createBackground({
    userData: userData(),
      store,
      get: async (url, options) => {
        hosts.push(new URL(url).hostname)
        return url.includes('/paper/search') ? { status: 429, body: new Uint8Array() } : canned(url, options)
      },
      probe: probePdf, arxivIntervalMs: 0, sleep: async (ms) => { clock.now += ms }, now: () => clock.now,
      semanticScholarApiKey: () => 'saved-key',
    })
    const result = await background.suggestWatches({ focus: 'speculative decoding' })
    if ('kind' in result) throw new Error(`没有建议：${result.reason}`)
    expect(hosts[0]).toBe('api.semanticscholar.org')
    expect(hosts).toContain('export.arxiv.org')
    expect(result.authors[0]).toEqual({ name: 'Mei Lin', relatedPapers: 2 })

    hosts.length = 0
    const authors = await background.searchAuthors('Alex Kim')
    if (!Array.isArray(authors)) throw new Error(`没有作者：${authors.reason}`)
    expect(new Set(hosts)).toEqual(new Set(['api.semanticscholar.org']))
    expect(authors[0]).toMatchObject({ source: 'semantic-scholar', affiliations: ['Massachusetts Institute of Technology'] })
  })

  it('作者搜索与关注建议取不到结果时只报失败原因，不带原始错误与路径', async () => {
    const failing = (error: Error) => createBackground({
    userData: userData(),
      store: createFixtureStore(() => '2026-08-25'), get: async () => { throw error },
      probe: probePdf, arxivIntervalMs: 0, sleep: async () => {}, now: () => 0,
      semanticScholarApiKey: () => 'saved-key',
    })
    const missing = new Error("ENOENT: no such file or directory, open '/tmp/vault/net.json'")
    expect(await failing(missing).searchAuthors('Song Han')).toEqual({ kind: 'failed', reason: 'unknown' })
    expect(await failing(missing).suggestWatches({ focus: 'speculative decoding' }))
      .toEqual({ kind: 'failed', reason: 'unknown' })
    expect(await failing(new TypeError('fetch failed')).suggestWatches({ focus: 'speculative decoding' }))
      .toEqual({ kind: 'failed', reason: 'unavailable' })
  })

  it('没存 key 时作者搜索不发请求，回一个缺 key 的失败原因，不带 Core 的句子', async () => {
    const store = createFixtureStore(() => '2026-08-25')
    let requests = 0
    const background = createBackground({
    userData: userData(),
      store, get: async () => { requests += 1; return { status: 200, body: new Uint8Array() } },
      probe: probePdf, arxivIntervalMs: 0, sleep: async () => {}, now: () => 0,
    })
    expect(await background.searchAuthors('Song Han')).toEqual({ kind: 'failed', reason: 'no-key' })
    expect(requests).toBe(0)
  })

  it('作者服务和论文检索持续限流时回限流这个失败原因,不把裸 429 也不把 Core 的句子交给界面', async () => {
    const store = createFixtureStore(() => '2026-08-25')
    const background = createBackground({
    userData: userData(),
      store,
      get: async () => ({ status: 429, body: new Uint8Array(), retryAfterMs: 2_000 }),
      probe: probePdf,
      arxivIntervalMs: 0,
      sleep: async () => {},
      now: () => 0,
      semanticScholarApiKey: () => 'saved-key',
    })

    expect(await background.searchAuthors('Song Han')).toEqual({ kind: 'failed', reason: 'rate-limit' })
    expect(await background.suggestWatches({ focus: 'speculative decoding' }))
      .toEqual({ kind: 'failed', reason: 'rate-limit' })
  })
})
