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

    const show = (running: boolean, regular: boolean, stopping = false) => act(() => root.render(
      <MessagesProvider>
        <GenerationControl running={running} onStart={start} onStop={stop} regular={regular} stopping={stopping} />
      </MessagesProvider>,
    ))
    show(false, false)
    const button = host.querySelector<HTMLButtonElement>('button')!
    expect(button.getAttribute('aria-label')).toBe('发送')
    act(() => button.click())
    expect(start).toHaveBeenCalledOnce()
    show(true, false)
    expect([host.querySelector('button'), button.getAttribute('aria-label'), button.querySelector('.ring.spin') !== null])
      .toEqual([button, '停止生成', true])
    act(() => button.click())
    expect(stop).toHaveBeenCalledOnce()

    // At regular size it is a Button holding the glyph alone: the same one before and while it runs.
    show(false, true)
    const text = host.querySelector<HTMLButtonElement>('button')!
    expect([text.className, text.getAttribute('aria-label')]).toEqual(['btn generation-control', '发送'])
    show(true, true)
    expect(host.querySelector('button')).toBe(text)
    expect(text.getAttribute('aria-label')).toBe('停止生成')
    expect(text.className).toBe('btn generation-control is-running')
    expect(text.querySelector('.ring.spin')).not.toBeNull()
    expect(text.querySelector('.generation-stop')).not.toBeNull()
    expect(text.textContent).toBe('')
    act(() => text.click())
    expect(stop).toHaveBeenCalledTimes(2)

    // Once a stop is asked for it shows the shared busy state and cannot be pressed again.
    show(true, true, true)
    expect([text.disabled, text.getAttribute('aria-busy'), text.getAttribute('aria-label')]).toEqual([true, 'true', '正在停止'])
    act(() => root.unmount())
  })

  it('disables only the start: a running generation can still be stopped', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const stop = vi.fn()

    act(() => root.render(
      <MessagesProvider><GenerationControl running={false} disabled onStart={vi.fn()} onStop={stop} /></MessagesProvider>,
    ))
    const button = host.querySelector<HTMLButtonElement>('button')!
    expect(button.disabled).toBe(true)

    act(() => root.render(
      <MessagesProvider><GenerationControl running disabled onStart={vi.fn()} onStop={stop} /></MessagesProvider>,
    ))
    expect(button.disabled).toBe(false)
    act(() => button.click())
    expect(stop).toHaveBeenCalledOnce()
    act(() => root.unmount())
  })
})
