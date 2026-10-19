// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InlineDraftInput } from './InlineDraftInput.js'
import { ModalDialog, ModalTitle } from './ModalDialog.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

function Example() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>打开设置</button>
      <ModalDialog open={open} onOpenChange={setOpen} contentClassName="settings-modal">
        <ModalTitle>设置</ModalTitle>
        <button type="button" onClick={() => setOpen(false)}>完成</button>
      </ModalDialog>
    </>
  )
}

function WithDraft() {
  const [drafting, setDrafting] = useState(true)
  const [open, setOpen] = useState(true)
  return (
    <ModalDialog open={open} onOpenChange={setOpen} contentClassName="settings-modal">
      <ModalTitle>设置</ModalTitle>
      <button type="button" className="add" onClick={() => setDrafting(true)}>添加</button>
      {drafting
        ? <InlineDraftInput placeholder="名称" onSubmit={() => true} onCancel={() => setDrafting(false)} />
        : null}
    </ModalDialog>
  )
}

const pressEscape = (target: Element) => act(() => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
})

describe('ModalDialog', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  it('owns the modal surface and restores focus to the programmatic opener', async () => {
    act(() => root!.render(<Example />))
    const opener = host.querySelector<HTMLButtonElement>('button')!
    opener.focus()
    act(() => opener.click())

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.body.textContent).toContain('设置')
    await act(async () => {
      Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent === '完成')!.click()
      await Promise.resolve()
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('stays open on an Escape that ends an input method composition and closes on the next one', () => {
    const change = vi.fn()
    act(() => root!.render(
      <ModalDialog open onOpenChange={change} contentClassName="settings-modal">
        <ModalTitle>设置</ModalTitle>
        <input aria-label="名称" />
      </ModalDialog>,
    ))
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true })))
    expect(change).not.toHaveBeenCalled()

    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(change).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('Esc in an inline draft cancels only the draft, and Esc elsewhere still closes the dialog', () => {
    act(() => root!.render(<WithDraft />))
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
    expect(document.activeElement).toBe(input)

    pressEscape(input)
    expect(document.querySelector('[role="dialog"] input')).toBeNull()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()

    pressEscape(document.querySelector('[role="dialog"] .add')!)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
