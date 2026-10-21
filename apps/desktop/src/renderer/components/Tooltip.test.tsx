// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commandShortcut } from '../lib/keyboard.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { ActionMenu, MenuItem } from './ActionMenu.js'
import { IconButton } from './IconButton.js'
import { IconCross, IconDots } from './icons.js'
import { ModalDialog } from './ModalDialog.js'
import { Toolbar } from './Toolbar.js'
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
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: document.body }))
      target.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
    })
    act(() => { document.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 400, pointerType: 'mouse' })) })
  }
  const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
  /**
   * Presses `key` on the focused element and lets go of it at once, as a quick key press does; `moves`
   * stands in for the focus move the browser itself makes on Tab and Shift+Tab.
   */
  const press = (key: string, { shiftKey = false, moves }: { shiftKey?: boolean; moves?: HTMLElement } = {}) => {
    act(() => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))
      moves?.focus()
      document.activeElement!.dispatchEvent(new KeyboardEvent('keyup', { key, shiftKey, bubbles: true }))
    })
    wait(0)
  }

  it('opens after the shared delay while the pointer rests on the control, naming it', () => {
    act(() => root!.render(<IconButton label="收起详情"><IconCross /></IconButton>))
    hover(button('收起详情'))
    wait(TOOLTIP_DELAY - 1)
    expect(shown()).toBeNull()
    wait(1)
    expect(shown()).toBe('收起详情')
  })

  describe('on focus', () => {
    // Chromium matches :focus-visible on every focus after a key press, also on focus a script moves,
    // and on no button after a pointer press; jsdom's own rule differs.
    let keyed = false
    const key = () => { keyed = true }
    const pointer = () => { keyed = false }

    beforeEach(() => {
      keyed = false
      document.addEventListener('keydown', key, true)
      document.addEventListener('pointerdown', pointer, true)
      document.addEventListener('mousedown', pointer, true)
      const matches = Element.prototype.matches
      vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
        return selector === ':focus-visible' ? keyed && this === document.activeElement : matches.call(this, selector)
      })
      vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    })

    afterEach(() => {
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('mousedown', pointer, true)
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    })

    it('opens at once when Tab or Shift+Tab moves focus onto the control, and not when a click focuses it', () => {
      act(() => root!.render(
        <TooltipProvider>
          <IconButton label="上个月"><IconCross /></IconButton>
          <IconButton label="下个月"><IconCross /></IconButton>
        </TooltipProvider>,
      ))
      act(() => {
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        button('上个月').focus()
      })
      expect(shown()).toBeNull()
      act(() => button('上个月').blur())
      press('Tab', { moves: button('上个月') })
      expect(shown()).toBe('上个月')
      press('Tab', { moves: button('下个月') })
      expect(shown()).toBe('下个月')
      press('Tab', { shiftKey: true, moves: button('上个月') })
      expect(shown()).toBe('上个月')
    })

    it('opens at once when an arrow key, Home or End moves focus onto a control of a toolbar', () => {
      act(() => root!.render(
        <Toolbar label="月份">
          <div className="months">
            <IconButton label="上个月"><IconCross /></IconButton>
            <IconButton label="本月"><IconCross /></IconButton>
            <IconButton label="下个月"><IconCross /></IconButton>
          </div>
        </Toolbar>,
      ))
      press('Tab', { moves: host.querySelector<HTMLElement>('.months')! })
      expect(shown()).toBe('上个月')
      press('ArrowRight')
      expect([document.activeElement, shown()]).toEqual([button('本月'), '本月'])
      press('End')
      expect([document.activeElement, shown()]).toEqual([button('下个月'), '下个月'])
      press('Home')
      expect([document.activeElement, shown()]).toEqual([button('上个月'), '上个月'])
    })

    it('stays closed when a script focuses the control after a key that moves no focus, as Escape', () => {
      act(() => root!.render(<IconButton label="收起详情"><IconCross /></IconButton>))
      press('Escape')
      act(() => button('收起详情').focus())
      expect([document.activeElement, shown()]).toEqual([button('收起详情'), null])
    })

    it('stays closed on the trigger a clicked menu returns focus to when Escape closes it', () => {
      act(() => root!.render(
        <ActionMenu trigger={<IconButton label="分组"><IconDots /></IconButton>}>
          <MenuItem>按状态</MenuItem>
        </ActionMenu>,
      ))
      const trigger = button('分组')
      act(() => {
        trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' }))
        trigger.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse' }))
      })
      expect(document.querySelector('[role="menu"]')).not.toBeNull()
      press('Escape')
      expect([document.querySelector('[role="menu"]'), document.activeElement, shown()]).toEqual([null, trigger, null])
    })

    it('stays closed on the close control a closable dialog focuses as it opens, also right after a Tab', () => {
      const settings = (open: boolean) => (
        <MessagesProvider>
          <button type="button" aria-label="论文">论文</button>
          <ModalDialog open={open} onOpenChange={() => undefined} size="wide" title="设置" closable>外观</ModalDialog>
        </MessagesProvider>
      )
      act(() => root!.render(settings(false)))
      press('Tab', { moves: button('论文') })
      act(() => root!.render(settings(true)))
      expect([document.activeElement, shown()]).toEqual([document.querySelector('.modal-close'), null])
    })
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

  it('names text cut off by its box with the whole text, and stays closed while the text fits', () => {
    act(() => root!.render(
      <Tooltip label="跑 Llama-2-7B 的 2bit KV 基线" whenClipped>
        <span tabIndex={0} aria-label="label" style={{ overflowX: 'hidden' }}>跑 Llama-2-7B 的 2bit KV 基线</span>
      </Tooltip>,
    ))
    const label = button('label')
    const fits = vi.spyOn(label, 'scrollWidth', 'get').mockReturnValue(120)
    vi.spyOn(label, 'clientWidth', 'get').mockReturnValue(120)
    hover(label)
    wait(TOOLTIP_DELAY)
    expect(shown()).toBeNull()
    leave(label)
    fits.mockReturnValue(180)
    hover(label)
    wait(TOOLTIP_DELAY)
    expect(shown()).toBe('跑 Llama-2-7B 的 2bit KV 基线')
  })

  it('without a label leaves its element as it is', () => {
    act(() => root!.render(<Tooltip label={undefined}><span id="plain">EAGLE</span></Tooltip>))
    expect(host.innerHTML).toBe('<span id="plain">EAGLE</span>')
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

  it('puts Shift before ⌘ on macOS, as its menus do, and after Ctrl elsewhere', () => {
    expect(['darwin', 'win32', 'linux'].map((platform) => commandShortcut(platform, 'P', true)))
      .toEqual(['⇧⌘P', 'Ctrl+Shift+P', 'Ctrl+Shift+P'])
  })
})
