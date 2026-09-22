import { describe, expect, it } from 'vitest'
import { applyReadingMutation, emptyPaperReading, readingNoteCount } from './reading.js'

describe('paper reading', () => {
  let seq = 0
  const nextId = (prefix: string) => `${prefix}-${++seq}`

  it('按语义命令新增、修改、删除高亮和笔记，身份与日期归 Core', () => {
    const paper = 'paper-1'
    const highlighted = applyReadingMutation(emptyPaperReading(paper), {
      kind: 'highlight.add', page: 2, quote: ' evidence ', color: 'yellow',
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
    }, nextId, '2026-09-13')
    expect(highlighted.highlights[0]).toMatchObject({
      id: 'highlight-1', quote: 'evidence', created: '2026-09-13', updated: '2026-09-13',
    })

    const annotated = applyReadingMutation(highlighted, {
      kind: 'highlight.update', id: 'highlight-1', note: '我的判断', color: 'green',
    }, nextId, '2026-09-14')
    expect(annotated.highlights[0]).toMatchObject({
      note: '我的判断', color: 'green', updated: '2026-09-14',
    })
    expect(highlighted.highlights[0]?.note).toBe('')

    const noted = applyReadingMutation(annotated, {
      kind: 'note.add', page: 3, text: ' 复现实验 ',
    }, nextId, '2026-09-14')
    expect(noted.notes[0]).toMatchObject({ id: 'note-2', page: 3, text: '复现实验' })
    expect(readingNoteCount(noted)).toBe(2)

    const revised = applyReadingMutation(noted, {
      kind: 'note.update', id: 'note-2', text: '复现实验和消融',
    }, nextId, '2026-09-14')
    const withoutHighlight = applyReadingMutation(revised, {
      kind: 'highlight.delete', id: 'highlight-1',
    }, nextId, '2026-09-14')
    const empty = applyReadingMutation(withoutHighlight, {
      kind: 'note.delete', id: 'note-2',
    }, nextId, '2026-09-14')
    expect(empty).toEqual({ paperId: paper, highlights: [], notes: [], remark: '' })
  })

  it('随笔一篇一段,再存一次是替换,存空串就清掉;读到第几页只记最后一次,都不算笔记', () => {
    const today = '2026-09-14'
    const remarked = applyReadingMutation(
      emptyPaperReading('paper-2'), { kind: 'remark.set', text: ' 第一反应 ' }, nextId, today,
    )
    expect(remarked.remark).toBe('第一反应')
    expect(applyReadingMutation(
      remarked, { kind: 'remark.set', text: '改过' }, nextId, today,
    ).remark).toBe('改过')
    expect(applyReadingMutation(
      remarked, { kind: 'remark.set', text: '' }, nextId, today,
    ).remark).toBe('')
    const progressed = applyReadingMutation(
      remarked, { kind: 'progress.set', page: 7 }, nextId, today,
    )
    expect(progressed.lastPage).toBe(7)
    expect(applyReadingMutation(
      progressed, { kind: 'progress.set', page: 3 }, nextId, today,
    ).lastPage).toBe(3)
    expect(readingNoteCount(progressed)).toBe(0)
  })

  it('修改不存在的条目会拒绝，不静默吞掉 stale UI 的写入', () => {
    const empty = emptyPaperReading('paper-1')
    expect(() => applyReadingMutation(empty, {
      kind: 'highlight.update', id: 'missing', note: 'x',
    }, nextId, '2026-09-14')).toThrow('高亮不存在:missing')
    expect(() => applyReadingMutation(empty, {
      kind: 'note.delete', id: 'missing',
    }, nextId, '2026-09-14')).toThrow('笔记不存在:missing')
  })
})
