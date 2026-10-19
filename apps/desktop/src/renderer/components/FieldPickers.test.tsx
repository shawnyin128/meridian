// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ChoicePicker, DotsMenu } from './FieldPickers.js'
import { TOOLTIP_DELAY } from './Tooltip.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** Rests the pointer on `target` until the shared tooltip delay has passed; returns the tooltip's text. */
function hoverTip(target: Element): string | null {
  vi.useFakeTimers()
  act(() => { target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
  act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
  vi.useRealTimers()
  return document.querySelector('[role="tooltip"]')?.textContent ?? null
}

describe('DotsMenu', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
  })

  it('shows the name of the object it manages as its tooltip, not a native 更多', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider><DotsMenu label="管理想法：蒸馏预算"><span>归档</span></DotsMenu></MessagesProvider>,
    )
    expect(html).not.toContain('title=')
    expect(html).toContain('aria-label="管理想法：蒸馏预算"')
    expect(html).toContain('class="icbtn sm dots"')

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<MessagesProvider><DotsMenu label="管理想法：蒸馏预算"><span>归档</span></DotsMenu></MessagesProvider>))
    expect(hoverTip(host.querySelector('.dots')!)).toBe('管理想法：蒸馏预算')
    act(() => root.unmount())
  })
})

describe('ChoicePicker', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
  })

  it('marks the current value with the one check mark in the slot before the label, not with bold', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(
      <MessagesProvider><ChoicePicker value="进行中" options={['计划中', '进行中', '已完成']} onPick={() => {}} /></MessagesProvider>,
    ))
    await act(async () => {
      host.querySelector('button')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    })

    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    expect(items.map((item) => item.querySelector('.ck svg') !== null)).toEqual([false, true, false])
    expect(items.map((item) => item.firstElementChild?.classList.contains('ck'))).toEqual([true, true, true])
    expect(items.filter((item) => item.classList.contains('on'))).toEqual([])
    act(() => root.unmount())
  })
})

describe('ChoicePicker', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const LABELS = { openai: 'OpenAI', anthropic: 'Anthropic' } as const

  function Provider({ initial, onPick }: { initial: '' | keyof typeof LABELS; onPick: (value: string) => void }) {
    const [value, setValue] = useState<string>(initial)
    return (
      <ChoicePicker
        appearance="field" aria-label="模型服务" placeholder="选择服务" value={value}
        options={['openai', 'anthropic']} label={(option) => LABELS[option as keyof typeof LABELS]}
        onPick={(next) => { onPick(next); setValue(next) }}
      />
    )
  }

  const trigger = () => host.querySelector<HTMLButtonElement>('button[aria-label="模型服务"]')!
  const open = async () => {
    await act(async () => { trigger().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
  }
  const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]

  it('in a form is the boxed field showing the picked label, never a native select', () => {
    act(() => root.render(<MessagesProvider><Provider initial="anthropic" onPick={vi.fn()} /></MessagesProvider>))
    expect(host.querySelector('select')).toBeNull()
    expect(trigger().classList).toContain('form-control-field')
    expect(trigger().textContent).toBe('Anthropic')
  })

  it('shows the placeholder while nothing is picked, and picking from its menu reports the value', async () => {
    const onPick = vi.fn()
    act(() => root.render(<MessagesProvider><Provider initial="" onPick={onPick} /></MessagesProvider>))
    expect(trigger().textContent).toBe('选择服务')
    await open()
    expect(items().map((item) => [item.textContent, item.getAttribute('aria-checked')]))
      .toEqual([['OpenAI', 'false'], ['Anthropic', 'false']])
    await act(async () => {
      items()[0]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      items()[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onPick).toHaveBeenCalledWith('openai')
    expect(trigger().textContent).toBe('OpenAI')
  })
})
