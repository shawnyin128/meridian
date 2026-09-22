import { createHash } from 'node:crypto'
import { MAX_PDF_UPLOAD_BYTES, type PaperImportResult } from '../../shared/contract.js'

export type ParsedPaperUpload = {
  bytes: Uint8Array
  sourceId: string
  title: string
  sourceFilename: string
}

/** Characters unsuitable for filenames across supported filesystems. */
const UNSAFE_FILENAME = /[<>:"/\\|?*\u0000-\u001f]/g

/**
 * Validates one uploaded PDF and derives its immutable source identity and
 * display title. The source id is content-addressed, so importing the same
 * bytes twice can return the existing paper without rewriting the source.
 */
export function parsePaperUpload(filename: string, bytes: Uint8Array): ParsedPaperUpload {
  if (bytes.byteLength === 0) throw new Error('PDF 是空文件')
  if (bytes.byteLength > MAX_PDF_UPLOAD_BYTES) throw new Error('PDF 不能大于 100 MB')
  const header = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 1024))
    .toString('latin1')
  if (!header.includes('%PDF-')) throw new Error('选择的文件不是有效的 PDF')

  const bare = filename.replace(/\.pdf$/i, '').replace(/\s+/g, ' ').trim()
  const title = bare || '未命名论文'
  const safe = title.replace(UNSAFE_FILENAME, '-').replace(/\.+$/g, '').trim().slice(0, 96)
    || 'paper'
  const digest = createHash('sha256').update(bytes).digest('hex')
  const sourceId = `paper-pdf-${digest.slice(0, 12)}`
  return { bytes, sourceId, title, sourceFilename: `${sourceId}-${safe}.pdf` }
}

/** Shared import-result construction for fixtures and real vaults so their shapes cannot drift. */
export function paperImportResult(
  kind: PaperImportResult['kind'], paper: PaperImportResult['paper'],
): PaperImportResult {
  return { kind, paper: structuredClone(paper) }
}
