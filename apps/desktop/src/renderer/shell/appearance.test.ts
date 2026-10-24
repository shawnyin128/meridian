// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILT_IN_COLOUR_THEMES, DEFAULT_COLOUR_THEME } from '../../shared/colour-theme.js'
import {
  APPEARANCE_STORAGE_KEY,
  COLOUR_THEME_STORAGE_KEY,
  initializeAppearance,
  readAppearancePreference,
  setAppearancePreference,
  setColourThemePreference,
} from './appearance.js'

/** The rules the applied colour theme added, as `<selector> --content:<value>`. */
const themeRules = (): string[] => [...(document.getElementById('meridian-colour-theme')?.textContent ?? '').split('\n')]
  .filter((rule) => rule !== '').map((rule) => `${rule.slice(0, rule.indexOf('{'))} ${/--content:[^;}]+/.exec(rule)![0]}`)

describe('appearance preference', () => {
  let systemDark = false
  let listeners: Set<() => void>

  beforeEach(() => {
    listeners = new Set()
    systemDark = false
    window.localStorage.clear()
    delete document.documentElement.dataset.theme
    delete document.documentElement.dataset.appearance
    delete document.documentElement.dataset.colourTheme
    document.getElementById('meridian-colour-theme')?.remove()
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

  it('restores the saved colour theme on start with its light and dark tokens, whatever the mode', () => {
    window.localStorage.setItem(COLOUR_THEME_STORAGE_KEY, 'luodian')
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, 'dark')
    initializeAppearance()
    expect(document.documentElement.dataset.colourTheme).toBe('luodian')
    expect(themeRules()).toEqual([':root:root --content:#faf7f3', ':root:root[data-theme="dark"] --content:#151c1f'])

    setAppearancePreference('light')
    expect(document.documentElement.dataset.colourTheme).toBe('luodian')
    expect(themeRules()).toHaveLength(2)
  })

  it('persists a colour theme, and today\'s palette removes its rules so tokens.css alone applies', () => {
    initializeAppearance()
    expect(themeRules()).toEqual([])

    setColourThemePreference(BUILT_IN_COLOUR_THEMES.find((theme) => theme.id === 'xipi')!)
    expect(window.localStorage.getItem(COLOUR_THEME_STORAGE_KEY)).toBe('xipi')
    expect(document.documentElement.dataset.colourTheme).toBe('xipi')
    expect(themeRules()).toEqual([':root:root --content:#fef6ef', ':root:root[data-theme="dark"] --content:#251612'])

    setColourThemePreference(DEFAULT_COLOUR_THEME)
    expect(document.documentElement.dataset.colourTheme).toBeUndefined()
    expect(themeRules()).toEqual([])
  })

  it('shows today\'s palette for a saved theme that is not built in and keeps the saved choice', () => {
    window.localStorage.setItem(COLOUR_THEME_STORAGE_KEY, 'my-theme')
    initializeAppearance()
    expect(document.documentElement.dataset.colourTheme).toBeUndefined()
    expect(themeRules()).toEqual([])
    expect(window.localStorage.getItem(COLOUR_THEME_STORAGE_KEY)).toBe('my-theme')
  })
})
