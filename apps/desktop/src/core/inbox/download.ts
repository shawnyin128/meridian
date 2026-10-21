import {
  MAX_PDF_UPLOAD_BYTES, type DownloadProgress, type InboxDownloadResult,
} from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import { HttpStatusError, netFailure, type HttpGet } from '../net/http.js'
import type { VaultStore } from '../vault.js'
import { isWriteFailure } from '../vault/writer.js'

const DOWNLOAD_TIMEOUT_MS = 120_000

export type InboxDownloads = {
  download(id: string): Promise<InboxDownloadResult>
  progress(): DownloadProgress[]
}

/** Builds the real PDF downloader for inbox and later-queue entries. */
export function createInboxDownloads(deps: {
  store: VaultStore; get: HttpGet; onWrite: () => void
}): InboxDownloads {
  const running = new Map<string, DownloadProgress>()
  return {
    async download(id) {
      if (running.has(id)) throw new CallError('busy', `这一条正在下载：${id}`)
      const plan = deps.store.prepareInboxDownload(id)
      if (plan.kind !== 'fetch') return plan
      running.set(id, { id, received: 0, total: null })
      let body: Uint8Array
      try {
        const response = await deps.get(plan.url, {
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
          limit: MAX_PDF_UPLOAD_BYTES,
          onProgress: (received, total) => { running.set(id, { id, received, total }) },
        })
        if (response.status !== 200) throw new HttpStatusError(response.status)
        body = response.body
      } catch (error) {
        return { kind: 'failed', reason: netFailure(error) }
      } finally {
        running.delete(id)
      }
      if (!Buffer.from(body.subarray(0, 1024)).toString('latin1').includes('%PDF-')) {
        return { kind: 'failed', reason: 'not-pdf' }
      }
      let result: InboxDownloadResult
      try {
        result = deps.store.completeInboxDownload(id, body)
      } catch (error) {
        if (!isWriteFailure(error)) throw error
        return { kind: 'failed', reason: 'write' }
      }
      if (result.kind === 'added') {
        deps.store.appendFeed({
          source: 'me',
          body: {
            kind: 'runs',
            runs: [
              { kind: 'text', text: '已入库：' },
              { kind: 'strong', text: `《${deps.store.getPaper(result.paper).title}》` },
              { kind: 'text', text: '，元数据取自 arXiv。' },
            ],
          },
        })
        deps.onWrite()
      }
      return result
    },
    progress: () => [...running.values()].map((entry) => ({ ...entry })),
  }
}
