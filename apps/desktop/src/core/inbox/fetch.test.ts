import { describe, expect, it, vi } from 'vitest'
import { createFixtureStore } from '../fixture-store.js'
import type { AuthorIdentity } from '../../shared/contract.js'
import type { RemotePaper } from '../net/arxiv.js'
import { createWatchFetcher } from './fetch.js'

const paper = (id: string, title: string): RemotePaper => ({
  id, title, authors: ['Mei Lin'], abstract: 'Abstract.', submitted: '2026-09-01',
  journalRef: null, pdf: `https://arxiv.org/pdf/${id}`,
})

function setup(
  search: (query: string) => Promise<RemotePaper[]>,
  scholar?: { lookup(ids: string[]): Promise<Map<string, {
    citationCount: number; influentialCitationCount: number; venue: string; published: boolean
  }>> },
  authorPapers?: (identity: AuthorIdentity) => Promise<RemotePaper[]>,
) {
  const store = createFixtureStore(() => '2026-08-25')
  const queries: string[] = []
  const counter = { writes: 0 }
  const fetcher = createWatchFetcher({
    store,
    arxiv: {
      search: async (query) => { queries.push(query); return search(query) },
      lookup: async () => null,
    },
    ...(scholar === undefined ? {} : { scholar }),
    ...(authorPapers === undefined ? {} : { authorPapers }),
    now: () => 1_000,
    onWrite: () => { counter.writes += 1 },
  })
  return { store, fetcher, queries, counter }
}

