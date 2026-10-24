// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { commitsMultiline } from '../lib/keyboard.js'
import { EditActions } from './EditActions.js'

describe('EditActions', () => {
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

  const handlers = { onEdit: vi.fn(), onCancel: vi.fn(), onSave: vi.fn() }
  const show = (props: { editing: boolean; saving?: boolean; canSave?: boolean }) => act(() => root.render(
    <MessagesProvider><EditActions {...props} {...handlers} /></MessagesProvider>,
  ))
  const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('button')]

  it('offers 编辑 at rest, then 取消 and 保存 in the same place while editing', () => {
    show({ editing: false })
    expect(buttons().map((button) => button.textContent)).toEqual(['编辑'])
    act(() => buttons()[0]!.click())
    expect(handlers.onEdit).toHaveBeenCalledOnce()
    show({ editing: true })
    expect(buttons().map((button) => button.textContent)).toEqual(['取消', '保存'])
    act(() => buttons()[0]!.click())
    act(() => buttons()[1]!.click())
    expect(handlers.onCancel).toHaveBeenCalledOnce()
    expect(handlers.onSave).toHaveBeenCalledOnce()
  })

  it('holds both while a save is in flight, and 保存 while the draft cannot be saved', () => {
    show({ editing: true, saving: true })
    expect(buttons().map((button) => button.disabled)).toEqual([true, true])
    show({ editing: true, canSave: false })
    expect(buttons().map((button) => button.disabled)).toEqual([false, true])
  })
})

describe('commitsMultiline', () => {
  const key = (init: Partial<KeyboardEvent>) => ({ key: 'Enter', metaKey: false, ctrlKey: false, isComposing: false, ...init })

  it('commits a multi-line text on ⌘Enter on macOS and Ctrl+Enter elsewhere, while a plain Enter starts a new line', () => {
    expect(commitsMultiline('darwin', key({ metaKey: true }))).toBe(true)
    expect(commitsMultiline('darwin', key({ ctrlKey: true }))).toBe(false)
    expect(commitsMultiline('win32', key({ ctrlKey: true }))).toBe(true)
    expect(commitsMultiline('win32', key({ metaKey: true }))).toBe(false)
    expect(commitsMultiline('darwin', key({}))).toBe(false)
    expect(commitsMultiline('darwin', key({ key: 'a', metaKey: true }))).toBe(false)
  })

  it('leaves the keys of an input method composition to the input method', () => {
    expect(commitsMultiline('darwin', key({ metaKey: true, isComposing: true }))).toBe(false)
  })
})
