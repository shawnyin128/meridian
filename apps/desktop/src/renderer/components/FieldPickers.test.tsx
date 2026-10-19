// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ChoicePicker, DotsMenu } from './FieldPickers.js'

describe('DotsMenu', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('always names itself 更多 and takes an extra accessible name', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider><DotsMenu label="管理想法：蒸馏预算"><span>归档</span></DotsMenu></MessagesProvider>,
    )
    expect(html).toContain('title="更多"')
    expect(html).toContain('aria-label="管理想法：蒸馏预算"')
    expect(html).toContain('class="dots"')
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
