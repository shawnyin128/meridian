// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../../messages/useMessages.js'
import { ProjectAttachments } from './ProjectSections.js'

describe('ProjectAttachments', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('puts the attachment\'s delete into the row-actions slot as a glyph that turns red on hover', () => {
    act(() => root.render(
      <MessagesProvider>
        <ProjectAttachments
          attachments={[{ id: 'a1', name: 'run.log', size: '2 KB', path: 'attachments/run.log' }]}
          onAdd={vi.fn()} onReveal={vi.fn()} onRemove={vi.fn()}
        />
      </MessagesProvider>,
    ))
    const slot = (row: Element) => [...row.querySelectorAll('.row-actions button')].map((item) => [
      item.getAttribute('aria-label'), item.textContent, item.classList.contains('icbtn'), item.classList.contains('danger'),
    ])
    expect(slot(host.querySelector('.attrow')!)).toEqual([['Delete attachment', '', true, true]])
  })

  it('reveals an attachment from a button that holds its name', () => {
    const attachment = { id: 'a1', name: 'run.log', size: '2 KB', path: 'attachments/run.log' }
    const onReveal = vi.fn()
    act(() => root.render(
      <MessagesProvider>
        <ProjectAttachments attachments={[attachment]} onAdd={vi.fn()} onReveal={onReveal} onRemove={vi.fn()} />
      </MessagesProvider>,
    ))
    const name = host.querySelector<HTMLElement>('.attrow .an')!
    expect(name.tagName).toBe('BUTTON')
    act(() => name.click())
    expect(onReveal).toHaveBeenCalledWith(attachment)
  })
})
