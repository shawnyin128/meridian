import { describe, expect, it } from 'vitest'
import { createFixtureStore } from '../../fixture-store.js'
import type { RemotePaper } from '../../net/arxiv.js'
import { minimalPdf } from '../../net/minimal-pdf.js'
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

  it('没有编号时使用 PDF info 标题', async () => {
    const { store, queue, lookups, upload } = setup({ facts: { title: 'Speculative Serving at Scale' } })
    const paper = upload('scan.pdf')
    await queue.idle()
    expect(lookups).toEqual([])
    expect(store.getPaper(paper.id).title).toBe('Speculative Serving at Scale')
    expect(queue.uploads()[0]).toMatchObject({ step: 'done', found: 'pdf' })
  })

  it('远端失败不删除已入库论文,并留下短原因', async () => {
    const { store, queue, upload } = setup({ facts: { firstPage: 'arXiv:2509.01234v1' }, error: new TypeError('fetch failed') })
    const paper = upload('draft-trees.pdf')
    await queue.idle()
    expect(store.getPaper(paper.id).title).toBe('draft-trees')
    expect(queue.uploads()[0]).toMatchObject({ step: 'failed', error: '网络不可用' })
    expect(JSON.stringify(store.listFeed().at(-1)?.body)).toContain('元数据暂未补全')
    expect(JSON.stringify(store.listFeed().at(-1)?.body)).not.toContain('网络不可用')
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
})
