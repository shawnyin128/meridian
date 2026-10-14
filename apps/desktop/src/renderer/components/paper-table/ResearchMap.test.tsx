// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PaperRow } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ResearchMap } from './ResearchMap.js'

const paper = (id: string, title: string, patch: Partial<PaperRow> = {}): PaperRow => ({
  id, title, venue: 'arXiv', topics: [], methods: [], datasets: [], metrics: [], pageState: 'draft',
  readState: '未读', projects: [], pageCount: 1, noteCount: 0, conclusionCount: 0,
  updated: '2026-09-21', custom: {}, ...patch,
})

describe('ResearchMap', () => {
  beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh'))

  it('scrolls the selected group\'s papers inside the list after the fifth row', () => {
    const grouped = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf']
      .map((title, index) => paper(`p${index}`, title, { topics: ['Speculative decoding'] }))
    const rows = [...grouped, paper('x', 'Hotel'), paper('y', 'India')]
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(
      <MessagesProvider>
        <ResearchMap rows={rows} total={rows.length} loading={false} onOpenPaper={() => {}} />
      </MessagesProvider>,
    )

    const list = host.querySelector('.research-map-papers')!
    expect(list.querySelectorAll('.research-map-paper')).toHaveLength(grouped.length)
    expect(list.classList.contains('structured-list--scrollable')).toBe(true)
    expect(list.getAttribute('style')).toBe('--structured-list-visible-rows:5')
  })
})
