// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commandShortcut } from '../lib/keyboard.js'
import { ActionMenu, MenuItem } from './ActionMenu.js'
import { IconButton } from './IconButton.js'
import { IconCross, IconDots } from './icons.js'
import { TOOLTIP_DELAY, Tooltip, TooltipProvider } from './Tooltip.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('Tooltip', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    vi.useRealTimers()
  })

  const button = (name: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!
  const shown = () => document.querySelector('[role="tooltip"]')?.textContent ?? null
  const hover = (target: Element) => act(() => {
    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }))
  })
  const leave = (target: Element) => {
    act(() => { target.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' })) })
    act(() => { document.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 400, pointerType: 'mouse' })) })
  }
  const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

  it('opens after the shared delay while the pointer rests on the control, naming it', () => {
    act(() => root!.render(<IconButton label="收起详情"><IconCross /></IconButton>))
    hover(button('收起详情'))
    wait(TOOLTIP_DELAY - 1)
    expect(shown()).toBeNull()
    wait(1)
    expect(shown()).toBe('收起详情')
  })

  it('opens at once when the control takes keyboard focus, and not when a click focuses it', () => {
    act(() => root!.render(<IconButton label="收起详情"><IconCross /></IconButton>))
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      button('收起详情').focus()
    })
    expect(shown()).toBeNull()
    act(() => button('收起详情').blur())
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
      button('收起详情').focus()
    })
    expect(shown()).toBe('收起详情')
  })

  it('moves to the next control under the one provider without waiting again', () => {
    act(() => root!.render(
      <TooltipProvider>
        <IconButton label="上个月"><IconCross /></IconButton>
        <IconButton label="下个月"><IconCross /></IconButton>
      </TooltipProvider>,
    ))
    hover(button('上个月'))
    wait(TOOLTIP_DELAY)
    leave(button('上个月'))
    hover(button('下个月'))
    expect(shown()).toBe('下个月')
  })

  it('closes when its control is pressed, also a menu trigger that takes the press for itself', () => {
    act(() => root!.render(
      <ActionMenu trigger={<IconButton label="管理想法：蒸馏预算"><IconDots /></IconButton>}>
        <MenuItem>归档</MenuItem>
      </ActionMenu>,
    ))
    const trigger = button('管理想法：蒸馏预算')
    hover(trigger)
    wait(TOOLTIP_DELAY)
    expect(shown()).toBe('管理想法：蒸馏预算')
    act(() => {
      trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' }))
    })
    expect(document.querySelector('[role="menu"]')).not.toBeNull()
    expect(shown()).toBeNull()
    expect(trigger.getAttribute('data-state')).toBe('open')
  })

  it('shows the shortcut after the name and a note on a line of its own', () => {
    act(() => root!.render(
      <Tooltip label="点击收起" shortcut="⌘B" note="拖动调整宽度"><span tabIndex={0} aria-label="grip" /></Tooltip>,
    ))
    hover(button('grip'))
    wait(TOOLTIP_DELAY)
    const tip = document.querySelector('[role="tooltip"]')!
    expect([tip.querySelector('.tooltip-key')?.textContent, tip.querySelector('.tooltip-note')?.textContent])
      .toEqual(['⌘B', '拖动调整宽度'])
  })
})

describe('commandShortcut', () => {
  it('writes the command key as ⌘ on macOS and as Ctrl elsewhere', () => {
    expect(['darwin', 'win32', 'linux'].map((platform) => commandShortcut(platform, 'B')))
      .toEqual(['⌘B', 'Ctrl+B', 'Ctrl+B'])
  })
})
