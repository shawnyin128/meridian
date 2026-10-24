// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaperReading } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ReadingRemark } from '../components/reader/ReadingRemark.js'
import { useDrafts, type EditDraft } from '../hooks/useDrafts.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const READING: PaperReading = {
  paperId: 'paper-1', highlights: [], notes: [], remark: '原来的随想',
}

/** The remark panel with the drafts the reader rail holds for it. */
function Remark(props: Omit<ComponentProps<typeof ReadingRemark>, 'edits'>) {
  return <ReadingRemark {...props} edits={useDrafts<EditDraft>(['paper', 'p1', 'edits'])} />
}

function setValue(input: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('ReadingRemark', () => {
  const roots: ReturnType<typeof createRoot>[] = []

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('meridian', { platform: 'darwin' })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
  })

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount())
    vi.unstubAllGlobals()
  })

  it('没改过时保存按不动,改过之后存的是去掉首尾空白的整段', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    const onSave = vi.fn(async () => true)
    act(() => root.render(
      <MessagesProvider><Remark reading={READING} saving={false} onSave={onSave} /></MessagesProvider>,
    ))
    const textarea = host.querySelector('textarea')!
    const button = host.querySelector('button')!
    expect(textarea.value).toBe('原来的随想')
    expect(button.disabled).toBe(true)
    act(() => setValue(textarea, '  读完的第一反应  '))
    expect(button.disabled).toBe(false)
    await act(async () => { button.click() })
    expect(onSave).toHaveBeenCalledWith('读完的第一反应')
  })

  it('随笔和表格里的随笔一样按长文本约定保存：⌘回车或「保存」写回，Esc 还原，单按回车只是换行', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    const onSave = vi.fn(async () => true)
    act(() => root.render(
      <MessagesProvider><Remark reading={READING} saving={false} onSave={onSave} /></MessagesProvider>,
    ))
    const textarea = host.querySelector('textarea')!
    const key = (init: KeyboardEventInit) => act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
    })
    expect(host.querySelector('button')!.textContent).toBe('保存')
    act(() => setValue(textarea, '新的随想'))
    key({ key: 'Enter' })
    expect(onSave).not.toHaveBeenCalled()
    key({ key: 'Escape' })
    expect(textarea.value).toBe('原来的随想')
    act(() => setValue(textarea, '新的随想'))
    await act(async () => { key({ key: 'Enter', metaKey: true }) })
    expect(onSave).toHaveBeenCalledWith('新的随想')
  })

  it('输入法选字时按 Esc 只归输入法，随笔的草稿还在；选完字再按 Esc 才还原', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    act(() => root.render(
      <MessagesProvider><Remark reading={READING} saving={false} onSave={vi.fn(async () => true)} /></MessagesProvider>,
    ))
    const textarea = host.querySelector('textarea')!
    const key = (init: KeyboardEventInit) => act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
    })
    act(() => setValue(textarea, '新的随想'))
    key({ key: 'Escape', isComposing: true })
    expect(textarea.value).toBe('新的随想')
    key({ key: 'Escape' })
    expect(textarea.value).toBe('原来的随想')
  })
})
