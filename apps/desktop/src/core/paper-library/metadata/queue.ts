import type { FeedRun, MetadataJob } from '../../../shared/contract.js'
import { CallError } from '../../call-error.js'
import type { MetadataProvider, RemotePaper } from '../../net/arxiv.js'
import { netReason } from '../../net/http.js'
import type { Publication, PublicationSource } from '../../net/semantic-metadata.js'
import type { MetadataFill, VaultStore } from '../../vault.js'
import { arxivIdOf, usableTitle } from './detect.js'
import { remoteMetadata } from './fill.js'
import type { PdfFacts, PdfProbe } from './pdf-probe.js'

const KEPT_UPLOADS = 20
const METADATA_BATCH_SIZE = 50
const PDF_PROBE_CONCURRENCY = 4

type Pending = { job: MetadataJob; filename: string; bytes: Uint8Array; arrivalTitle: string }
type Prepared = Pending & { facts: PdfFacts; arxivId: string | null; doi: string | null; infoTitle: string | null }

/** A DOI the first page of a PDF labels as one: after `DOI` or in a doi.org link. */
const LABELLED_DOI = /(?:\bdoi:?\s*|doi\.org\/)(10\.\d{4,9}\/[^\s"<>]+)/i

/** Returns the DOI the first page `text` labels, without the punctuation that ends a sentence, or null. */
const doiOf = (text: string): string | null => LABELLED_DOI.exec(text)?.[1]!.replace(/[.,;:)\]]+$/, '') ?? null

/** The Semantic Scholar id a prepared upload is looked up by: its arXiv id, else the DOI its first page labels. */
const publicationKey = (item: Prepared): string | null => (item.arxivId !== null ? `ARXIV:${item.arxivId}`
  : item.doi !== null ? `DOI:${item.doi}` : null)

export type MetadataQueue = {
  enqueueUpload(paperId: string, filename: string, bytes: Uint8Array): void
  /**
   * Parses paper `paperId` again, as an upload of its stored source under the file name it was
   * uploaded with. Throws a `not-found` CallError when no upload of that paper is listed.
   */
  retry(paperId: string): void
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

/**
 * Builds the bounded metadata queue that probes PDFs concurrently and batches remote lookups. While
 * `publications` gives a source (a Semantic Scholar key is saved), each batch also looks up where its
 * papers were published, by arXiv id or, without one, by the DOI the first page labels, and fills the
 * venue, with the year of that publication, once the rest is filled; a failed lookup leaves the papers as the rest filled them.
 */
export function createMetadataQueue(deps: {
  store: VaultStore; probe: PdfProbe; provider: MetadataProvider; onWrite: () => void
  publications?: () => PublicationSource | undefined
}): MetadataQueue {
  const pending: Pending[] = []
  let uploads: MetadataJob[] = []
  /** The file name each listed upload's paper arrived under, by paper id. */
  const filenames = new Map<string, string>()
  let running: Promise<void> = Promise.resolve()
  let busy = false
  let seq = 0
  let batch = 0

  const note = (runs: FeedRun[]): void => {
    deps.store.appendFeed({ source: 'me', body: { kind: 'runs', runs } })
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
    for (const paperId of filenames.keys()) {
      if (!uploads.some((job) => job.paperId === paperId)) filenames.delete(paperId)
    }
  }

  const finishUpload = (job: MetadataJob, published = false): void => {
    const said = job.step === 'failed' ? '已入库，元数据暂未补全。'
      : job.found === 'arxiv' && published ? '已入库，元数据取自 arXiv 和 Semantic Scholar。'
      : job.found === 'pdf' && published ? '已入库，标题取自 PDF，发表信息取自 Semantic Scholar。'
      : published ? '已入库，发表信息取自 Semantic Scholar。'
      : job.found === 'arxiv' ? '已入库，元数据取自 arXiv。'
        : job.found === 'pdf' ? '已入库，标题取自 PDF。'
          : '已入库，没能识别出元数据。'
    note([
      { kind: 'text', text: '你上传的' },
      { kind: 'strong', text: `《${job.title}》`, target: { kind: 'paper', id: job.paperId } },
      { kind: 'text', text: said },
    ])
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
        doi: doiOf(facts.firstPage),
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

  /** Where the papers of `prepared` were published, by publicationKey; none without a source or when the lookup fails. */
  const published = async (prepared: readonly Prepared[]): Promise<Map<string, Publication>> => {
    const source = deps.publications?.()
    const keys = [...new Set(prepared.flatMap((item) => publicationKey(item) ?? []))]
    if (source === undefined || keys.length === 0) return new Map()
    try {
      return await source.lookup(keys)
    } catch (error) {
      console.error(`[metadata] Semantic Scholar 发表信息没查到：${netReason(error)}`)
      return new Map()
    }
  }

  const write = (item: Prepared, remote: RemotePaper | null, publication?: Publication): void => {
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
      const publishedHere = publication !== undefined && deps.store.fillPaperPublication(item.job.paperId, publication).length > 0
      if (publishedHere) deps.onWrite()
      item.job.title = deps.store.getPaper(item.job.paperId).title
      item.job.found = found
      item.job.step = 'done'
      finishUpload(item.job, publishedHere)
    } catch (error) {
      fail(item, error)
    }
  }

  /** Fails `item` for `error`, its lookup's, after writing the page count its PDF gave, which needs no lookup. */
  const keepPageCount = (item: Prepared, error: unknown): void => {
    try {
      if (deps.store.fillPaperMetadata(item.job.paperId, { pageCount: item.facts.pageCount }, item.arrivalTitle).length > 0) deps.onWrite()
    } catch (writeError) {
      fail(item, writeError)
      return
    }
    fail(item, error)
  }

  const runBatch = async (items: readonly Pending[]): Promise<void> => {
    const candidates = await mapConcurrent(items, PDF_PROBE_CONCURRENCY, prepare)
    const prepared = candidates.filter((item): item is Prepared => item !== null)
    const ids = [...new Set(prepared.flatMap((item) => item.arxivId === null ? [] : [item.arxivId]))]
    for (const item of prepared) if (item.arxivId !== null) item.job.step = 'lookup'
    const remote = await lookup(ids)
    const publications = await published(prepared.filter((item) => item.arxivId === null || !remote.errors.has(item.arxivId)))
    for (const item of prepared) {
      const error = item.arxivId === null ? undefined : remote.errors.get(item.arxivId)
      const key = publicationKey(item)
      if (error !== undefined) keepPageCount(item, error)
      else write(item, item.arxivId === null ? null : remote.papers.get(item.arxivId) ?? null, key === null ? undefined : publications.get(key))
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

  const queue: MetadataQueue = {
    enqueueUpload(paperId, filename, bytes) {
      if (uploads.some((held) => held.paperId === paperId && held.step !== 'done' && held.step !== 'failed')) return
      if (!busy && pending.length === 0) batch += 1
      filenames.set(paperId, filename)
      const job: MetadataJob = {
        id: `parse-${++seq}`, batch, paperId, title: deps.store.getPaper(paperId).title, bytes: bytes.byteLength,
        step: 'read', found: null, error: null,
      }
      uploads.push(job)
      compactUploads()
      pending.push({ job, filename, bytes, arrivalTitle: job.title })
      kick()
    },
    retry(paperId) {
      const filename = filenames.get(paperId)
      if (filename === undefined) throw new CallError('not-found', `这篇论文没有可以重试的上传：${paperId}`)
      queue.enqueueUpload(paperId, filename, deps.store.paperSource(paperId))
    },
    uploads: () => structuredClone(uploads),
    async idle() {
      while (busy) await running
    },
  }
  return queue
}
