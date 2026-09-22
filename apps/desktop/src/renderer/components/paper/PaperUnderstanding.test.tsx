// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PaperReading } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { PaperUnderstanding } from './PaperUnderstanding.js'

const reading: PaperReading = {
  paperId: 'paper-1',
  remark: 'The mechanism depends on keeping the diagnostic context fixed.',
  highlights: [{
    id: 'highlight-1', page: 2, quote: 'fixed-context diagnostic',
    rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }], color: 'yellow',
    note: 'Compare this assumption against adaptive-context baselines.',
    created: '2026-09-18', updated: '2026-09-18',
  }],
  notes: Array.from({ length: 5 }, (_, index) => ({
    id: `note-${index}`, page: index + 3, text: `Note ${index + 1}`,
    created: '2026-09-18', updated: `2026-09-${String(17 - index).padStart(2, '0')}`,
  })),
}

describe('PaperUnderstanding', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('keeps the personal remark and page-linked notes separate from Wiki content', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider><PaperUnderstanding reading={reading} onRead={() => undefined} /></MessagesProvider>,
    )
    expect(html).toContain('个人理解')
    expect(html).toContain('随笔')
    expect(html).toContain('fixed-context diagnostic')
    expect(html).toContain('笔记 · 6')
    expect(html).toContain('structured-list--embedded')
    expect(html).toContain('structured-list--scrollable')
    expect(html).not.toContain('Wiki 内化内容')
  })

  it('invites reading instead of presenting empty personal state as Wiki prose', () => {
    const empty = { paperId: 'paper-1', highlights: [], notes: [], remark: '' }
    const html = renderToStaticMarkup(
      <MessagesProvider><PaperUnderstanding reading={empty} onRead={() => undefined} /></MessagesProvider>,
    )
    expect(html).toContain('还没有随笔或笔记')
    expect(html).toContain('去阅读论文')
  })
})
