import type {
  PaperHighlight, PaperNote, PaperReading, ReadingMutation,
} from '../../shared/contract.js'

/** Reading state for a paper with no reading interactions yet. */
export function emptyPaperReading(paperId: string): PaperReading {
  return { paperId, highlights: [], notes: [], remark: '' }
}

/**
 * Applies one semantic reading command. IDs and dates are supplied by Core,
 * never trusted from the renderer. The returned object is detached from the
 * previous snapshot so persistence can atomically replace it.
 */
export function applyReadingMutation(
  held: PaperReading,
  mutation: ReadingMutation,
  nextId: (prefix: string) => string,
  today: string,
): PaperReading {
  const reading = structuredClone(held)
  if (mutation.kind === 'highlight.add') {
    const highlight: PaperHighlight = {
      id: nextId('highlight'),
      page: mutation.page,
      quote: mutation.quote.trim(),
      rects: structuredClone(mutation.rects),
      color: mutation.color,
      note: '',
      created: today,
      updated: today,
    }
    return { ...reading, highlights: [...reading.highlights, highlight] }
  }
  if (mutation.kind === 'highlight.update') {
    if (!reading.highlights.some((item) => item.id === mutation.id)) {
      throw new Error(`高亮不存在:${mutation.id}`)
    }
    return {
      ...reading,
      highlights: reading.highlights.map((item) => (item.id === mutation.id
        ? {
          ...item,
          note: mutation.note,
          ...(mutation.color === undefined ? {} : { color: mutation.color }),
          updated: today,
        }
        : item)),
    }
  }
  if (mutation.kind === 'highlight.delete') {
    if (!reading.highlights.some((item) => item.id === mutation.id)) {
      throw new Error(`高亮不存在:${mutation.id}`)
    }
    return { ...reading, highlights: reading.highlights.filter((item) => item.id !== mutation.id) }
  }
  if (mutation.kind === 'note.add') {
    const note: PaperNote = {
      id: nextId('note'),
      page: mutation.page,
      text: mutation.text.trim(),
      created: today,
      updated: today,
    }
    return { ...reading, notes: [...reading.notes, note] }
  }
  if (mutation.kind === 'note.update') {
    if (!reading.notes.some((item) => item.id === mutation.id)) {
      throw new Error(`笔记不存在:${mutation.id}`)
    }
    return {
      ...reading,
      notes: reading.notes.map((item) => (item.id === mutation.id
        ? { ...item, text: mutation.text.trim(), updated: today }
        : item)),
    }
  }
  if (mutation.kind === 'remark.set') return { ...reading, remark: mutation.text.trim() }
  if (mutation.kind === 'progress.set') return { ...reading, lastPage: mutation.page }
  if (!reading.notes.some((item) => item.id === mutation.id)) {
    throw new Error(`笔记不存在:${mutation.id}`)
  }
  return { ...reading, notes: reading.notes.filter((item) => item.id !== mutation.id) }
}

/** The paper-table note count includes only entries with text, not highlight-only records. */
export function readingNoteCount(reading: PaperReading): number {
  return reading.notes.length + reading.highlights.filter((item) => item.note.trim() !== '').length
}
