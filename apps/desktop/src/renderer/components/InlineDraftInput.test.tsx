// @vitest-environment jsdom
import { act, useMemo, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InlineDraftInput } from './InlineDraftInput.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

function setValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function Probe({ onSubmit, onCancel }: {
  onSubmit: (value: string) => boolean | Promise<boolean>
  onCancel: () => void
}) {
  const row = useRef<HTMLDivElement>(null)
  const reopen = useRef<HTMLButtonElement>(null)
  const triggers = useMemo(() => [reopen], [])
  return (
    <>
      <div ref={row}>
        <button className="inside">状态</button>
        <InlineDraftInput
          scopeRef={row} triggers={triggers} placeholder="名称"
          onSubmit={onSubmit} onCancel={onCancel}
        />
      </div>
      <button className="reopen" ref={reopen}>新建</button>
      <button className="outside">外部</button>
    </>
  )
}

describe('InlineDraftInput', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  it('normalizes non-empty text and closes only after the host accepts it', async () => {
    const submit = vi.fn(() => Promise.resolve(true))
    const cancel = vi.fn()
    act(() => root!.render(<Probe onSubmit={submit} onCancel={cancel} />))
    const input = host.querySelector<HTMLInputElement>('input')!
    act(() => setValue(input, '  新项目  '))
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
    })
    expect(submit).toHaveBeenCalledWith('新项目')
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('keeps an empty draft open without calling the persistence callback', async () => {
    const submit = vi.fn(() => true)
    const cancel = vi.fn()
    act(() => root!.render(<Probe onSubmit={submit} onCancel={cancel} />))
    const input = host.querySelector<HTMLInputElement>('input')!
    act(() => setValue(input, '   '))
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
    })
    expect(submit).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('treats sibling controls and reopen triggers as inside, but cancels on an unrelated pointer', () => {
    const cancel = vi.fn()
    act(() => root!.render(<Probe onSubmit={() => true} onCancel={cancel} />))
    act(() => host.querySelector<HTMLButtonElement>('.inside')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    act(() => host.querySelector<HTMLButtonElement>('.reopen')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(cancel).not.toHaveBeenCalled()
    act(() => host.querySelector<HTMLButtonElement>('.outside')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
