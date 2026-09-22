import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createFixtureStore } from '../fixture-store.js'
import { createCannedGet, type CannedTable } from '../net/canned-http.js'
import { createInboxDownloads } from './download.js'

const VAULT = resolve(import.meta.dirname, '../fixtures/vault')
const FAST_INFERENCE = 'sources/papers/paper-pdf-e0b2ea3a1a54-Fast-Inference-from-Transformers-via-Speculative-Decoding.pdf'

function setup(table: CannedTable) {
  const store = createFixtureStore(() => '2026-08-25')
  const counter = { writes: 0 }
  const downloads = createInboxDownloads({
    store, get: createCannedGet(table, VAULT), onWrite: () => { counter.writes += 1 },
  })
  return { store, downloads, counter }
}

describe('createInboxDownloads', () => {
  it('原文取回来按上传同一条路进库,论文页一次带上 arXiv 元数据', async () => {
    const { store, downloads, counter } = setup({
      'https://arxiv.org/pdf/2211.17192': { status: 200, file: FAST_INFERENCE },
    })
    const before = store.listPapers({ page: 1, size: 1 }).total
    const result = await downloads.download('specdec')
    expect(result).toEqual({ kind: 'added', paper: 'Fast-Inference-from-Transformers-via-Speculative-Decoding' })
    expect(store.listPapers({ page: 1, size: 1 }).total).toBe(before + 1)
    expect(store.getPaper(result.paper)).toMatchObject({
      title: 'Fast Inference from Transformers via Speculative Decoding',
      topics: ['speculative decoding'], readState: '未读',
      authors: ['Yaniv Leviathan', 'Matan Kalman', 'Yossi Matias'], year: 2022,
      venue: 'ICML 2023', identifier: 'arXiv:2211.17192', submitted: '2022-11-30',
    })
    expect(Buffer.from(store.paperSource(result.paper)))
      .toEqual(readFileSync(resolve(VAULT, FAST_INFERENCE)))
    expect(store.listInbox().find((entry) => entry.id === 'specdec'))
      .toMatchObject({ downloaded: true, paper: result.paper })
    expect(store.listFeed().at(-1)).toMatchObject({
      source: 'steward',
      body: {
        runs: [
          { text: '已入库:' },
          { text: '《Fast Inference from Transformers via Speculative Decoding》' },
          { text: ',元数据取自 arXiv。' },
        ],
      },
    })
    expect(counter.writes).toBe(1)
    await expect(downloads.download('specdec')).rejects.toThrow('这一条已经入库:specdec')
  })

  it('主题关注归进对应主题且复用同一页;作者关注不归主题;都不进入最近变动', async () => {
    const { store, downloads } = setup({
      'https://arxiv.org/pdf/2211.17192': { status: 200, file: FAST_INFERENCE },
      'https://arxiv.org/pdf/2608.01112': { status: 200, pdf: { lines: ['DrafterLite'] } },
      'https://arxiv.org/pdf/2608.02233': { status: 200, pdf: { lines: ['ThunderKV'] } },
    })
    const changes = store.listChanges().length
    const first = await downloads.download('specdec')
    const second = await downloads.download('drafterlite')
    const author = await downloads.download('thunderkv')
    expect(store.wikiCards().filter((card) =>
      card.kind === 'topic' && card.title === 'speculative decoding')).toHaveLength(1)
    expect(store.getPaper(first.paper).topics).toEqual(['speculative decoding'])
    expect(store.getPaper(second.paper).topics).toEqual(['speculative decoding'])
    expect(store.getPaper(author.paper).topics).toEqual([])
    expect(store.listChanges()).toHaveLength(changes)
  })

  it('库里已有同一原文或同一 arXiv 编号时不再下载', async () => {
    const { store, downloads } = setup({})
    const sourcePaper = store.listInbox().find((entry) => entry.id === 'longspec')!.paper
    expect(await downloads.download('longspec'))
      .toEqual({ kind: 'existing', paper: sourcePaper, title: store.getPaper(sourcePaper).title })

    const target = store.listPapers({ page: 1, size: 1 }).rows[0]!
    store.fillPaperMetadata(target.id, { identifier: 'arXiv:2407.08608' }, null)
    expect(await downloads.download('fa3'))
      .toEqual({ kind: 'existing', paper: target.id, title: target.title })
  })

  it('服务器异常、非 PDF 与断网都给出短错误且不改变收件', async () => {
    const { store, downloads } = setup({
      'https://arxiv.org/pdf/2608.00417': { status: 503 },
      'https://arxiv.org/pdf/2608.01112': { status: 200, text: '<html>PDF is being generated</html>' },
    })
    await expect(downloads.download('sequoia2')).rejects
      .toThrow('没能下载原文:服务器返回 503')
    await expect(downloads.download('drafterlite')).rejects
      .toThrow('没能下载原文:取回的不是 PDF')
    const offline = createInboxDownloads({
      store, get: async () => { throw new TypeError('fetch failed') }, onWrite: () => {},
    })
    await expect(offline.download('thunderkv')).rejects.toThrow('没能下载原文:网络不可用')
    expect(store.listInbox().filter((entry) => entry.downloaded)).toEqual([])
    expect(downloads.progress()).toEqual([])
  })

  it('下载中暴露进度并拒绝同一条并发;完成后稍后阅读可以直接读', async () => {
    const { store, downloads } = setup({
      'https://arxiv.org/pdf/2608.02233': { status: 200, delayMs: 50, pdf: { lines: ['ThunderKV'] } },
    })
    const pending = downloads.download('thunderkv')
    await vi.waitFor(() => expect(downloads.progress()).toEqual([
      { id: 'thunderkv', received: expect.any(Number), total: expect.any(Number) },
    ]))
    await expect(downloads.download('thunderkv')).rejects.toThrow('这一条正在下载:thunderkv')
    await pending
    expect(downloads.progress()).toEqual([])
    expect(store.listLater().find((entry) => entry.id === 'thunderkv')?.downloaded).toBe(true)
  })

  it('已经放进稍后阅读、离开收件的条目仍能下载', async () => {
    const { store, downloads } = setup({
      'https://arxiv.org/pdf/2608.01112': { status: 200, pdf: { lines: ['DrafterLite'] } },
    })
    expect(store.readLater('drafterlite')).toBe(true)
    expect((await downloads.download('drafterlite')).kind).toBe('added')
    expect(store.listLater().find((entry) => entry.id === 'drafterlite')?.downloaded).toBe(true)
  })
})
