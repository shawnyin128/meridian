// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commitKeys } from './keyboard.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('commitKeys', () => {
  let root: Root
  let host: HTMLDivElement
  /** Keys that left the field for the element around it. */
  let passed: string[]

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    passed = []
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  /** Renders a field, a textarea when `multiline`, with the keys of `options` on `platform`, and returns a key press on it. */
  const field = (platform: string, options: Parameters<typeof commitKeys>[0]) => {
    vi.stubGlobal('meridian', { platform })
    act(() => root.render(
      <div onKeyDown={(event) => passed.push(event.key)}>
        {options.multiline === true
          ? <textarea onKeyDown={commitKeys(options)} />
          : <input onKeyDown={commitKeys(options)} />}
      </div>,
    ))
    const target = host.querySelector('input, textarea')!
    return (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
      act(() => { target.dispatchEvent(event) })
      return { prevented: event.defaultPrevented }
    }
  }

  it('saves a one-line field on Enter, and keeps the Enter from submitting anything else', () => {
    const onSave = vi.fn()
    const press = field('darwin', { onSave })
    expect(press({ key: 'Enter' })).toEqual({ prevented: true })
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('saves a multi-line field on ⌘Enter on macOS and on Ctrl+Enter elsewhere; a plain Enter starts a new line', () => {
    const mac = vi.fn()
    const pressMac = field('darwin', { multiline: true, onSave: mac })
    expect(pressMac({ key: 'Enter' })).toEqual({ prevented: false })
    pressMac({ key: 'Enter', ctrlKey: true })
    expect(mac).not.toHaveBeenCalled()
    expect(pressMac({ key: 'Enter', metaKey: true })).toEqual({ prevented: true })
    expect(mac).toHaveBeenCalledOnce()

    const windows = vi.fn()
    const pressWindows = field('win32', { multiline: true, onSave: windows })
    pressWindows({ key: 'Enter', metaKey: true })
    expect(windows).not.toHaveBeenCalled()
    pressWindows({ key: 'Enter', ctrlKey: true })
    expect(windows).toHaveBeenCalledOnce()
  })

  it('cancels on Escape, which then goes no further; without a cancel, Escape passes on to what holds the field', () => {
    const onCancel = vi.fn()
    field('darwin', { onCancel })({ key: 'Escape' })
    expect([onCancel.mock.calls.length, passed]).toEqual([1, []])

    field('darwin', { onSave: vi.fn() })({ key: 'Escape' })
    expect(passed).toEqual(['Escape'])
  })

  it('leaves the keys of an input method composition to it: they neither save nor cancel, and its Escape goes no further', () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    const press = field('darwin', { onSave, onCancel })
    expect(press({ key: 'Enter', isComposing: true })).toEqual({ prevented: false })
    press({ key: 'Escape', isComposing: true })
    expect([onSave, onCancel].map((call) => call.mock.calls.length)).toEqual([0, 0])
    expect(passed).toEqual(['Enter'])
  })

  it('lets every other key pass to the field and on', () => {
    const onSave = vi.fn()
    const press = field('darwin', { onSave, onCancel: vi.fn() })
    expect(press({ key: 'a' })).toEqual({ prevented: false })
    expect([onSave.mock.calls.length, passed]).toEqual([0, ['a']])
  })
})
