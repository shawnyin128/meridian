// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { GenerationControl } from './GenerationControl.js'

describe('GenerationControl', () => {
  it('uses the send action while idle and the same button as a stop action while running', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const start = vi.fn()
    const stop = vi.fn()

    act(() => root.render(
      <MessagesProvider><GenerationControl running={false} onStart={start} onStop={stop} /></MessagesProvider>,
    ))
    const button = host.querySelector<HTMLButtonElement>('button')!
    expect(button.getAttribute('aria-label')).toBe('发送')
    act(() => button.click())
    expect(start).toHaveBeenCalledOnce()

    act(() => root.render(
      <MessagesProvider>
        <GenerationControl running onStart={start} onStop={stop} showStatusText />
      </MessagesProvider>,
    ))
    expect(button.getAttribute('aria-label')).toBe('正在生成，点击停止')
    expect(button.querySelector('.generation-spinner')).not.toBeNull()
    expect(button.querySelector('.generation-stop')).not.toBeNull()
    expect(button.textContent).toContain('正在生成')
    expect(button.textContent).toContain('停止生成')
    act(() => button.click())
    expect(stop).toHaveBeenCalledOnce()
    act(() => root.unmount())
  })
})
