import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createFixtureStore } from '../fixture-store.js'
import { createCannedGet, type CannedTable } from '../net/canned-http.js'
import { minimalPdf } from '../net/minimal-pdf.js'
import { createInboxDownloads, type InboxDownloads } from './download.js'

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

/** Downloads `id` and returns what it imported; a fetch failure fails the test. */
async function imported(downloads: InboxDownloads, id: string) {
  const result = await downloads.download(id)
  if (result.kind === 'failed') throw new Error(`没取回原文：${result.reason}`)
  return result
}

describe('createInboxDownloads', () => {
  it('原文取回来按上传同一条路进库,论文页一次带上 arXiv 元数据', async () => {
    const { store, downloads, counter } = setup({
      'https://arxiv.org/pdf/2211.17192': { status: 200, file: FAST_INFERENCE },
    })
    const before = store.listPapers({ page: 1, size: 1 }).total
    const result = await imported(downloads, 'specdec')
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
    expect(store.listFeed()[0]).toMatchObject({
      source: 'me',
      body: {
        runs: [
          { text: '已入库：' },
          { text: '《Fast Inference from Transformers via Speculative Decoding》', target: { kind: 'paper', id: result.paper } },
          { text: '，元数据取自 arXiv。' },
        ],
      },
    })
    expect(counter.writes).toBe(1)
    await expect(downloads.download('specdec')).rejects.toThrow('这一条已经入库：specdec')
  })

  it('主题关注归进对应主题且复用同一页;作者关注不归主题;都不进入最近变动', async () => {
    const { store, downloads } = setup({
      'https://arxiv.org/pdf/2211.17192': { status: 200, file: FAST_INFERENCE },
      'https://arxiv.org/pdf/2608.01112': { status: 200, pdf: { lines: ['DrafterLite'] } },
      'https://arxiv.org/pdf/2608.02233': { status: 200, pdf: { lines: ['ThunderKV'] } },
    })
    const changes = store.listChanges().length
    const first = await imported(downloads, 'specdec')
    const second = await imported(downloads, 'drafterlite')
    const author = await imported(downloads, 'thunderkv')
    expect(store.wikiCards().filter((card) =>
      card.kind === 'topic' && card.title === 'speculative decoding')).toHaveLength(1)
    expect(store.getPaper(first.paper).topics).toEqual(['speculative decoding'])
    expect(store.getPaper(second.paper).topics).toEqual(['speculative decoding'])
    expect(store.getPaper(author.paper).topics).toEqual([])
    expect(store.listChanges()).toHaveLength(changes)
  })

  it('库里已有同一原文或同一 arXiv 编号时不再下载', async () => {
    const pdf = { lines: ['LongSpec: Long-Context Lossless Speculative Decoding'] }
    const { store, downloads } = setup({ 'https://arxiv.org/pdf/2607.01428': { status: 200, pdf } })
    // Like every entry Core writes, longspec names no paper; the same PDF was imported directly.
    const held = store.importPaper('LongSpec.pdf', minimalPdf(pdf)).paper
    expect(await downloads.download('longspec'))
      .toEqual({ kind: 'existing', paper: held.id, title: held.title })

    const target = store.listPapers({ page: 1, size: 1 }).rows[0]!
    store.fillPaperMetadata(target.id, { identifier: 'arXiv:2407.08608' }, null)
    expect(await downloads.download('fa3'))
      .toEqual({ kind: 'existing', paper: target.id, title: target.title })
  })

  it('取不回原文时只报失败原因，不带原始错误与路径，也不改变收件', async () => {
    const { store, downloads } = setup({
      'https://arxiv.org/pdf/2608.02233': { status: 200, file: 'sources/papers/missing.pdf' },
      'https://arxiv.org/pdf/2608.00417': { status: 503 },
      'https://arxiv.org/pdf/2608.01112': { status: 200, text: '<html>PDF is being generated</html>' },
      'https://arxiv.org/pdf/2211.17192': { status: 429 },
    })
    expect(await downloads.download('thunderkv')).toEqual({ kind: 'failed', reason: 'unknown' })
    expect(await downloads.download('specdec')).toEqual({ kind: 'failed', reason: 'rate-limit' })
    expect(await downloads.download('sequoia2')).toEqual({ kind: 'failed', reason: 'server' })
    expect(await downloads.download('drafterlite')).toEqual({ kind: 'failed', reason: 'not-pdf' })
    const failing = (error: Error) => createInboxDownloads({
      store, get: async () => { throw error }, onWrite: () => {},
    })
    expect(await failing(new TypeError('fetch failed')).download('thunderkv'))
      .toEqual({ kind: 'failed', reason: 'unavailable' })
    expect(await failing(new DOMException('t', 'TimeoutError')).download('thunderkv'))
      .toEqual({ kind: 'failed', reason: 'timeout' })
    expect(store.listInbox().filter((entry) => entry.downloaded)).toEqual([])
    expect(downloads.progress()).toEqual([])
  })

  it('原文取回来却写不进库时报成写入失败，不带系统的原话和路径；库自己拒绝的照旧抛出', async () => {
    const { store, downloads } = setup({
      'https://arxiv.org/pdf/2211.17192': { status: 200, file: FAST_INFERENCE },
    })
    const disk = Object.assign(new Error("ENOSPC: no space left on device, write '/Users/me/vault/sources/x.pdf'"), {
      code: 'ENOSPC', syscall: 'write', path: '/Users/me/vault/sources/x.pdf',
    })
    const complete = vi.spyOn(store, 'completeInboxDownload').mockImplementationOnce(() => { throw disk })
    expect(await downloads.download('specdec')).toEqual({ kind: 'failed', reason: 'write' })
    expect(downloads.progress()).toEqual([])

    complete.mockImplementationOnce(() => { throw new Error('这一条已经入库：specdec') })
    await expect(downloads.download('specdec')).rejects.toThrow('这一条已经入库：specdec')
  })

  it('下载中暴露进度并拒绝同一条并发;完成后稍后阅读可以直接读', async () => {
    const { store, downloads } = setup({
      'https://arxiv.org/pdf/2608.02233': { status: 200, delayMs: 50, pdf: { lines: ['ThunderKV'] } },
    })
    const pending = downloads.download('thunderkv')
    await vi.waitFor(() => expect(downloads.progress()).toEqual([
      { id: 'thunderkv', received: expect.any(Number), total: expect.any(Number) },
    ]))
    await expect(downloads.download('thunderkv')).rejects.toThrow('这一条正在下载：thunderkv')
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
