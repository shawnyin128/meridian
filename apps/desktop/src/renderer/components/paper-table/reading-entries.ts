import type { PaperReading } from '../../../shared/contract.js'
import type { JumpAnchor } from '../../shell/AppShell.js'

/** A reading record of the words written in a paper: the highlights of the written notes include fragments of the original text, but the notes taken separately do not. */
export type ReadingEntry = {
  id: string
  kind: 'highlight' | 'note'
  page: number
  quote: string | null
  text: string
  updated: string
}

/** For the reading records with written notes in this article, the most recently revised ones are listed first; the highlights without written notes are not counted. */
export function readingEntries(reading: PaperReading): ReadingEntry[] {
  return [
    ...reading.highlights.filter((highlight) => highlight.note.trim() !== '')
      .map((highlight): ReadingEntry => ({
        id: highlight.id,
        kind: 'highlight',
        page: highlight.page,
        quote: highlight.quote,
        text: highlight.note,
        updated: highlight.updated,
      })),
    ...reading.notes.map((note): ReadingEntry => ({
      id: note.id,
      kind: 'note',
      page: note.page,
      quote: null,
      text: note.text,
      updated: note.updated,
    })),
  ].sort((left, right) => right.updated.localeCompare(left.updated))
}

/** Click a reading record to enter the location where the reader will land: that page, that item, and open the cell where it is located in the right column. */
export function entryAnchor(entry: ReadingEntry): JumpAnchor {
  return entry.kind === 'highlight'
    ? { page: entry.page, highlight: entry.id, panel: 'highlights' }
    : { page: entry.page, note: entry.id, panel: 'notes' }
}
