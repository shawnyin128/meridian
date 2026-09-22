import type { FeedRun, MetadataJob } from '../../../shared/contract.js'
import type { MetadataProvider, RemotePaper } from '../../net/arxiv.js'
import { netReason } from '../../net/http.js'
import type { MetadataFill, VaultStore } from '../../vault.js'
import { arxivIdOf, usableTitle } from './detect.js'
import { remoteMetadata } from './fill.js'
import type { PdfFacts, PdfProbe } from './pdf-probe.js'

const KEPT_UPLOADS = 20
const METADATA_BATCH_SIZE = 50
const PDF_PROBE_CONCURRENCY = 4

type Pending = { job: MetadataJob; filename: string; bytes: Uint8Array; arrivalTitle: string }
type Prepared = Pending & { facts: PdfFacts; arxivId: string | null; infoTitle: string | null }

export type MetadataQueue = {
  enqueueUpload(paperId: string, filename: string, bytes: Uint8Array): void
  uploads(): MetadataJob[]
  idle(): Promise<void>
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await task(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** Builds the bounded metadata queue that probes PDFs concurrently and batches remote lookups. */
export function createMetadataQueue(deps: {
  store: VaultStore; probe: PdfProbe; provider: MetadataProvider; onWrite: () => void
}): MetadataQueue {
  const pending: Pending[] = []
  let uploads: MetadataJob[] = []
  let running: Promise<void> = Promise.resolve()
  let busy = false
  let seq = 0
  let batch = 0

  const note = (runs: FeedRun[]): void => {
    deps.store.appendFeed({ source: 'steward', body: { kind: 'runs', runs } })
    deps.onWrite()
  }

  const compactUploads = (): void => {
    const terminal = (job: MetadataJob) => job.step === 'done' || job.step === 'failed'
    const activeBatches = new Set(uploads.filter((job) => !terminal(job)).map((job) => job.batch))
    const kept = new Set<string>()
    let historical = 0
    for (let index = uploads.length - 1; index >= 0; index -= 1) {
      const job = uploads[index]!
      if (activeBatches.has(job.batch)) kept.add(job.id)
      else if (historical < KEPT_UPLOADS) {
        kept.add(job.id)
        historical += 1
      }
    }
    uploads = uploads.filter((job) => kept.has(job.id))
  }

  const finishUpload = (job: MetadataJob): void => {
    const said = job.step === 'failed' ? '已入库,元数据暂未补全,可在论文表里填写。'
      : job.found === 'arxiv' ? '已入库,元数据取自 arXiv。'
        : job.found === 'pdf' ? '已入库,标题取自 PDF 信息,其余元数据可在论文表里填写。'
          : '已入库,没能识别出元数据,可在论文表里填写。'
    note([{ kind: 'text', text: '你上传的' }, { kind: 'strong', text: `《${job.title}》` }, { kind: 'text', text: said }])
    compactUploads()
  }

  const fail = (item: Pending, error: unknown): null => {
    item.job.step = 'failed'
    item.job.error = netReason(error)
    finishUpload(item.job)
    return null
  }

  const prepare = async (item: Pending): Promise<Prepared | null> => {
    try {
      item.job.step = 'detect'
      const facts = await deps.probe(item.bytes)
      return {
        ...item,
        facts,
        arxivId: arxivIdOf(facts, item.filename),
        infoTitle: usableTitle(facts.title),
      }
    } catch (error) {
      return fail(item, error)
    }
  }

  const lookup = async (ids: readonly string[]): Promise<{
    papers: Map<string, RemotePaper>; errors: Map<string, unknown>
  }> => {
    const papers = new Map<string, RemotePaper>()
    const errors = new Map<string, unknown>()
    if (ids.length === 0) return { papers, errors }
    if (ids.length === 1) {
      const id = ids[0]!
      try {
        const paper = await deps.provider.lookup(id)
        if (paper !== null) papers.set(id, paper)
      } catch (error) {
        errors.set(id, error)
      }
      return { papers, errors }
    }
    if (deps.provider.lookupMany !== undefined) {
      try {
        return { papers: await deps.provider.lookupMany(ids), errors }
      } catch (error) {
        for (const id of ids) errors.set(id, error)
        return { papers, errors }
      }
    }
    await Promise.all(ids.map(async (id) => {
      try {
        const paper = await deps.provider.lookup(id)
        if (paper !== null) papers.set(id, paper)
      } catch (error) {
        errors.set(id, error)
      }
    }))
    return { papers, errors }
  }

  const write = (item: Prepared, remote: RemotePaper | null): void => {
    try {
      let fill: MetadataFill = { pageCount: item.facts.pageCount }
      let found: MetadataJob['found'] = 'none'
      if (remote !== null) {
        fill = { ...remoteMetadata(remote), pageCount: item.facts.pageCount }
        found = 'arxiv'
      } else if (item.infoTitle !== null) {
        fill = { title: item.infoTitle, pageCount: item.facts.pageCount }
        found = 'pdf'
      }
      item.job.step = 'write'
      if (deps.store.fillPaperMetadata(item.job.paperId, fill, item.arrivalTitle).length > 0) deps.onWrite()
      item.job.title = deps.store.getPaper(item.job.paperId).title
      item.job.found = found
      item.job.step = 'done'
      finishUpload(item.job)
    } catch (error) {
      fail(item, error)
    }
  }

  const runBatch = async (items: readonly Pending[]): Promise<void> => {
    const candidates = await mapConcurrent(items, PDF_PROBE_CONCURRENCY, prepare)
    const prepared = candidates.filter((item): item is Prepared => item !== null)
    const ids = [...new Set(prepared.flatMap((item) => item.arxivId === null ? [] : [item.arxivId]))]
    for (const item of prepared) if (item.arxivId !== null) item.job.step = 'lookup'
    const remote = await lookup(ids)
    for (const item of prepared) {
      const error = item.arxivId === null ? undefined : remote.errors.get(item.arxivId)
      if (error !== undefined) fail(item, error)
      else write(item, item.arxivId === null ? null : remote.papers.get(item.arxivId) ?? null)
    }
  }

  const drain = async (): Promise<void> => {
    while (pending.length > 0) {
      await runBatch(pending.splice(0, METADATA_BATCH_SIZE))
    }
  }

  const kick = (): void => {
    if (busy) return
    busy = true
    running = drain().finally(() => {
      busy = false
      if (pending.length > 0) kick()
    })
  }

  return {
    enqueueUpload(paperId, filename, bytes) {
      if (uploads.some((held) => held.paperId === paperId && held.step !== 'done' && held.step !== 'failed')) return
      if (!busy && pending.length === 0) batch += 1
      const job: MetadataJob = {
        id: `parse-${++seq}`, batch, paperId, title: deps.store.getPaper(paperId).title, bytes: bytes.byteLength,
        step: 'read', found: null, error: null,
      }
      uploads.push(job)
      compactUploads()
      pending.push({ job, filename, bytes, arrivalTitle: job.title })
      kick()
    },
    uploads: () => structuredClone(uploads),
    async idle() {
      while (busy) await running
    },
  }
}
