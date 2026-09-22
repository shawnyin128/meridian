// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { LanguageSettings } from './LanguageSettings.js'

describe('语言设置', () => {
  let host: HTMLDivElement
  let root: Root

  const mount = () => act(() => {
    root.render(<MessagesProvider><LanguageSettings /></MessagesProvider>)
  })
  const select = () => host.querySelector<HTMLSelectElement>('select.language-select')!
  const choose = (value: string) => act(() => {
    select().value = value
    select().dispatchEvent(new Event('change', { bubbles: true }))
  })
  const note = () => host.querySelector('.language-note')!.textContent

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => { act(() => root.unmount()) })

  it('下拉里只列出支持的语言，各按自己的写法显示，没有跟随系统', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    mount()
    expect([...select().options].map((option) => [option.value, option.textContent]))
      .toEqual([['zh', '中文'], ['en', 'English']])
  })

  it('没存过选择时选中当前实际用的语言', () => {
    // jsdom's navigator.languages resolves to English.
    mount()
    expect(select().value).toBe('en')
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull()
  })

  it('选英文后立刻换语言并存下选择', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    mount()
    choose('en')
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
    expect(select().value).toBe('en')
    expect(note()).toContain('only affects the interface')
  })

  it('选回中文后界面文字回到中文', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
    mount()
    choose('zh')
    expect(note()).toContain('只影响界面文字')
  })
})
