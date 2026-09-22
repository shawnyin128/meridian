import type { PdfFacts } from './pdf-probe.js'

/** Modern arXiv identifier recognized by the library: YYMM, dot or hyphen, four or five digits, and optional version. */
const NEW_STYLE = String.raw`(\d{2}(?:0[1-9]|1[0-2]))[.-](\d{4,5})(?:v\d+)?(?!\d)`

/** Content-hash prefix added to filenames when the library stores source files. */
const SOURCE_PREFIX = /^paper-pdf-[0-9a-f]{12}-/

/**
 * Returns the arXiv id (`YYMM.NNNNN`, no version) a PDF names, or null. An
 * `arXiv:`-prefixed id on the first page wins, then one in the info title,
 * subject or keywords, then an id the file name starts with once the vault's
 * source prefix is dropped; a file name may write the dot as a hyphen.
 */
export function arxivIdOf(facts: PdfFacts, filename: string): string | null {
  const stamped = new RegExp(String.raw`arXiv:\s*${NEW_STYLE}`, 'i')
  for (const text of [facts.firstPage, facts.title ?? '', facts.subject ?? '', facts.keywords ?? '']) {
    const hit = stamped.exec(text)
    if (hit) return `${hit[1]}.${hit[2]}`
  }
  const named = new RegExp(`^${NEW_STYLE}`).exec(filename.replace(SOURCE_PREFIX, ''))
  return named ? `${named[1]}.${named[2]}` : null
}

/**
 * Returns the info title trimmed when it can stand for the paper, or null. A
 * title shorter than 8 characters, one ending in a file extension (.pdf, .dvi,
 * .tex, .doc, .docx), or one starting with "untitled" or "Microsoft Word"
 * cannot.
 */
export function usableTitle(title: string | null): string | null {
  const trimmed = title?.trim() ?? ''
  if (trimmed.length < 8) return null
  if (/\.(pdf|dvi|tex|docx?)$/i.test(trimmed) || /^(untitled|microsoft word)/i.test(trimmed)) return null
  return trimmed
}