describe('createWatchFetcher', () => {
  it('每条启用的关注各搜一次,暂停的跳过;新论文进收件,动态记一条,抓完的时刻记下', async () => {
    const { store, fetcher, queries, counter } = setup(async (query) =>
      query === 'all:"speculative decoding"'
        ? [paper('2609.00001', 'Tree One'), paper('2211.17192', 'Already in inbox')]
        : query === 'au:Dao_T' ? [paper('2609.00002', 'Kernel Two')] : [])
    store.setWatchActive('moe', false)
    const before = store.listInbox().length
    await fetcher.run()
    expect(queries).toEqual(['all:"speculative decoding"', 'au:Dao_T'])
    expect(store.listInbox()).toHaveLength(before + 2)
    expect(store.listFeed()[0]).toMatchObject({
      source: 'inbox',
      body: {
        kind: 'runs',
        runs: [
          { text: '抓取:' }, { text: '2 篇新论文入队' },
          { text: '(speculative decoding ×1 · T. Dao ×1)。' },
        ],
      },
    })
    expect(fetcher.status()).toEqual({ state: 'idle', checkedAt: 1_000, error: null })
    expect(counter.writes).toBeGreaterThan(0)
  })

  it('整轮关注抓取共用单次推送上限', async () => {
    const { store, fetcher, queries } = setup(async () => [
      paper(`2609.${String(queries.length + 1).padStart(5, '0')}`, 'New Paper'),
      paper(`2609.${String(queries.length + 11).padStart(5, '0')}`, 'Another Paper'),
    ])
    store.setDeliverySettings({ maxItemsPerRun: 1 })
    store.setWatchActive('moe', false)
    const before = store.listInbox().length
    await fetcher.run()
    expect(store.listInbox()).toHaveLength(before + 1)
    expect(queries).toHaveLength(1)
    expect(store.listFeed()[0]?.body).toMatchObject({
      kind: 'runs', runs: expect.arrayContaining([{ kind: 'strong', text: '1 篇新论文入队' }]),
    })
  })

  it('一条关注搜不成:其余照抓,状态是失败带原因,抓完的时刻不记', async () => {
    const { store, fetcher } = setup(async (query) => {
      if (query === 'au:Dao_T') throw new TypeError('fetch failed')
      return [paper('2609.00003', 'Topic Paper')]
    })
    await fetcher.run()
    expect(fetcher.status()).toEqual({ state: 'failed', checkedAt: null, error: '网络不可用' })
    expect(store.listInbox().filter((entry) => entry.title === 'Topic Paper')).toHaveLength(1)
  })

  it('没抓到新的时不增加动态', async () => {
    let scholarCalls = 0
    const { store, fetcher } = setup(async () => [paper('2211.17192', 'Already in inbox')], {
      lookup: async () => { scholarCalls += 1; return new Map() },
    })
    const feed = store.listFeed().length
    await fetcher.run()
    expect(store.listFeed()).toHaveLength(feed)
    expect(scholarCalls).toBe(0)
  })

  it('多条关注的论文合成一次影响力查询,补全失败不影响 arXiv 收件', async () => {
    const calls: string[][] = []
    const { store, fetcher } = setup(async (query) => [
      paper(query.includes('Dao') ? '2609.00002' : '2609.00001', query),
    ], {
      lookup: async (ids) => { calls.push(ids); throw new Error('429') },
    })
    store.setWatchActive('moe', false)
    await fetcher.run()
    expect(calls).toEqual([['2609.00001', '2609.00002']])
    expect(store.listInbox().filter((entry) => entry.ranking !== undefined)).toHaveLength(2)
    expect(fetcher.status().state).toBe('idle')
  })

  it('不等影响力补全就先把 arXiv 结果放进收件,稍后原地更新 venue 与引用', async () => {
    let release = () => {}
    const gate = new Promise<void>((done) => { release = done })
    const { store, fetcher } = setup(async () => [paper('2609.00004', 'Fast Visible')], {
      lookup: async () => {
        await gate
        return new Map([['2609.00004', {
          citationCount: 42, influentialCitationCount: 4, venue: 'NeurIPS', published: true,
        }]])
      },
    })
    const running = fetcher.run(['spec'])
    await vi.waitFor(() => {
      expect(store.listInbox().find((entry) => entry.title === 'Fast Visible')).toBeDefined()
    })
    expect(store.listInbox().find((entry) => entry.title === 'Fast Visible')).toMatchObject({
      venue: 'arXiv:2609.00004', ranking: { citationCount: 0 },
    })
    release()
    await running
    expect(store.listInbox().find((entry) => entry.title === 'Fast Visible')).toMatchObject({
      venue: 'NeurIPS', ranking: { citationCount: 42, influentialCitationCount: 4, published: true },
    })
  })

  it('只抓给定的关注,不把它算作一轮完整抓取', async () => {
    const { store, fetcher, queries } = setup(async () => [])
    await fetcher.run(['spec'])
    expect(queries).toEqual(['all:"speculative decoding"'])
    expect(store.lastFetch()).toBeNull()
  })

  it('已确认的作者按稳定 id 抓论文,不再把同名姓名交给 arXiv 模糊搜索', async () => {
    const authorIds: string[] = []
    const { store, fetcher, queries } = setup(async () => [], undefined, async (identity) => {
      authorIds.push(`${identity.source}:${identity.id}`)
      return [paper('2609.08888', 'Verified Author')]
    })
    store.createWatch({
      type: 'author', name: 'Mei Lin',
      identity: { source: 'semantic-scholar', id: 's2-mei-lin', affiliations: ['MIT'] },
    })
    const verified = store.listWatches().find((watch) => watch.name === 'Mei Lin')!
    await fetcher.run([verified.id])
    expect(authorIds).toEqual(['semantic-scholar:s2-mei-lin'])
    expect(queries).toEqual([])
    expect(store.listInbox().some((entry) => entry.title === 'Verified Author')).toBe(true)
  })

  it('抓着的时候状态是 checking;接连两次按先后跑完', async () => {
    let release = () => {}
    const gate = new Promise<void>((done) => { release = done })
    const { fetcher, queries } = setup(async () => { await gate; return [] })
    const first = fetcher.run(['spec'])
    const second = fetcher.run(['dao'])
    expect(fetcher.status().state).toBe('checking')
    release()
    await Promise.all([first, second])
    expect(queries).toEqual(['all:"speculative decoding"', 'au:Dao_T'])
    expect(fetcher.status().state).toBe('idle')
  })
})
