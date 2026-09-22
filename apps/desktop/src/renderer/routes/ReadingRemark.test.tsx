// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaperReading } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ReadingRemark } from '../components/reader/ReadingRemark.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const READING: PaperReading = {
  paperId: 'paper-1', highlights: [], notes: [], remark: '原来的随想',
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
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
  })

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount())
  })

  it('没改过时存随笔按不动,改过之后存的是去掉首尾空白的整段', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    const onSave = vi.fn(async () => true)
    act(() => root.render(
      <MessagesProvider><ReadingRemark reading={READING} saving={false} onSave={onSave} /></MessagesProvider>,
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
})
