import { describe, expect, it } from 'vitest'
import type { ChatMessage, PaperReading } from '../../shared/contract.js'
import { CHAT_CONTEXT_BUDGETS, packChatHistory, packPaperReading } from './chat.js'

function message(id: string, role: ChatMessage['role'], text: string): ChatMessage {
  return { id, role, runs: [{ kind: 'text', text }], actions: [] }
}

function reading(overrides: Partial<PaperReading> = {}): PaperReading {
  return {
    paperId: 'paper-1', highlights: [], notes: [], remark: '', ...overrides,
  }
}

describe('Harness chat context budgets', () => {
  it('keeps recent non-status turns in chronological order within one total budget', () => {
    const history = packChatHistory([
      message('old', 'you', `old-${'a'.repeat(CHAT_CONTEXT_BUDGETS.historyCharacters)}`),
      message('status', 'status', 'internal status'),
      message('recent', 'ai', 'recent answer'),
    ])

    expect(history.at(-1)).toEqual({ role: 'assistant', text: 'recent answer' })
    expect(history[0]?.text.startsWith('…')).toBe(true)
    expect(history.map((turn) => turn.text).join('').length)
      .toBe(CHAT_CONTEXT_BUDGETS.historyCharacters)
    expect(history.some((turn) => turn.text.includes('internal status'))).toBe(false)
  })

  it('caps turn count independently from the character budget', () => {
    const messages = Array.from({ length: 30 }, (_, index) => (
      message(String(index), index % 2 === 0 ? 'you' : 'ai', `turn-${index}`)
    ))

    const history = packChatHistory(messages)
    expect(history).toHaveLength(CHAT_CONTEXT_BUDGETS.historyTurns)
    expect(history[0]?.text).toBe('turn-10')
    expect(history.at(-1)?.text).toBe('turn-29')
  })

  it('prioritizes authored reading state without allowing one remark to consume the packet', () => {
    const packed = packPaperReading(reading({
      remark: 'r'.repeat(20_000),
      notes: [{
        id: 'note-1', page: 3, text: 'n'.repeat(20_000), created: '2026-09-18', updated: '2026-09-18',
      }],
      highlights: [{
        id: 'highlight-1', page: 4, quote: 'q'.repeat(10_000), note: 'insight',
        rects: [{ x: 0, y: 0, width: 0.1, height: 0.1 }], color: 'yellow',
        created: '2026-09-18', updated: '2026-09-18',
      }],
    }))
    const total = packed.remark.length
      + packed.notes.reduce((sum, item) => sum + item.text.length, 0)
      + packed.highlights.reduce((sum, item) => sum + item.quote.length + item.note.length, 0)

    expect(packed.remark).toContain('…')
    expect(packed.notes).toHaveLength(1)
    expect(packed.highlights).toHaveLength(1)
    expect(total).toBeLessThanOrEqual(CHAT_CONTEXT_BUDGETS.readingCharacters)
  })
})
