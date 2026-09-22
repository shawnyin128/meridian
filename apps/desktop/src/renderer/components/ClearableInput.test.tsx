// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ClearableInput } from './ClearableInput.js'

describe('ClearableInput', () => {
  it('shows one trailing action only for non-empty input and restores input focus after clearing', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const clear = vi.fn()

    act(() => root.render(
      <MessagesProvider><ClearableInput value="paper" onClear={clear} aria-label="Search" /></MessagesProvider>,
    ))
    const input = host.querySelector<HTMLInputElement>('input')!
    const action = host.querySelector<HTMLButtonElement>('[aria-label="清除输入"]')!
    act(() => action.click())

    expect(clear).toHaveBeenCalledOnce()
    expect(input.classList).toContain('form-input')
    expect(document.activeElement).toBe(input)
    act(() => root.render(
      <MessagesProvider><ClearableInput value="" onClear={clear} aria-label="Search" /></MessagesProvider>,
    ))
    expect(host.querySelector('[aria-label="清除输入"]')).toBeNull()
    act(() => root.unmount())
  })
})
