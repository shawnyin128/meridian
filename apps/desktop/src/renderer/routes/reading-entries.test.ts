import { describe, expect, it } from 'vitest'
import type { PaperReading } from '../../shared/contract.js'
import { entryAnchor, readingEntries } from '../components/paper-table/reading-entries.js'

const RECT = [{ x: 0, y: 0, width: 0.1, height: 0.1 }]
const READING: PaperReading = {
  paperId: 'p',
  remark: '',
  highlights: [
    {
      id: 'h-old', page: 2, quote: '旧片段', rects: RECT, color: 'yellow', note: '旧批注',
      created: '2026-09-01', updated: '2026-09-01',
    },
    {
      id: 'h-bare', page: 3, quote: '只高亮', rects: RECT, color: 'yellow', note: '  ',
      created: '2026-09-13', updated: '2026-09-13',
    },
  ],
  notes: [{
    id: 'n-new', page: 5, text: '新笔记', created: '2026-09-10', updated: '2026-09-12',
  }],
}

describe('reading entries', () => {
  it('只列写了字的,最近改过的在前;高亮带片段,笔记不带', () => {
    expect(readingEntries(READING)).toEqual([
      { id: 'n-new', kind: 'note', page: 5, quote: null, text: '新笔记', updated: '2026-09-12' },
      { id: 'h-old', kind: 'highlight', page: 2, quote: '旧片段', text: '旧批注', updated: '2026-09-01' },
    ])
  })

  it('点高亮落到高亮那一格,点笔记落到笔记那一格', () => {
    const [note, highlight] = readingEntries(READING)
    expect(entryAnchor(note!)).toEqual({ page: 5, note: 'n-new', panel: 'notes' })
    expect(entryAnchor(highlight!)).toEqual({ page: 2, highlight: 'h-old', panel: 'highlights' })
  })
})
