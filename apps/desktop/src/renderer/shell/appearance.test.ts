// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APPEARANCE_STORAGE_KEY,
  initializeAppearance,
  readAppearancePreference,
  setAppearancePreference,
} from './appearance.js'

describe('appearance preference', () => {
  let systemDark = false
  let listeners: Set<() => void>

  beforeEach(() => {
    listeners = new Set()
    systemDark = false
    window.localStorage.clear()
    delete document.documentElement.dataset.theme
    delete document.documentElement.dataset.appearance
    document.documentElement.style.colorScheme = ''
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      get matches() { return systemDark },
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)))
  })

  it('defaults to system and follows later system changes', () => {
    const dispose = initializeAppearance()
    expect(readAppearancePreference()).toBe('system')
    expect(document.documentElement.dataset.appearance).toBe('system')
    expect(document.documentElement.dataset.theme).toBeUndefined()

    systemDark = true
    listeners.forEach((listener) => listener())
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')

    dispose()
    expect(listeners.size).toBe(0)
  })

  it('persists an explicit choice and stops following system mode', () => {
    initializeAppearance()
    setAppearancePreference('light')
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('light')
    expect(document.documentElement.dataset.appearance).toBe('light')

    systemDark = true
    listeners.forEach((listener) => listener())
    expect(document.documentElement.dataset.theme).toBeUndefined()

    setAppearancePreference('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
