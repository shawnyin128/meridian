// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('keeps the personal remark and page-linked notes separate from Wiki content', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    // Every row draws a 54px box, stacked from the top of its list.
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const rows = [...this.closest('.structured-list')!.querySelectorAll('.structured-row')]
      return { top: 0, bottom: 54 * (rows.indexOf(this) + 1) } as DOMRect
    })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(
      <MessagesProvider><PaperUnderstanding reading={reading} onRead={() => undefined} /></MessagesProvider>,
    ))
    const html = host.innerHTML
    expect(html).toContain('个人理解')
    expect(html).toContain('随笔')
    expect(html).toContain('fixed-context diagnostic')
    expect(html).toContain('笔记 · 6')
    expect(html).toContain('structured-list--embedded')
    expect(html).toContain('structured-list--scrollable')
    expect(html).not.toContain('Wiki 内化内容')
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows empty personal state as a section empty state under a heading with no actions; reading starts from the page header', () => {
    const empty = { paperId: 'paper-1', highlights: [], notes: [], remark: '' }
    const html = renderToStaticMarkup(
      <MessagesProvider><PaperUnderstanding reading={empty} onRead={() => undefined} /></MessagesProvider>,
    )
    expect(html).toContain('还没有随笔和笔记')
    expect(html).toContain('<div class="section-heading section-heading--page">个人理解</div>')
    expect(html).not.toContain('去阅读论文')
  })
})
