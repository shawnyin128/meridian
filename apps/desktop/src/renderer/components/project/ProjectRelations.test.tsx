// @vitest-environment jsdom
import { act, createRef, type ReactNode, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RelationGroup } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { PROJECT_PAPER_GROUP, PROJECT_URL_GROUP, ProjectRelations } from './ProjectSections.js'

describe('ProjectRelations', () => {
  let host: HTMLDivElement
  let root: Root
  const groups: RelationGroup[] = [{
    group: 'Wiki',
    items: [
      { id: 'rel-1', text: 'Tree-width knee', page: 'topics/knee' },
      { id: 'rel-2', text: 'Run board', url: 'https://wandb.ai/team/draft' },
    ],
  }]
  const onEdit = vi.fn()
  const onOpenPage = vi.fn()
  const onOpenPaper = vi.fn()
  const onMove = vi.fn()

  const render = (editing?: { id: string; row: RefObject<HTMLDivElement | null>; input: ReactNode }) => act(() => {
    root.render(
      <MessagesProvider>
        <ProjectRelations
          groups={groups} papers={[{ id: 'p1', title: 'EAGLE-2' }]} editing={editing}
          onEdit={onEdit} onRemove={vi.fn()} onOpenPage={onOpenPage} onOpenPaper={onOpenPaper}
          onRemovePaper={vi.fn()} onMove={onMove}
        />
      </MessagesProvider>,
    )
  })

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  it('offers editing on relation items only and puts the host editor in place of the item being edited', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render()
    expect(host.querySelectorAll('[data-paper] .tagchip-edit')).toHaveLength(0)
    const edits = [...host.querySelectorAll<HTMLButtonElement>('.tagchip-edit')]
    expect(edits).toHaveLength(2)
    act(() => edits[1]!.click())
    expect(onEdit).toHaveBeenCalledWith(groups[0]!.items[1])
    expect(open).not.toHaveBeenCalled()

    const row = createRef<HTMLDivElement>()
    render({ id: 'rel-2', row, input: <input className="probe" /> })
    const wiki = host.querySelector('.wkrel')!
    expect([...wiki.children].map((child) => child.className)).toEqual(['rl', 'tag tag--chip tag--neutral tagchip', 'reladd'])
    expect(row.current).toBe(wiki.lastElementChild)
    expect(row.current?.querySelector('.probe')).not.toBeNull()
    open.mockRestore()
  })

  it('puts a chip\'s edit and remove into the chip\'s row-actions slot; the chip hosts the slot', () => {
    render()
    const slot = (chip: Element) => [...chip.querySelectorAll('.row-actions button')].map((item) => [
      item.getAttribute('aria-label'), item.textContent, item.classList.contains('icbtn'),
    ])
    const paper = host.querySelector('[data-paper="p1"]')!
    expect(paper.hasAttribute('data-row-actions')).toBe(true)
    expect(slot(paper)).toEqual([['Remove link', '', true]])
    const item = host.querySelector('.wkrel [data-wk]')!
    expect(item.hasAttribute('data-row-actions')).toBe(true)
    expect(slot(item)).toEqual([['Edit link', '', true], ['Remove link', '', true]])
  })

  it('moves a chip one place with Alt+← / Alt+→ from its name, within its own row', () => {
    render()
    const altKey = (selector: string, key: string) => act(() => {
      host.querySelector(`${selector} .tagchip-open`)!.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, bubbles: true }))
    })
    altKey('[data-wk="topics/knee"]', 'ArrowRight')
    expect(onMove).toHaveBeenLastCalledWith('rel-1', 1)
    altKey('[data-url="https://wandb.ai/team/draft"]', 'ArrowLeft')
    expect(onMove).toHaveBeenLastCalledWith('rel-2', 0)
    onMove.mockClear()
    altKey('[data-wk="topics/knee"]', 'ArrowLeft')
    altKey('[data-paper="p1"]', 'ArrowRight')
    expect(onMove).not.toHaveBeenCalled()
  })

  it('opens a paper, a Wiki page and a URL from the button that holds each chip\'s name', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render()
    const name = (selector: string) => {
      const button = host.querySelector<HTMLElement>(selector)!.firstElementChild as HTMLElement
      expect(button.tagName, selector).toBe('BUTTON')
      return button
    }
    act(() => name('[data-paper="p1"]').click())
    expect(onOpenPaper).toHaveBeenCalledWith('p1')
    act(() => name('[data-wk="topics/knee"]').click())
    expect(onOpenPage).toHaveBeenCalledWith('topics/knee')
    act(() => name('[data-url="https://wandb.ai/team/draft"]').click())
    expect(open).toHaveBeenCalledWith('https://wandb.ai/team/draft', '_blank')
    open.mockRestore()
  })

  /** Renders the relations with stored groups that hold no items, and returns each row's label. */
  const rowsFor = (papers: { id: string; title: string }[], adding?: string) => {
    act(() => {
      root.render(
        <MessagesProvider>
          <ProjectRelations
            groups={[{ group: 'Wiki', items: [] }, { group: PROJECT_URL_GROUP, items: [] }, { group: PROJECT_PAPER_GROUP, items: [] }]}
            papers={papers}
            adding={adding === undefined
              ? undefined
              : { group: adding, row: createRef<HTMLDivElement>(), input: <input />, onGroup: vi.fn() }}
            onEdit={onEdit} onRemove={vi.fn()} onOpenPage={vi.fn()} onOpenPaper={vi.fn()}
            onRemovePaper={vi.fn()} onMove={vi.fn()}
          />
        </MessagesProvider>,
      )
    })
    return [...host.querySelectorAll('.wkrel > .rl')].map((label) => label.textContent)
  }

  it('shows no row for a stored group whose last item was removed', () => {
    expect(rowsFor([])).toEqual([])
  })

  it('keeps the papers row while papers are linked and the row an item is being added to', () => {
    expect(rowsFor([{ id: 'p1', title: 'EAGLE-2' }], PROJECT_URL_GROUP)).toEqual(['URLs', 'Papers'])
  })
})
