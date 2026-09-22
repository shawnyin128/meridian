// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextMenu, ContextMenuItem } from './ContextMenu.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

function Example({ choose }: { choose: () => void }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button">原条目</button>
      {open
        ? (
          <ContextMenu point={{ x: 20, y: 30 }} label="条目操作" onClose={() => setOpen(false)}>
            <ContextMenuItem onClick={choose}>打开</ContextMenuItem>
          </ContextMenu>
        )
        : null}
    </>
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

  it('portals and focuses the first action, then closes on Escape', () => {
    act(() => root!.render(<Example choose={vi.fn()} />))
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!
    const item = document.querySelector<HTMLElement>('[role="menuitem"]')!
    expect(menu.parentElement).toBe(document.body)
    expect(document.activeElement).toBe(item)
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })

  it('leaves inside presses alone and closes on an outside press', () => {
    act(() => root!.render(<Example choose={vi.fn()} />))
    const item = document.querySelector<HTMLElement>('[role="menuitem"]')!
    act(() => item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(document.querySelector('[role="menu"]')).not.toBeNull()
    act(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })
})
