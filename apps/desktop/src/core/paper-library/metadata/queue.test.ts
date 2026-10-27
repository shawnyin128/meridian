import { describe, expect, it } from 'vitest'
import { createFixtureStore } from '../../fixture-store.js'
import type { RemotePaper } from '../../net/arxiv.js'
import type { DblpPaper } from '../../net/dblp.js'
import { HttpStatusError } from '../../net/http.js'
import { minimalPdf } from '../../net/minimal-pdf.js'
import type { Publication } from '../../net/semantic-metadata.js'
import type { PdfFacts } from './pdf-probe.js'
import { createMetadataQueue } from './queue.js'

const REMOTE: RemotePaper = {
  id: '2509.01234', title: 'Draft Trees Under Batched Serving', authors: ['Mei Lin', 'Arun Patel'],
  abstract: 'Wider trees pay off.', submitted: '2025-09-02', journalRef: null,
  pdf: 'https://arxiv.org/pdf/2509.01234',
}

function setup(options: { facts?: Partial<PdfFacts>; error?: Error } = {}) {
  const store = createFixtureStore(() => '2026-08-25')
  const lookups: string[] = []
  const queue = createMetadataQueue({
    store,
    probe: async () => ({ title: null, subject: null, keywords: null, firstPage: '', pageCount: 1, ...options.facts }),
    provider: { lookup: async (id) => { lookups.push(id); if (options.error) throw options.error; return REMOTE } },
    onWrite: () => {},
  })
  const upload = (filename: string) => {
    const bytes = minimalPdf({ lines: [filename] })
    const paper = store.importPaper(filename, bytes).paper
    queue.enqueueUpload(paper.id, filename, bytes)
    return paper
  }
  return { store, queue, lookups, upload }
}

