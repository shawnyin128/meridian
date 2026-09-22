import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBackground } from './background.js'
import { createFixtureStore } from './fixture-store.js'
import cannedNet from './fixtures/net.json' with { type: 'json' }
import { probePdf } from './paper-library/index.js'
import { createCannedGet, type CannedTable } from './net/canned-http.js'
import { searchUrl, watchQuery } from './net/arxiv.js'
import { minimalPdf } from './net/minimal-pdf.js'

const VAULT = resolve(import.meta.dirname, 'fixtures/vault')
const setup = () => {
  const store = createFixtureStore(() => '2026-08-25')
  const background = createBackground({
    store, get: createCannedGet(cannedNet as CannedTable, VAULT), probe: probePdf,
    arxivIntervalMs: 0, sleep: async () => {}, now: () => 0,
  })
  return { store, background }
}

describe('createBackground', () => {
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
    expect(store.listInbox()).toHaveLength(before + 2)
    expect(store.listInbox().map((entry) => entry.title)).toEqual(expect.arrayContaining([
      'Tree Width in Batched Serving', 'Attention Kernels for Shared Prefixes',
    ]))
    expect(background.status().fetch).toEqual({ state: 'idle', checkedAt: 0, error: null })
    expect(background.status().writes).toBeGreaterThan(0)
  })

  it('按项目论文生成独立发现流,并把显式负反馈带进下一轮种子', async () => {
    const { store, background } = setup()
    const result = await background.fetchDiscoveries('draft')
    expect(result).toEqual({
      projects: 1, intents: 3, added: 2, deferredProjects: 0,
      cachedIntents: 0, failedIntents: 0,
    })
    const rows = store.listInbox({ kind: 'discovery', project: 'draft' })
    expect(rows).toHaveLength(2)
    expect(store.listFeed()[0]).toMatchObject({
      source: 'inbox',
      body: { runs: [{ text: '发现:' }, { text: '2 篇新论文推荐' }, { text: '(1 个项目)。' }] },
    })
    expect(rows[0]).toMatchObject({
      kind: 'discovery', project: 'draft', source: '项目 · draft 效率',
      reasons: expect.arrayContaining([
        { kind: 'project', label: '来自项目「draft 效率」' },
        expect.objectContaining({ kind: 'intent' }),
        { kind: 'source', label: '由相似论文召回' },
        expect.objectContaining({ kind: 'seed' }),
      ]),
    })
    store.feedbackDiscovery(rows[0]!.id, 'less')
    expect(store.listInbox({ kind: 'discovery', project: 'draft' })).toHaveLength(1)
    expect(store.discoverySeeds('draft').negative).toContain('semantic-branch-acceptance')
  })

  it('保存的 Semantic Scholar key 随每次 Semantic Scholar 请求带上，改了立即生效', async () => {
    const store = createFixtureStore(() => '2026-08-25')
    const canned = createCannedGet(cannedNet as CannedTable, VAULT)
    const keys: (string | undefined)[] = []
    const saved: { key?: string } = {}
    const background = createBackground({
      store,
      get: async (url, options) => {
        if (url.includes('semanticscholar.org')) keys.push(options.headers?.['x-api-key'])
        return canned(url, options)
      },
      probe: probePdf, arxivIntervalMs: 0, sleep: async () => {}, now: () => 0,
      semanticScholarApiKey: () => saved.key,
    })
    await background.fetchDiscoveries('draft')
    expect(keys.length).toBeGreaterThan(0)
    expect(new Set(keys)).toEqual(new Set([undefined]))
    keys.length = 0
    saved.key = 'saved-key'
    await background.fetchDiscoveries('draft', true)
    expect(keys.length).toBeGreaterThan(0)
    expect(new Set(keys)).toEqual(new Set(['saved-key']))
  })

  it('不用模型即可从学术元数据生成主题与稳定作者建议', async () => {
    const { background } = setup()
    const result = await background.suggestWatches({
      focus: 'efficient inference with speculative decoding',
      seedTopics: ['batch-aware verification'],
    })
    expect(result.paperCount).toBe(3)
    expect(result.topics).toEqual(expect.arrayContaining([
      { name: 'batch-aware verification', relatedPapers: 0 },
      { name: 'speculative decoding', relatedPapers: 2 },
    ]))
    expect(result.authors[0]).toMatchObject({
      id: 'fixture-author-1', name: 'Mei Lin', relatedPapers: 2,
    })
  })

  it('作者服务持续限流时给可恢复的说明,不把裸 429 暴露给界面', async () => {
    const store = createFixtureStore(() => '2026-08-25')
    const background = createBackground({
      store,
      get: async () => ({ status: 429, body: new Uint8Array(), retryAfterMs: 2_000 }),
      probe: probePdf,
      arxivIntervalMs: 0,
      sleep: async () => {},
      now: () => 0,
    })

    await expect(background.searchAuthors('Song Han')).rejects.toThrow(
      'OpenAlex 正在限流，请稍后重试；也可以先按姓名保存为未确认作者',
    )
  })
})
