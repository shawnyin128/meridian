// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LANGUAGE_CHANGE_EVENT, LANGUAGE_STORAGE_KEY,
  initializeLanguage, readLanguagePreference, resolveLocale, setLanguagePreference,
} from './language.js'

describe('语言偏好', () => {
  const setLocale = vi.fn()

  beforeEach(() => {
    window.localStorage.clear()
    setLocale.mockClear()
    Object.defineProperty(window, 'meridian', {
      configurable: true,
      value: { setLocale },
    })
  })

  it('没有存过时跟随系统', () => {
    expect(readLanguagePreference()).toBe('system')
  })

  it('存了非法值时也跟随系统', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr')
    expect(readLanguagePreference()).toBe('system')
  })

  it('读回明确选过的语言', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
    expect(readLanguagePreference()).toBe('en')
  })

  it('写入后广播一次变更事件', () => {
    const seen: string[] = []
    window.addEventListener(LANGUAGE_CHANGE_EVENT, (event) => {
      seen.push((event as CustomEvent<string>).detail)
    })
    setLanguagePreference('en')
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
    expect(seen).toEqual(['en'])
    expect(setLocale).toHaveBeenCalledWith('en')
  })

  it('存储被拒也要广播，本次会话仍然换语言', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const seen: string[] = []
    window.addEventListener(LANGUAGE_CHANGE_EVENT, (event) => {
      seen.push((event as CustomEvent<string>).detail)
    })
    setLanguagePreference('zh')
    expect(seen).toEqual(['zh'])
    expect(setLocale).toHaveBeenCalledWith('zh')
    vi.restoreAllMocks()
  })

  it('启动时把最终语言同步给原生菜单与对话框', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
    expect(initializeLanguage()).toBe('en')
    expect(setLocale).toHaveBeenCalledWith('en')
  })
})

describe('系统语言解析', () => {
  it('明确选择优先于系统语言', () => {
    expect(resolveLocale('zh', ['en-US'])).toBe('zh')
    expect(resolveLocale('en', ['zh-CN'])).toBe('en')
  })

  it('中文各写法都解析成中文', () => {
    expect(resolveLocale('system', ['zh-Hans-CN'])).toBe('zh')
    expect(resolveLocale('system', ['zh-TW'])).toBe('zh')
    expect(resolveLocale('system', ['ZH'])).toBe('zh')
  })

  it('英文解析成英文', () => {
    expect(resolveLocale('system', ['en-GB'])).toBe('en')
  })

  it('既不是中文也不是英文的系统语言给英文', () => {
    expect(resolveLocale('system', ['fr-FR'])).toBe('en')
    expect(resolveLocale('system', ['ja'])).toBe('en')
    expect(resolveLocale('system', [])).toBe('en')
  })

  it('按系统语言的优先顺序取第一个能认出的', () => {
    expect(resolveLocale('system', ['ko-KR', 'zh-CN', 'en-US'])).toBe('zh')
  })
})