describe('上传之后的元数据解析', () => {
  it('首页有 arXiv 印记时按编号补全全部书目字段', async () => {
    const { store, queue, lookups, upload } = setup({ facts: { firstPage: 'arXiv:2509.01234v1' } })
    const paper = upload('draft-trees.pdf')
    await queue.idle()
    expect(lookups).toEqual(['2509.01234'])
    expect(store.getPaper(paper.id)).toMatchObject({
      title: REMOTE.title, authors: REMOTE.authors, year: 2025, venue: 'arXiv',
      identifier: 'arXiv:2509.01234', submitted: REMOTE.submitted, abstract: REMOTE.abstract,
    })
    expect(queue.uploads()[0]).toMatchObject({ step: 'done', found: 'arxiv', title: REMOTE.title })
  })

  it('探测出的页数总是补上,不管书目字段是不是靠 arXiv 补的', async () => {
    const { store, queue, upload } = setup({ facts: { firstPage: 'arXiv:2509.01234v1', pageCount: 9 } })
    const paper = upload('draft-trees.pdf')
    await queue.idle()
    expect(store.getPaper(paper.id).pageCount).toBe(9)
  })

  it('没有编号时使用 PDF info 标题,动态里只说标题取自哪里', async () => {
    const { store, queue, lookups, upload } = setup({ facts: { title: 'Speculative Serving at Scale' } })
    const paper = upload('scan.pdf')
    await queue.idle()
    expect(lookups).toEqual([])
    expect(store.getPaper(paper.id).title).toBe('Speculative Serving at Scale')
    expect(queue.uploads()[0]).toMatchObject({ step: 'done', found: 'pdf' })
    expect((await store.listFeed())[0]?.body).toEqual({ kind: 'runs', runs: [
      { kind: 'text', text: '你上传的' },
      { kind: 'strong', text: '《Speculative Serving at Scale》', target: { kind: 'paper', id: paper.id } },
      { kind: 'text', text: '已入库，标题取自 PDF。' },
    ] })
  })

  it('远端失败不删除已入库论文,并留下短原因', async () => {
    const { store, queue, upload } = setup({ facts: { firstPage: 'arXiv:2509.01234v1' }, error: new TypeError('fetch failed') })
    const paper = upload('draft-trees.pdf')
    await queue.idle()
    expect(store.getPaper(paper.id).title).toBe('draft-trees')
    expect(queue.uploads()[0]).toMatchObject({ step: 'failed', error: '网络不可用' })
    expect(JSON.stringify((await store.listFeed())[0]?.body)).toContain('元数据暂未补全')
    expect(JSON.stringify((await store.listFeed())[0]?.body)).not.toContain('网络不可用')
    expect(JSON.stringify((await store.listFeed())[0]?.body)).not.toContain('论文表')
  })

  it('arXiv 查询失败时,探测出的页数照样写上,其余书目字段留待重试', async () => {
    const { store, queue, upload } = setup({
      facts: { firstPage: 'arXiv:2509.01234v1', pageCount: 9 }, error: new TypeError('fetch failed'),
    })
    const paper = upload('draft-trees.pdf')
    await queue.idle()
    expect(store.getPaper(paper.id)).toMatchObject({ pageCount: 9, title: 'draft-trees' })
    expect(store.getPaper(paper.id).identifier).toBeUndefined()
    expect(queue.uploads()[0]).toMatchObject({ step: 'failed', error: '网络不可用' })
  })

  it('查询失败的论文按它的 id 重试:用上传时的文件名和库里的原文再解析一次,这次补全', async () => {
    const store = createFixtureStore(() => '2026-08-25')
    const lookups: string[] = []
    const queue = createMetadataQueue({
      store,
      probe: async () => ({ title: null, subject: null, keywords: null, firstPage: '', pageCount: 1 }),
      provider: {
        lookup: async (id) => {
          lookups.push(id)
          if (lookups.length === 1) throw new TypeError('fetch failed')
          return REMOTE
        },
      },
      onWrite: () => {},
    })
    const bytes = minimalPdf({ lines: ['scan'] })
    const paper = store.importPaper('2509.01234.pdf', bytes).paper
    queue.enqueueUpload(paper.id, '2509.01234.pdf', bytes)
    await queue.idle()
    expect(queue.uploads().map((job) => job.step)).toEqual(['failed'])

    queue.retry(paper.id)
    await queue.idle()
    // The id comes only from the file name, so the retry found it there again.
    expect(lookups).toEqual(['2509.01234', '2509.01234'])
    expect(queue.uploads().map((job) => job.step)).toEqual(['failed', 'done'])
    expect(store.getPaper(paper.id).title).toBe(REMOTE.title)
  })

  it('没有在这次运行里上传过的论文不能重试', () => {
    const { queue, store } = setup()
    const id = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
    expect(() => queue.retry(id)).toThrow(expect.objectContaining({ reason: 'not-found' }))
  })

  it('保留整个活动批次,并发探测 PDF,再用一次远端批量查询补全', async () => {
    const store = createFixtureStore(() => '2026-08-25')
    let probeNumber = 0
    let activeProbes = 0
    let maxActiveProbes = 0
    let startFirstLookup!: () => void
    let releaseFirstLookup!: () => void
    let fourProbesStarted!: () => void
    let releaseProbes!: () => void
    const firstLookupStarted = new Promise<void>((resolve) => { startFirstLookup = resolve })
    const firstLookupGate = new Promise<void>((resolve) => { releaseFirstLookup = resolve })
    const probesStarted = new Promise<void>((resolve) => { fourProbesStarted = resolve })
    const probeGate = new Promise<void>((resolve) => { releaseProbes = resolve })
    const batches: string[][] = []
    const remote = (id: string): RemotePaper => ({ ...REMOTE, id, title: `Paper ${id}` })
    const queue = createMetadataQueue({
      store,
      probe: async () => {
        probeNumber += 1
        const number = probeNumber
        if (number > 1) {
          activeProbes += 1
          maxActiveProbes = Math.max(maxActiveProbes, activeProbes)
          if (activeProbes === 4) fourProbesStarted()
          await probeGate
          activeProbes -= 1
        }
        const id = `2509.${String(number).padStart(5, '0')}`
        return { title: null, subject: null, keywords: null, firstPage: `arXiv:${id}v1`, pageCount: 1 }
      },
      provider: {
        async lookup(id) {
          startFirstLookup()
          await firstLookupGate
          return remote(id)
        },
        async lookupMany(ids) {
          batches.push([...ids])
          return new Map(ids.map((id) => [id, remote(id)]))
        },
      },
      onWrite: () => {},
    })
    const upload = (index: number) => {
      const filename = `paper-${index}.pdf`
      const bytes = minimalPdf({ lines: [filename] })
      const paper = store.importPaper(filename, bytes).paper
      queue.enqueueUpload(paper.id, filename, bytes)
    }

    upload(1)
    await firstLookupStarted
    for (let index = 2; index <= 39; index += 1) upload(index)
    expect(queue.uploads()).toHaveLength(39)
    expect(new Set(queue.uploads().map((job) => job.batch))).toEqual(new Set([1]))

    releaseFirstLookup()
    await probesStarted
    expect(maxActiveProbes).toBe(4)
    releaseProbes()
    await queue.idle()
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(38)
    expect(queue.uploads()).toHaveLength(20)
  })

  describe('配了 Semantic Scholar key 时补全发表信息', () => {
    /** A queue whose Semantic Scholar lookups answer `found` (or fail with `error`), recording the ids asked; `keyed` says whether a key is saved. */
    function keyed(facts: Partial<PdfFacts>, options: {
      keyed?: boolean; error?: Error; found?: Record<string, { venue: string; year?: number }>
      dblp?: (paper: DblpPaper) => Promise<Publication | undefined>
    } = {}) {
      const store = createFixtureStore(() => '2026-08-25')
      const asked: string[][] = []
      const queue = createMetadataQueue({
        store,
        probe: async () => ({ title: null, subject: null, keywords: null, firstPage: '', pageCount: 1, ...facts }),
        provider: { lookup: async () => REMOTE },
        publications: () => (options.keyed === false ? undefined : {
          lookup: async (ids) => {
            asked.push([...ids])
            if (options.error) throw options.error
            return new Map(Object.entries(options.found ?? { 'ARXIV:2509.01234': { venue: 'ICLR', year: 2026 } }))
          },
        }),
        onWrite: () => {},
        ...(options.dblp === undefined ? {} : { dblp: () => ({ venueOf: options.dblp! }) }),
      })
      const bytes = minimalPdf({ lines: ['x'] })
      const paper = store.importPaper('draft-trees.pdf', bytes).paper
      queue.enqueueUpload(paper.id, 'draft-trees.pdf', bytes)
      return { store, queue, asked, paper }
    }

    it('arXiv 补完之后按 ARXIV 编号查一次，会场换成发表的那一个带年份，年份留着 arXiv 的，动态里说两个来源', async () => {
      const { store, queue, asked, paper } = keyed({ firstPage: 'arXiv:2509.01234v1' })
      await queue.idle()
      expect(asked).toEqual([['ARXIV:2509.01234']])
      expect(store.getPaper(paper.id)).toMatchObject({ title: REMOTE.title, venue: 'ICLR 2026', year: 2025, submitted: REMOTE.submitted })
      expect(JSON.stringify((await store.listFeed())[0]?.body)).toContain('元数据取自 arXiv 和 Semantic Scholar')
    })

    it('没配 key 时不查 Semantic Scholar，和以前一样只用 arXiv', async () => {
      const { store, queue, asked, paper } = keyed({ firstPage: 'arXiv:2509.01234v1' }, { keyed: false })
      await queue.idle()
      expect(asked).toEqual([])
      expect(store.getPaper(paper.id)).toMatchObject({ venue: 'arXiv', year: 2025 })
    })

    it('Semantic Scholar 查不成时，arXiv 的元数据照样写上，动态里只说 arXiv', async () => {
      const { store, queue, paper } = keyed({ firstPage: 'arXiv:2509.01234v1' }, { error: new TypeError('fetch failed') })
      await queue.idle()
      expect(store.getPaper(paper.id)).toMatchObject({ title: REMOTE.title, venue: 'arXiv', year: 2025 })
      expect(queue.uploads()[0]).toMatchObject({ step: 'done', found: 'arxiv' })
      expect(JSON.stringify((await store.listFeed())[0]?.body)).toContain('元数据取自 arXiv。')
    })

    it('没有 arXiv 编号的 PDF 只按首页标明的 DOI 去查，不按标题搜', async () => {
      const { store, queue, asked, paper } = keyed(
        { title: 'Speculative Serving at Scale', firstPage: 'Proceedings… DOI: 10.1145/3600006.3613165.' },
        { found: { 'DOI:10.1145/3600006.3613165': { venue: 'SOSP', year: 2023 } } },
      )
      await queue.idle()
      expect(asked).toEqual([['DOI:10.1145/3600006.3613165']])
      expect(store.getPaper(paper.id)).toMatchObject({ title: 'Speculative Serving at Scale', venue: 'SOSP 2023' })
      expect(store.getPaper(paper.id).year).toBeUndefined()
    })

    it('没配 Semantic Scholar key 时上传也按 arXiv 的标题和作者问 DBLP，会场写成 DBLP 的，动态里说两个来源', async () => {
      const asked: DblpPaper[] = []
      const { store, queue, paper } = keyed({ firstPage: 'arXiv:2509.01234v1' }, {
        keyed: false, dblp: async (held) => { asked.push(held); return { venue: 'MLSys', year: 2026, source: 'dblp' } },
      })
      await queue.idle()
      expect(asked).toEqual([{ title: REMOTE.title, authors: REMOTE.authors }])
      expect(store.getPaper(paper.id)).toMatchObject({ venue: 'MLSys 2026', year: 2025 })
      expect(JSON.stringify((await store.listFeed())[0]?.body)).toContain('元数据取自 arXiv 和 DBLP')
    })

    it('DBLP 查不成时上传照样写上 arXiv 的元数据', async () => {
      const { store, queue, paper } = keyed({ firstPage: 'arXiv:2509.01234v1' }, {
        keyed: false, dblp: async () => { throw new HttpStatusError(429, 0) },
      })
      await queue.idle()
      expect(store.getPaper(paper.id)).toMatchObject({ venue: 'arXiv', year: 2025 })
      expect(queue.uploads()[0]).toMatchObject({ step: 'done', found: 'arxiv' })
      expect(JSON.stringify((await store.listFeed())[0]?.body)).toContain('元数据取自 arXiv。')
    })

    it('既没有 arXiv 编号也没有标明的 DOI 时不查', async () => {
      const { queue, asked } = keyed({ title: 'Speculative Serving at Scale' })
      await queue.idle()
      expect(asked).toEqual([])
    })
  })
})
