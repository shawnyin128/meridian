import type { PaperReading } from '../../../shared/contract.js'
import type { JumpAnchor } from '../../shell/AppShell.js'

/** A reading entry in the user's own words: a highlight with a note carries its quote, a plain note does not. */
export type ReadingEntry = {
  id: string
  kind: 'highlight' | 'note'
  page: number
  quote: string | null
  text: string
  updated: string
}

/** The paper's reading entries with written text, latest update first; highlights without a note are left out. */
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

/** Where the reader lands when an entry is clicked: its page and item, with its panel open in the right rail. */
export function entryAnchor(entry: ReadingEntry): JumpAnchor {
  return entry.kind === 'highlight'
    ? { page: entry.page, highlight: entry.id, panel: 'highlights' }
    : { page: entry.page, note: entry.id, panel: 'notes' }
}
