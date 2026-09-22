// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- pdf.js ships no worker types
/// <reference path="./pdf-worker.d.ts" />

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import * as pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs'

/** PDF facts required by paper-library metadata detection. */
export type PdfFacts = {
  title: string | null; subject: string | null; keywords: string | null; firstPage: string; pageCount: number
}

/** Read PDF metadata and first-page text. */
export type PdfProbe = (bytes: Uint8Array) => Promise<PdfFacts>

export type ExtractedPdfPage = { number: number; text: string }

// Core runs in an Electron utility process where pdf.js cannot detect Node or start a Worker.
// Install the worker handler in advance so parsing occurs on this thread.
;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfWorker

const infoText = (info: Record<string, unknown>, key: string): string | null => {
  const value = info[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * Reads the info dictionary's Title, Subject and Keywords (null when absent or
 * blank), the text of the first page, its text items joined by single spaces,
 * and the document's page count. Works on a copy of `bytes`. Throws if pdf.js
 * cannot open the bytes.
 */
export const probePdf: PdfProbe = async (bytes) => {
  const task = getDocument({
    data: bytes.slice(), disableFontFace: true, useWorkerFetch: false,
    isOffscreenCanvasSupported: false, isImageDecoderSupported: false, verbosity: 0,
  })
  try {
    const doc = await task.promise
    const info = (await doc.getMetadata()).info as Record<string, unknown>
    const content = await (await doc.getPage(1)).getTextContent()
    return {
      title: infoText(info, 'Title'),
      subject: infoText(info, 'Subject'),
      keywords: infoText(info, 'Keywords'),
      firstPage: content.items.map((item) => ('str' in item ? item.str : '')).join(' '),
      pageCount: doc.numPages,
    }
  } finally {
    await task.destroy()
  }
}

/** Extract source text page by page so downstream prompts can preserve page provenance. */
export async function extractPdfPages(bytes: Uint8Array): Promise<ExtractedPdfPage[]> {
  const task = getDocument({
    data: bytes.slice(), disableFontFace: true, useWorkerFetch: false,
    isOffscreenCanvasSupported: false, isImageDecoderSupported: false, verbosity: 0,
  })
  try {
    const doc = await task.promise
    const pages: ExtractedPdfPage[] = []
    for (let number = 1; number <= doc.numPages; number += 1) {
      const content = await (await doc.getPage(number)).getTextContent()
      pages.push({
        number,
        text: content.items.map((item) => ('str' in item ? item.str : '')).join(' ').trim(),
      })
    }
    return pages
  } finally {
    await task.destroy()
  }
}
