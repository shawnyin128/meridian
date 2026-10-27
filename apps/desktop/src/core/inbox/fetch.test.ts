import { describe, expect, it, vi } from 'vitest'
import { createFixtureStore } from '../fixture-store.js'
import type { AuthorIdentity } from '../../shared/contract.js'
import type { RemotePaper } from '../net/arxiv.js'
import { trainingExamples, type Scorer } from '../recommendation/index.js'
import { createWatchFetcher } from './fetch.js'

vi.mock('../recommendation/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../recommendation/index.js')>()
  return { ...actual, trainingExamples: vi.fn(actual.trainingExamples) }
})

/** A scorer for watches that still rank by keyword, which must never be asked. */
const unusedScorer: Scorer = { score: () => { throw new Error('a keyword watch never scores') } }

const paper = (id: string, title: string): RemotePaper => ({
  id, title, authors: ['Mei Lin'], abstract: 'Abstract.', submitted: '2026-09-01',
  journalRef: null, pdf: `https://arxiv.org/pdf/${id}`,
})

function setup(
  search: (query: string, start: number) => Promise<RemotePaper[]>,
  scholar?: { lookup(ids: string[]): Promise<Map<string, {
    citationCount: number; influentialCitationCount: number; venue: string; published: boolean
  }>> },
  authorPapers?: (identity: AuthorIdentity) => Promise<RemotePaper[]>,
  scorer: Scorer = unusedScorer,
) {
  const store = createFixtureStore(() => '2026-08-25')
  const queries: string[] = []
  const counter = { writes: 0 }
  const fetcher = createWatchFetcher({
    store,
    arxiv: {
      search: async (query, start) => { queries.push(query); return search(query, start ?? 0) },
    },
    ...(scholar === undefined ? {} : { scholar }),
    ...(authorPapers === undefined ? {} : { authorPapers }),
    scorer,
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
    expect((await store.listFeed())[0]).toMatchObject({
      source: 'inbox',
      body: {
        kind: 'runs',
        runs: [
          { text: '抓取：' }, { text: '2 篇新论文入队' },
          { text: '（speculative decoding ×1 · T. Dao ×1）。' },
        ],
      },
    })
    expect(fetcher.status()).toEqual({
      state: 'idle', checkedAt: 1_000, reason: null, last: { watches: null, added: 2, at: 1_000 },
    })
    expect(counter.writes).toBeGreaterThan(0)
  })

  it('每轮抓完给抓过的每条关注在 Core 日志记一条推送量,按关键词排的卡片记在没有打分路径的那一档', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { store, fetcher } = setup(async (query) =>
      query === 'all:"speculative decoding"' ? [paper('2609.00001', 'Tree One')] : [])
    const watch = store.listWatches().find((held) => held.name === 'speculative decoding')!
    const before = store.scopeSignals({ kind: 'watch', id: watch.id }).cards
    await fetcher.run([watch.id])
    expect(info.mock.calls.map(([line]) => String(line)).filter((line) => line.startsWith('[feed] measures'))).toEqual([
      expect.stringMatching(new RegExp(`^\\[feed\\] measures watch:${watch.id} path=none delivered=${before.length + 1} shown=\\d+ `)),
    ])
    info.mockRestore()
  })

  it('关键词关注带来的新论文,来源写关键词 · 名字,理由写命中关键词;收件里早先的条目照原样', async () => {
    const { store, fetcher } = setup(async (query) =>
      query === 'all:"speculative decoding"' ? [paper('2609.00001', 'Tree One')] : [])
    const before = store.listInbox().map((entry) => entry.source)
    await fetcher.run()
    const added = store.listInbox().find((entry) => entry.title === 'Tree One')!
    expect([added.source, added.reasons.map((reason) => reason.label)])
      .toEqual(['关键词 · speculative decoding', ['命中关键词「speculative decoding」']])
    expect(before).toContain('主题 · speculative decoding')
    expect(store.listInbox().filter((entry) => entry.title !== 'Tree One').map((entry) => entry.source)).toEqual(before)
  })

  it('整轮关注抓取共用单次推送上限:每条关注都去查,上限外的论文留在各自的候选池里', async () => {
    const { store, fetcher, queries } = setup(async () => [
      paper(`2609.${String(queries.length + 1).padStart(5, '0')}`, 'New Paper'),
      paper(`2609.${String(queries.length + 11).padStart(5, '0')}`, 'Another Paper'),
    ])
    store.setDeliverySettings({ maxItemsPerRun: 1 })
    store.setWatchActive('moe', false)
    const before = store.listInbox().length
    await fetcher.run()
    expect(store.listInbox()).toHaveLength(before + 1)
    expect(queries).toHaveLength(2)
    expect(store.refreshProgress({ kind: 'watch', id: 'dao' }).candidates.map((found) => found.id))
      .toEqual(['2609.00003', '2609.00013'])
    expect((await store.listFeed())[0]?.body).toMatchObject({
      kind: 'runs', runs: expect.arrayContaining([{ kind: 'strong', text: '1 篇新论文入队' }]),
    })
  })

  it('单次上限在几条关注之间平分,除不尽的那篇轮流给,而不是让列在前面的关注用光', async () => {
    const prefix: Record<string, number> = { 'all:"speculative decoding"': 1, 'all:"MoE serving"': 2, 'au:Dao_T': 3 }
    let run = 0
    // Every run each watch finds three papers it never found before.
    const { store, fetcher } = setup(async (query) => (
      [1, 2, 3].map((at) => paper(`2609.${prefix[query]}${run}0${at}`, `${query} ${run}.${at}`))
    ))
    store.setDeliverySettings({ maxItemsPerRun: 4 })
    const delivered = () => Object.keys(prefix).map((query) => (
      store.listInbox().filter((entry) => entry.title.startsWith(query)).length
    ))

    run = 1
    await fetcher.run()
    expect(delivered()).toEqual([2, 1, 1])
    run = 2
    await fetcher.run()
    expect(delivered()).toEqual([3, 3, 2])
  })

  it('上限外的论文留在这条关注的候选池里,下一轮先推,不被更新的论文挤掉', async () => {
    let answer = [paper('2609.40001', 'Pooled First'), paper('2609.40002', 'Pooled Second')]
    const { store, fetcher } = setup(async () => answer)
    store.setDeliverySettings({ maxItemsPerRun: 1 })
    await fetcher.run(['spec'])
    answer = [paper('2609.40003', 'Newest'), ...answer]
    await fetcher.run(['spec'])
    expect(store.listInbox().filter((entry) => entry.watch === 'spec').slice(0, 2).map((entry) => entry.title))
      .toEqual(['Pooled Second', 'Pooled First'])
    expect(store.refreshProgress({ kind: 'watch', id: 'spec' }).candidates.map((found) => found.title))
      .toContain('Newest')
  })

  it('落到这条关注显示上限以下的新论文不送,留在它的候选池里,卡片走了之后下一轮送出', async () => {
    let answer = [paper('2609.50001', 'Above The Cut'), paper('2609.50002', 'Below The Cut')]
    const { store, fetcher } = setup(async (query) => (query === 'all:"held back"' ? answer : []))
    store.createWatch({ type: 'topic', name: 'held back' })
    const watch = store.listWatches().find((held) => held.name === 'held back')!.id
    store.setDeliverySettings({ maxItemsPerRun: 10, maxShownPerScope: 1 })
    const titles = () => store.listInbox({ kind: 'watch', watch }).map((entry) => entry.title)

    await fetcher.run([watch])
    expect(titles()).toEqual(['Above The Cut'])
    expect(fetcher.status().last).toEqual({ watches: [watch], added: 1, at: 1_000 })
    expect(store.refreshProgress({ kind: 'watch', id: watch }).candidates.map((found) => found.title))
      .toEqual(['Below The Cut'])

    store.dismissInbox(store.listInbox({ kind: 'watch', watch })[0]!.id)
    answer = []
    await fetcher.run([watch])
    expect(titles()).toEqual(['Below The Cut'])
    expect(fetcher.status().last).toEqual({ watches: [watch], added: 1, at: 1_000 })
  })

  it('有三个正例的关注改按模型排:按分数送,低于 0.5 的不送也不进候选池,送出的卡片存模型分', async () => {
    const scores: Record<string, number> = { 'ARXIV:2609.52001': 0.4, 'ARXIV:2609.52002': 0.9, 'ARXIV:2609.52003': 0.6 }
    const score = vi.fn<Scorer['score']>(async () => ({
      scoreOf: (_group, paperId) => (scores[paperId] === undefined ? undefined : { score: scores[paperId]!, path: 'api', scope: 'watch:learnt' }),
      similarity: () => 0,
      nearest: () => [],
    }))
    const { store, fetcher } = setup(async (query) => (query === 'all:"learnt"' ? [
      paper('2609.52001', 'Learnt Low'), paper('2609.52002', 'Learnt High'), paper('2609.52003', 'Learnt Middle'),
    ] : []), undefined, undefined, { score })
    store.createWatch({ type: 'topic', name: 'learnt' })
    const watch = store.listWatches().find((held) => held.name === 'learnt')!.id
    vi.mocked(trainingExamples).mockImplementation((scope) => (scope.kind === 'watch' && scope.watchId === watch
      ? ['p1', 'p2', 'p3'].map((paperId) => ({ paperId, weight: 1, positive: true }))
      : []))
    store.setDeliverySettings({ maxItemsPerRun: 1 })

    await fetcher.run([watch])
    vi.mocked(trainingExamples).mockReset()
    expect(score).toHaveBeenCalledOnce()
    expect(score.mock.calls[0]![0].groups).toEqual([{
      id: `watch:${watch}`,
      scopes: [{
        key: `watch:${watch}`, examples: expect.any(Array), prior: ['p1', 'p2', 'p3'],
        retrieved: ['ARXIV:2609.52001', 'ARXIV:2609.52002', 'ARXIV:2609.52003'],
      }],
      items: ['ARXIV:2609.52001', 'ARXIV:2609.52002', 'ARXIV:2609.52003'],
    }])
    const cards = store.listInbox({ kind: 'watch', watch })
    expect(cards.map((entry) => [entry.title, entry.ranking?.relevance, entry.reasons[0]?.label]))
      .toEqual([['Learnt High', 0.9, '命中关键词「learnt」']])
    expect(store.refreshProgress({ kind: 'watch', id: watch }).candidates.map((found) => found.title))
      .toEqual(['Learnt Middle'])
  })

  it('候选池里别处已经送过的候选拿掉,不再留在池里', async () => {
    const { store, fetcher } = setup(async () => [])
    store.createWatch({ type: 'topic', name: 'stale pool' })
    const watch = store.listWatches().find((held) => held.name === 'stale pool')!.id
    store.setDeliverySettings({ maxItemsPerRun: 1 })
    store.addInboxEntries('spec', [paper('2609.51002', 'Delivered Elsewhere')])
    store.setRefreshProgress({ kind: 'watch', id: watch }, {
      steps: {}, favouredAt: null, newest: [], poolStalled: false,
      candidates: [paper('2609.51001', 'Pooled Fresh'), paper('2609.51002', 'Delivered Elsewhere'), paper('2609.51003', 'Pooled Later')]
        .map((found) => ({ ...found, semanticId: '' })),
    })

    await fetcher.run([watch])
    expect(store.listInbox({ kind: 'watch', watch }).map((entry) => entry.title)).toEqual(['Pooled Fresh'])
    expect(store.refreshProgress({ kind: 'watch', id: watch }).candidates.map((found) => found.title))
      .toEqual(['Pooled Later'])
  })

  it('一条关注搜不成:其余照抓,状态是失败带原因,抓完的时刻不记', async () => {
    const { store, fetcher } = setup(async (query) => {
      if (query === 'au:Dao_T') throw new TypeError('fetch failed')
      return [paper('2609.00003', 'Topic Paper')]
    })
    await fetcher.run()
    expect(fetcher.status()).toEqual({
      state: 'failed', checkedAt: null, reason: 'unavailable', last: { watches: null, added: 1, at: 1_000 },
    })
    expect(store.listInbox().filter((entry) => entry.title === 'Topic Paper')).toHaveLength(1)
  })

  it('没抓到新的时不增加动态', async () => {
    let scholarCalls = 0
    const { store, fetcher } = setup(async () => [paper('2211.17192', 'Already in inbox')], {
      lookup: async () => { scholarCalls += 1; return new Map() },
    })
    const feed = (await store.listFeed()).length
    await fetcher.run()
    expect(await store.listFeed()).toHaveLength(feed)
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

  it('每轮抓完记下抓了哪几条关注、送来几篇和抓完的时刻,没抓过时不记', async () => {
    const { fetcher } = setup(async (query) => (query === 'all:"speculative decoding"' ? [paper('2609.00011', 'Tree Eleven')] : []))
    expect(fetcher.status()).not.toHaveProperty('last')
    await fetcher.run(['spec'])
    expect(fetcher.status().last).toEqual({ watches: ['spec'], added: 1, at: 1_000 })
    await fetcher.run(['spec'])
    expect(fetcher.status().last).toEqual({ watches: ['spec'], added: 0, at: 1_000 })
    await fetcher.run()
    expect(fetcher.status().last).toEqual({ watches: null, added: 0, at: 1_000 })
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

  it('早先按 OpenAlex 保存的作者改按姓名从 arXiv 抓', async () => {
    const authorIds: string[] = []
    const { store, fetcher, queries } = setup(async () => [], undefined, async (identity) => {
      authorIds.push(identity.id)
      return []
    })
    store.createWatch({
      type: 'author', name: 'Mei Lin',
      identity: { source: 'openalex', id: 'A5070926896', affiliations: ['MIT'] },
    })
    const saved = store.listWatches().find((watch) => watch.name === 'Mei Lin')!
    await fetcher.run([saved.id])
    expect(authorIds).toEqual([])
    expect(queries).toEqual(['au:"Mei Lin"'])
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

  it('两次抓取之间新论文多过一页时往后翻页,直到碰上上次见过的论文,一篇不丢', async () => {
    const newestFirst: RemotePaper[] = []
    const publish = (count: number, label: string): void => {
      for (let at = 0; at < count; at += 1) newestFirst.unshift(paper(`2609.${20_000 + newestFirst.length}`, `${label} ${at}`))
    }
    publish(25, 'Before')
    const { store, fetcher, queries } = setup(async (_query, start) => newestFirst.slice(start, start + 20))
    store.setDeliverySettings({ maxItemsPerRun: 100, maxShownPerScope: 100 })
    await fetcher.run(['spec'])
    expect(queries).toHaveLength(1)

    publish(25, 'Burst')
    queries.length = 0
    await fetcher.run(['spec'])
    expect(queries).toHaveLength(2)
    expect(store.listInbox().filter((entry) => entry.title.startsWith('Burst'))).toHaveLength(25)
  })

  it('一轮最多往后翻三页,翻到不满一页就停', async () => {
    const newestFirst: RemotePaper[] = []
    let published = 0
    const publish = (count: number, label: string): void => {
      for (let at = 0; at < count; at += 1) newestFirst.unshift(paper(`2609.${30_000 + published++}`, `${label} ${at}`))
    }
    publish(20, 'Before')
    const { store, fetcher, queries } = setup(async (_query, start) => newestFirst.slice(start, start + 20))
    store.setDeliverySettings({ maxItemsPerRun: 100, maxShownPerScope: 100 })
    await fetcher.run(['spec'])
    publish(100, 'Burst')
    queries.length = 0
    await fetcher.run(['spec'])
    expect(queries).toHaveLength(3)
    expect(store.listInbox().filter((entry) => entry.title.startsWith('Burst'))).toHaveLength(60)

    newestFirst.splice(0, newestFirst.length)
    publish(50, 'Short')
    queries.length = 0
    await fetcher.run(['spec'])
    expect(queries).toHaveLength(3)
    newestFirst.splice(0, newestFirst.length)
    publish(30, 'Shorter')
    queries.length = 0
    await fetcher.run(['spec'])
    expect(queries).toHaveLength(2)
  })
})
