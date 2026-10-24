// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDrafts } from '../hooks/useDrafts.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { FloatingTextEditor } from './FloatingTextEditor.js'
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

  it('names the value in the boxed field', () => {
    act(() => root!.render(withMessages(
      <ShortTextEditor title="重命名" initialValue="旧名" placeholder="名称" onSubmit={vi.fn()} onClose={vi.fn()} />,
    )))
    expect(host.querySelector('input')!.classList).toContain('form-control-field')
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

  it('leaves Enter and Escape that end an input method composition to the input method', async () => {
    const submit = vi.fn(() => Promise.resolve(true))
    const close = vi.fn()
    act(() => root!.render(withMessages(
      <ShortTextEditor title="重命名项目" placeholder="项目名称" onSubmit={submit} onClose={close} />,
    )))
    const input = host.querySelector<HTMLInputElement>('input')!
    act(() => setValue(input, '新名称'))
    for (const key of ['Enter', 'Escape']) {
      act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key, isComposing: true, bubbles: true })))
    }
    expect(submit).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
    })
    expect(submit).toHaveBeenCalledWith('新名称')
  })

  it('in a FloatingTextEditor, an Escape that ends an input method composition keeps the popover open', () => {
    const close = vi.fn()
    act(() => root!.render(withMessages(
      <FloatingTextEditor
        open anchor={<span />} editorKey="new" title="新里程碑" placeholder="里程碑内容"
        onSubmit={() => true} onClose={close}
      />,
    )))
    const input = document.querySelector<HTMLInputElement>('.short-text-editor input')!
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true })))
    expect(close).not.toHaveBeenCalled()

    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(close).toHaveBeenCalled()
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

  it('saves on an outside press as Enter would; an empty or unchanged draft just closes', async () => {
    const submit = vi.fn(() => Promise.resolve(true))
    const close = vi.fn()
    const pressOutside = async () => {
      await act(async () => {
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
        await Promise.resolve()
      })
    }
    act(() => root!.render(withMessages(
      <ShortTextEditor
        title="重命名项目" initialValue="旧名称" placeholder="项目名称"
        onSubmit={submit} onClose={close}
      />,
    )))
    const input = host.querySelector<HTMLInputElement>('input')!
    await pressOutside()
    act(() => setValue(input, '  '))
    await pressOutside()
    expect(submit).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(2)

    act(() => setValue(input, ' 新名称 '))
    await pressOutside()
    expect(submit).toHaveBeenCalledWith('新名称')
    expect(close).toHaveBeenCalledTimes(3)
  })

  it('keeps a draft refused on leaving open with its text and marks it invalid until the text changes', async () => {
    const submit = vi.fn(() => Promise.resolve(false))
    const close = vi.fn()
    act(() => root!.render(withMessages(
      <ShortTextEditor title="里程碑" placeholder="里程碑内容" onSubmit={submit} onClose={close} />,
    )))
    const input = host.querySelector<HTMLInputElement>('input')!
    act(() => setValue(input, '评审'))
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await Promise.resolve()
    })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(close).not.toHaveBeenCalled()
    expect(input.value).toBe('评审')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    act(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(submit).toHaveBeenCalledTimes(1)

    act(() => setValue(input, '评审会'))
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })

  it('in a FloatingTextEditor, the click ending an outside press does not close a draft refused meanwhile', async () => {
    let settle = (accepted: boolean) => { void accepted }
    const close = vi.fn()
    act(() => root!.render(withMessages(
      <FloatingTextEditor
        open anchor={<span />} editorKey="new" title="新里程碑" placeholder="里程碑内容"
        onSubmit={() => new Promise<boolean>((ok) => { settle = ok })} onClose={close}
      />,
    )))
    // Radix attaches its outside-press listener one task after the popover opens, and dismisses a
    // popover only on the click that ends the press.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    const input = document.querySelector<HTMLInputElement>('.short-text-editor input')!
    act(() => setValue(input, '评审'))
    act(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    await act(async () => { settle(false) })
    act(() => {
      for (const type of ['mousedown', 'pointerup', 'mouseup', 'click']) {
        document.body.dispatchEvent(new MouseEvent(type, { bubbles: true }))
      }
    })
    expect(close).not.toHaveBeenCalled()
    expect(input.value).toBe('评审')
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('in a FloatingTextEditor, focus moving to the popover around the editor does not leave it', async () => {
    const submit = vi.fn(() => true)
    act(() => root!.render(withMessages(
      <FloatingTextEditor
        open anchor={<span />} editorKey="new" title="新里程碑" placeholder="里程碑内容"
        onSubmit={submit} onClose={() => {}}
      />,
    )))
    const input = document.querySelector<HTMLInputElement>('.short-text-editor input')!
    act(() => setValue(input, '评审'))
    const around = input.closest<HTMLElement>('.short-text-editor')!.parentElement!.closest<HTMLElement>('[tabindex="-1"]')!
    act(() => around.focus())
    expect(document.activeElement).toBe(around)
    expect(submit).not.toHaveBeenCalled()
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

  it('keeps typed text as a draft that a closed and reopened editor starts from, until it closes itself', async () => {
    const onClose = vi.fn()
    /** A host that holds the drafts and shows the editor while `open`, closing it without the editor as a period change does. */
    function Host({ open }: { open: boolean }) {
      const drafts = useDrafts<string>(['project', 'p1', 'milestone'])
      return open
        ? <ShortTextEditor title="里程碑" initialValue="原名" placeholder="名称" onSubmit={() => true} onClose={onClose} kept={{ drafts, target: 'm1' }} />
        : null
    }
    const show = (open: boolean) => act(() => root!.render(withMessages(<Host open={open} />)))
    const input = () => host.querySelector('input')!
    show(true)
    expect(input().value).toBe('原名')
    act(() => setValue(input(), '没存的名'))
    show(false)
    show(true)
    expect(input().value).toBe('没存的名')
    act(() => { input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    expect(onClose).toHaveBeenCalledOnce()
    show(false)
    show(true)
    expect(input().value).toBe('原名')
  })
})
