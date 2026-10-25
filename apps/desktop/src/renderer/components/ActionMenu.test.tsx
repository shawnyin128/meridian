// @vitest-environment jsdom
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionMenu, MenuItem } from './ActionMenu.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('ActionMenu', () => {
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

  it('provides the shared portal surface while callers supply actions', () => {
    const choose = vi.fn()
    act(() => root!.render(
      <ActionMenu open trigger={<button type="button">更多</button>}>
        <MenuItem onSelect={choose}>重命名</MenuItem>
      </ActionMenu>,
    ))

    const menu = document.querySelector('[role="menu"]')
    expect(menu).not.toBeNull()
    expect(menu?.classList.contains('ctxmenu')).toBe(true)
    act(() => document.querySelector<HTMLElement>('[role="menuitem"]')!.click())
    expect(choose).toHaveBeenCalledTimes(1)
  })

  it('keeps the menu surface under the classes a host adds, and takes the look its surface names', () => {
    const surface = (menu: ReactElement) => {
      act(() => root!.render(menu))
      return document.querySelector('[role="menu"]')!.className
    }
    const trigger = <button type="button">更多</button>
    expect([
      surface(<ActionMenu open trigger={trigger}><MenuItem>重命名</MenuItem></ActionMenu>),
      surface(<ActionMenu open trigger={trigger} contentClassName="choice-picker-menu"><MenuItem>P1</MenuItem></ActionMenu>),
      surface(<ActionMenu open trigger={trigger} surface="editor"><input aria-label="新名称" /></ActionMenu>),
    ]).toEqual(['ctxmenu', 'ctxmenu choice-picker-menu', 'ctxmenu ctxmenu--editor'])
  })

  it('stays open on an Escape that ends an input method composition and closes on the next one', () => {
    const change = vi.fn()
    act(() => root!.render(
      <ActionMenu open onOpenChange={change} trigger={<button type="button">更多</button>}>
        <input aria-label="新名称" />
      </ActionMenu>,
    ))
    const input = document.querySelector<HTMLInputElement>('[role="menu"] input')!
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true })))
    expect(change).not.toHaveBeenCalled()

    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(change).toHaveBeenCalledExactlyOnceWith(false)
  })
})
