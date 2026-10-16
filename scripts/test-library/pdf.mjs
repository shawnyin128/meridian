import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import * as pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs'

// Parse on this thread, as Core does, instead of starting a pdf.js worker.
globalThis.pdfjsWorker = pdfWorker

/**
 * A one-page PDF whose info title is `title` and whose text layer holds `lines` in Helvetica, the
 * first one large. Every string must be Latin-1.
 */
export function stubPdf(title, lines) {
  const escape = (text) => text.replace(/[\\()]/g, (char) => `\\${char}`)
  const text = lines.map((line, at) => `BT /F1 ${at === 0 ? 15 : 11} Tf 56 ${740 - at * 24} Td (${escape(line)}) Tj ET`).join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(text, 'latin1')} >>\nstream\n${text}\nendstream`,
    `<< /Title (${escape(title)}) /Producer (Meridian test library) >>`,
  ]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((object, at) => {
    const offset = Buffer.byteLength(body, 'latin1')
    body += `${at + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

/**
 * The non-blank text items of page `page` of `bytes`, each with its string and its box as a
 * fraction of the page, measured from the top left, the way the reader stores highlight rectangles.
 */
export async function textLines(bytes, page) {
  const task = getDocument({
    data: new Uint8Array(bytes), disableFontFace: true, useWorkerFetch: false,
    isOffscreenCanvasSupported: false, isImageDecoderSupported: false, verbosity: 0,
  })
  try {
    const sheet = await (await task.promise).getPage(page)
    const view = sheet.getViewport({ scale: 1 })
    const { items } = await sheet.getTextContent()
    return items.filter((item) => 'str' in item && item.str.trim() !== '').map((item) => {
      const size = Math.hypot(item.transform[2], item.transform[3])
      const [left, top] = view.convertToViewportPoint(item.transform[4], item.transform[5] + size * 0.85)
      return {
        text: item.str,
        rect: {
          x: left / view.width, y: top / view.height,
          width: Math.min(item.width / view.width, 1 - left / view.width), height: (size * 1.1) / view.height,
        },
      }
    })
  } finally {
    await task.destroy()
  }
}
