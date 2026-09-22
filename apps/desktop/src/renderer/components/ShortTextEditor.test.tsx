// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ShortTextEditor } from './ShortTextEditor.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const withMessages = (node: ReactNode) => <MessagesProvider>{node}</MessagesProvider>

function setValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('ShortTextEditor', () => {
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

  it('trims and submits with Enter, closing only after acceptance', async () => {
    const submit = vi.fn(() => Promise.resolve(true))
    const close = vi.fn()
    act(() => root!.render(withMessages(
      <ShortTextEditor
        title="重命名项目" initialValue="旧名称" placeholder="项目名称"
        onSubmit={submit} onClose={close}
      />,
    )))
    const input = host.querySelector<HTMLInputElement>('input')!
    act(() => setValue(input, '  新名称  '))
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(submit).toHaveBeenCalledWith('新名称')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('keeps the editor open when persistence rejects and Escape closes without resubmitting', async () => {
    const submit = vi.fn(() => Promise.resolve(false))
    const close = vi.fn()
    act(() => root!.render(withMessages(
      <ShortTextEditor
        title="里程碑" initialValue="旧里程碑" placeholder="里程碑内容"
        onSubmit={submit} onClose={close}
      />,
    )))
    const input = host.querySelector<HTMLInputElement>('input')!
    await act(async () => {
      input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(close).not.toHaveBeenCalled()
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(close).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('offers deletion only when the host enables it', () => {
    const remove = vi.fn()
    const close = vi.fn()
    act(() => root!.render(withMessages(
      <ShortTextEditor
        title="里程碑" placeholder="里程碑内容" onSubmit={() => true}
        onClose={close} onDelete={remove}
      />,
    )))
    act(() => host.querySelector<HTMLButtonElement>('.short-text-delete')!.click())
    expect(remove).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('keeps an in-flight draft open when focus or pointer leaves', async () => {
    let finish: ((accepted: boolean) => void) | undefined
    const submit = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve }))
    const close = vi.fn()
    act(() => root!.render(withMessages(
      <ShortTextEditor
        title="里程碑" initialValue="待保存" placeholder="里程碑内容"
        onSubmit={submit} onClose={close}
      />,
    )))
    const input = host.querySelector<HTMLInputElement>('input')!
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    act(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(close).not.toHaveBeenCalled()

    await act(async () => { finish!(false); await Promise.resolve() })
    act(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('keeps an in-flight draft open when Escape is pressed', async () => {
    let finish: ((accepted: boolean) => void) | undefined
    const close = vi.fn()
    act(() => root!.render(withMessages(
      <ShortTextEditor
        title="里程碑" initialValue="待保存" placeholder="里程碑内容"
        onSubmit={() => new Promise<boolean>((resolve) => { finish = resolve })} onClose={close}
      />,
    )))
    const input = host.querySelector<HTMLInputElement>('input')!
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(close).not.toHaveBeenCalled()

    await act(async () => { finish!(false); await Promise.resolve() })
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('does not let an accepted write from an unmounted editor close its replacement', async () => {
    let finish: ((accepted: boolean) => void) | undefined
    const close = vi.fn()
    act(() => root!.render(withMessages(
      <ShortTextEditor
        title="旧编辑器" initialValue="待保存" placeholder="内容"
        onSubmit={() => new Promise<boolean>((resolve) => { finish = resolve })} onClose={close}
      />,
    )))
    act(() => host.querySelector<HTMLInputElement>('input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    act(() => root!.render(withMessages(
      <ShortTextEditor
        key="replacement" title="新编辑器" placeholder="内容"
        onSubmit={() => true} onClose={close}
      />,
    )))
    await act(async () => { finish!(true); await Promise.resolve() })
    expect(close).not.toHaveBeenCalled()
    expect(host.textContent).toContain('新编辑器')
  })
})
