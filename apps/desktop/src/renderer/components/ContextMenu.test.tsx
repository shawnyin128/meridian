// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextMenu, ContextMenuItem } from './ContextMenu.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

function Example({ choose }: { choose: () => void }) {
  return (
    <ContextMenu label="条目操作" trigger={<button type="button">原条目</button>}>
      <ContextMenuItem onSelect={choose}>打开</ContextMenuItem>
      <ContextMenuItem>删除</ContextMenuItem>
    </ContextMenu>
  )
}

describe('ContextMenu', () => {
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

  const trigger = () => host.querySelector<HTMLButtonElement>('button')!
  const menu = () => document.querySelector<HTMLElement>('[role="menu"]')

  it('opens from the ContextMenu key on the focused trigger with the first action focused, and closes on Escape', async () => {
    act(() => root!.render(<Example choose={vi.fn()} />))
    trigger().focus()
    await act(async () => { trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true })) })
    expect(menu()!.getAttribute('aria-label')).toBe('条目操作')
    expect(host.contains(menu())).toBe(false)
    expect(document.activeElement).toBe(document.querySelector('[role="menuitem"]'))
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(menu()).toBeNull()
  })

  it('opens from Shift+F10 too', async () => {
    act(() => root!.render(<Example choose={vi.fn()} />))
    trigger().focus()
    await act(async () => {
      trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }))
    })
    expect(menu()).not.toBeNull()
  })

  it('stays open on an Escape that ends an input method composition', async () => {
    act(() => root!.render(<Example choose={vi.fn()} />))
    await act(async () => { trigger().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 30 })) })
    await act(async () => {
      menu()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true }))
    })
    expect(menu()).not.toBeNull()
  })

  it('runs the chosen action and closes', async () => {
    const choose = vi.fn()
    act(() => root!.render(<Example choose={choose} />))
    await act(async () => { trigger().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 30 })) })
    await act(async () => { document.querySelector<HTMLElement>('[role="menuitem"]')!.click() })
    expect(choose).toHaveBeenCalledTimes(1)
    expect(menu()).toBeNull()
  })
})
