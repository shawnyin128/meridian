// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ConfirmDialog } from './ConfirmDialog.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('ConfirmDialog', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  it('uses one dialog shell and invokes the supplied consequence only after confirmation', () => {
    const confirm = vi.fn()
    act(() => root!.render(
      <MessagesProvider>
        <ConfirmDialog
          trigger={<button>删除记录</button>} title="删除这条记录？"
          description="删除后不能恢复。" confirmLabel="确认删除" onConfirm={confirm}
        />
      </MessagesProvider>,
    ))
    act(() => host.querySelector<HTMLButtonElement>('button')!.click())
    const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]')!
    expect([...dialog.classList]).toEqual(['modal', 'confirm'])
    expect(dialog.querySelector('.modal-title')!.textContent).toBe('删除这条记录？')
    expect(dialog.querySelector('.modal-body > .modal-detail')!.textContent).toBe('删除后不能恢复。')
    expect(dialog.getAttribute('aria-describedby')).toBe(dialog.querySelector('.modal-detail')!.id)
    expect(confirm).not.toHaveBeenCalled()
    act(() => Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === '确认删除')!.click())
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('confirms an irreversible loss with the solid danger button and anything else with the primary button', () => {
    const confirmOf = (tone: 'danger' | 'primary') => {
      act(() => root!.render(
        <MessagesProvider>
          <ConfirmDialog
            trigger={<button>打开</button>} title="确认？" description="确认后生效。" confirmLabel="确认"
            confirmTone={tone} onConfirm={vi.fn()}
          />
        </MessagesProvider>,
      ))
      act(() => host.querySelector<HTMLButtonElement>('button')!.click())
      const classes = [...document.querySelectorAll<HTMLButtonElement>('.modal-actions button')].map((button) => button.className)
      act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
      return classes
    }
    expect(confirmOf('danger')).toEqual(['btn', 'btn pri danger'])
    expect(confirmOf('primary')).toEqual(['btn', 'btn pri'])
  })

  it('stays open on an Escape that ends an input method composition and closes on the next one', () => {
    act(() => root!.render(
      <MessagesProvider>
        <ConfirmDialog trigger={<button>删除记录</button>} title="删除这条记录？" description="删除后不能恢复。" onConfirm={vi.fn()} />
      </MessagesProvider>,
    ))
    act(() => host.querySelector<HTMLButtonElement>('button')!.click())
    const focused = document.activeElement!
    act(() => focused.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true })))
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()

    act(() => focused.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it('without a trigger the host opens and closes it, and closing returns focus to what held it when it opened', async () => {
    const confirm = vi.fn()
    function Host() {
      const [open, setOpen] = useState(false)
      return (
        <MessagesProvider>
          <button onClick={() => setOpen(true)}>离开</button>
          <ConfirmDialog open={open} onOpenChange={setOpen} title="放弃修改？" description="修改不会保留。" onConfirm={confirm} />
        </MessagesProvider>
      )
    }
    act(() => root!.render(<Host />))
    const leave = host.querySelector<HTMLButtonElement>('button')!
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()

    act(() => { leave.focus(); leave.click() })
    expect(document.querySelector('[role="alertdialog"] .modal-title')!.textContent).toBe('放弃修改？')
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.modal-actions button')].find((button) => button.textContent === '取消')!.click())
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(confirm).not.toHaveBeenCalled()
    // Radix hands focus back in a task of its own after the dialog unmounts.
    await vi.waitFor(() => expect(document.activeElement).toBe(leave))

    act(() => leave.click())
    act(() => document.querySelector<HTMLButtonElement>('.modal-actions .btn.pri')!.click())
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  })
})
