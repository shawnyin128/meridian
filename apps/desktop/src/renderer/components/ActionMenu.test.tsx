// @vitest-environment jsdom
import { act } from 'react'
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
})
