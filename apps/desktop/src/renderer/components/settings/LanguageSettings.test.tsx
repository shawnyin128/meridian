// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { LanguageSettings } from './LanguageSettings.js'

describe('语言设置', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
  let host: HTMLDivElement
  let root: Root

  const mount = () => act(() => {
    root.render(<MessagesProvider><LanguageSettings /></MessagesProvider>)
  })
  const picker = () => host.querySelector<HTMLButtonElement>('button.language-select')!
  const open = () => act(() => {
    picker().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
  })
  const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
  const choose = (label: string) => {
    open()
    const item = items().find((candidate) => candidate.textContent === label)!
    act(() => {
      item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }
  const name = () => picker().getAttribute('aria-label')

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => { act(() => root.unmount()) })

  it('语言用共用的选择器选，不是原生下拉；只列出支持的语言，各按自己的写法显示，没有跟随系统', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    mount()
    expect(host.querySelector('select')).toBeNull()
    expect(host.querySelector('p')).toBeNull()
    open()
    expect(items().map((item) => [item.textContent, item.getAttribute('aria-checked')]))
      .toEqual([['中文', 'true'], ['English', 'false']])
  })

  it('没存过选择时选中当前实际用的语言', () => {
    // jsdom's navigator.languages resolves to English.
    mount()
    expect(picker().textContent).toBe('English')
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull()
  })

  it('选英文后立刻换语言并存下选择', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    mount()
    choose('English')
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
    expect(picker().textContent).toBe('English')
    expect(name()).toBe('Language')
  })

  it('选回中文后界面文字回到中文', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
    mount()
    choose('中文')
    expect(name()).toBe('语言')
  })
})
