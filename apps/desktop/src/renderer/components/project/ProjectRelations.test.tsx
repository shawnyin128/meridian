// @vitest-environment jsdom
import { act, createRef, type ReactNode, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RelationGroup } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { ProjectRelations } from './ProjectSections.js'

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

  const render = (editing?: { id: string; row: RefObject<HTMLDivElement | null>; input: ReactNode }) => act(() => {
    root.render(
      <MessagesProvider>
        <ProjectRelations
          groups={groups} papers={[{ id: 'p1', title: 'EAGLE-2' }]} editing={editing}
          onEdit={onEdit} onRemove={vi.fn()} onOpenPage={vi.fn()} onOpenPaper={vi.fn()}
          onRemovePaper={vi.fn()} onMove={vi.fn()}
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
    expect([...wiki.children].map((child) => child.className)).toEqual(['rl', 'tagchip', 'reladd'])
    expect(row.current).toBe(wiki.lastElementChild)
    expect(row.current?.querySelector('.probe')).not.toBeNull()
    open.mockRestore()
  })
})
