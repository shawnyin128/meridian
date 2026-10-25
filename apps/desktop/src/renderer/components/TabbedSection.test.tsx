// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { TabbedSection, type TabbedSectionTab } from './TabbedSection.js'

type View = 'rows' | 'none'

const tabs = (rows: string[]): TabbedSectionTab<View>[] => [
  { value: 'rows', label: '记录', content: rows.length === 0 ? null : <ul>{rows.map((row) => <li key={row}>{row}</li>)}</ul> },
  { value: 'none', label: '结论', content: null },
]

describe('TabbedSection', () => {
  it('puts its switch first in the heading actions, then the section actions, and the picked tab under the heading', () => {
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(
      <TabbedSection
        heading="科研记录" label="科研记录视图" value="rows" tabs={tabs(['创建项目'])} onChange={() => {}}
        actions={<button type="button" className="add-action">新建</button>} panelClassName="record-view"
      />,
    )
    const [heading, panel] = [...host.children]
    expect(heading!.className).toBe('section-heading section-heading--section')
    expect(heading!.firstChild!.textContent).toBe('科研记录')
    expect([...heading!.querySelector(':scope > .section-heading-actions')!.children].map((child) => child.className))
      .toEqual(['segmented-control segmented-control--sm', 'add-action'])
    expect(heading!.querySelector('.segmented-control')!.getAttribute('aria-label')).toBe('科研记录视图')
    expect(panel!.className).toBe('tabbed-section-panel record-view')
    expect(panel!.innerHTML).toBe('<ul><li>创建项目</li></ul>')
  })

  it('shows the section empty state, the shared empty value without a sentence, when the picked tab has nothing', () => {
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(
      <MessagesProvider><TabbedSection heading="科研记录" label="科研记录视图" value="rows" tabs={tabs([])} onChange={() => {}} /></MessagesProvider>,
    )
    expect(host.querySelector('.tabbed-section-panel')!.innerHTML)
      .toBe('<div class="empty-state empty-state--section">—</div>')
  })

  it('shows an error above whichever tab is picked', () => {
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(
      <MessagesProvider>
        <TabbedSection heading="科研记录" label="科研记录视图" value="none" tabs={tabs([])} onChange={() => {}} error="工作区打不开" />
      </MessagesProvider>,
    )
    expect([...host.querySelector('.tabbed-section-panel')!.children].map((child) => child.textContent))
      .toEqual(['工作区打不开', '—'])
  })

  it('swaps the panel to the tab the switch picks', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Switching() {
      const [view, setView] = useState<View>('rows')
      return <TabbedSection heading="科研记录" label="科研记录视图" value={view} tabs={tabs(['创建项目'])} onChange={setView} />
    }
    act(() => root.render(<MessagesProvider><Switching /></MessagesProvider>))
    const panel = () => host.querySelector('.tabbed-section-panel')!.textContent
    expect(panel()).toBe('创建项目')
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.segmented-control>button')][1]!.click())
    expect(panel()).toBe('—')
    act(() => root.unmount())
    host.remove()
  })
})
