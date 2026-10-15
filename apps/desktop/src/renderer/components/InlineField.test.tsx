// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { InlineField, InlineMetadataField } from './InlineField.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const withMessages = (node: ReactNode) => <MessagesProvider>{node}</MessagesProvider>

function setValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = input instanceof window.HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('InlineMetadataField', () => {
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

  it('静息时是整格 hover 按钮，点击后在原位编辑并以回车保存', async () => {
    const save = vi.fn(() => Promise.resolve(true))
    act(() => root!.render(withMessages(<InlineMetadataField label="标题" value="旧标题" onSave={save} />)))
    const field = host.querySelector('.metadata-field')
    const value = host.querySelector<HTMLButtonElement>('.metadata-editable')!
    expect(value.textContent).toBe('旧标题')

    act(() => value.click())
    expect(host.querySelector('.metadata-field')).toBe(field)
    const input = host.querySelector<HTMLTextAreaElement>('[aria-label="编辑标题"]')!
    expect(input.tagName).toBe('TEXTAREA')
    expect(input.classList).toContain('form-control-inline')
    expect(input.selectionStart).toBe(input.selectionEnd)
    act(() => setValue(input, '新标题'))
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledWith('新标题')
    expect(host.querySelector('.metadata-input')).toBeNull()
  })

  it('写入拒绝时保留原位编辑器，Esc 取消且不再次保存', async () => {
    const save = vi.fn(() => Promise.resolve(false))
    act(() => root!.render(withMessages(<InlineMetadataField label="年份" value="2026" onSave={save} />)))
    act(() => host.querySelector<HTMLButtonElement>('.metadata-editable')!.click())
    const input = host.querySelector<HTMLInputElement>('[aria-label="编辑年份"]')!
    act(() => setValue(input, '2027'))
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
    })
    expect(host.querySelector('.metadata-input')).not.toBeNull()

    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('.metadata-input')).toBeNull()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('改了值点到别处，像回车一样保存并收起；没改就离开只收起，不写', async () => {
    const save = vi.fn(() => Promise.resolve(true))
    act(() => root!.render(withMessages(<InlineMetadataField label="标题" value="旧标题" onSave={save} />)))
    act(() => host.querySelector<HTMLButtonElement>('.metadata-editable')!.click())
    act(() => setValue(host.querySelector<HTMLTextAreaElement>('[aria-label="编辑标题"]')!, '新标题'))
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledWith('新标题')
    expect(host.querySelector('.metadata-input')).toBeNull()

    act(() => host.querySelector<HTMLButtonElement>('.metadata-editable')!.click())
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(host.querySelector('.metadata-input')).toBeNull()
  })

  it('离开时写入被拒，编辑器带着新值留在原位并标红；Esc 收起后再打开不再标红', async () => {
    const save = vi.fn(() => Promise.resolve(false))
    act(() => root!.render(withMessages(<InlineMetadataField label="年份" value="2026" onSave={save} />)))
    act(() => host.querySelector<HTMLButtonElement>('.metadata-editable')!.click())
    const input = host.querySelector<HTMLInputElement>('[aria-label="编辑年份"]')!
    act(() => setValue(input, '2027'))
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledWith('2027')
    expect(host.querySelector('[aria-label="编辑年份"]')).toBe(input)
    expect(input.value).toBe('2027')
    expect(input.getAttribute('aria-invalid')).toBe('true')

    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    act(() => host.querySelector<HTMLButtonElement>('.metadata-editable')!.click())
    expect(host.querySelector('[aria-label="编辑年份"]')!.getAttribute('aria-invalid')).toBeNull()
  })

  it('同一编辑器可通过样式和校验参数服务列表名称格', async () => {
    const save = vi.fn(() => Promise.resolve(true))
    act(() => root!.render(withMessages(
      <InlineField
        label="任务名称" value="旧任务" wrapperClassName="plan-name-cell"
        buttonClassName="plan-name" inputClassName="plan-name-input"
        normalize={(value) => value.trim()} validate={(value) => value !== ''} onSave={save}
      />,
    )))
    act(() => host.querySelector<HTMLButtonElement>('.plan-name')!.click())
    const input = host.querySelector<HTMLInputElement>('.plan-name-input')!
    act(() => setValue(input, '  新任务  '))
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledWith('新任务')
  })

})
