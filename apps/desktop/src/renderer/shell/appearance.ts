import { BUILT_IN_COLOUR_THEMES, DEFAULT_COLOUR_THEME, deriveColourTokens } from '../../shared/colour-theme.js'
import type { ColourTheme } from '../../shared/contract.js'

export type AppearancePreference = 'light' | 'dark' | 'system'

export const APPEARANCE_STORAGE_KEY = 'meridian.appearance'
export const APPEARANCE_CHANGE_EVENT = 'meridian:appearance-change'
export const COLOUR_THEME_STORAGE_KEY = 'meridian.colour-theme'
export const COLOUR_THEME_CHANGE_EVENT = 'meridian:colour-theme-change'
export const COLOUR_THEME_CACHE_KEY = 'meridian.colour-theme-cache'
const COLOUR_THEME_STYLE = 'meridian-colour-theme'

const PREFER_DARK = '(prefers-color-scheme: dark)'

function isAppearancePreference(value: string | null): value is AppearancePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

/** Reads the device-local appearance preference and safely falls back to the system setting. */
export function readAppearancePreference(): AppearancePreference {
  try {
    const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY)
    return isAppearancePreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

/** Resolves the three-state preference into the two token sets used by the renderer. */
export function resolveAppearance(
  preference: AppearancePreference,
  systemDark = window.matchMedia(PREFER_DARK).matches,
): 'light' | 'dark' {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
}

/** Applies one resolved token set without creating a second theme implementation. */
export function applyAppearance(preference: AppearancePreference): void {
  const resolved = resolveAppearance(preference)
  document.documentElement.dataset.appearance = preference
  if (resolved === 'dark') document.documentElement.dataset.theme = 'dark'
  else delete document.documentElement.dataset.theme
  document.documentElement.style.colorScheme = resolved
}

/** Persists an explicit user choice and applies it immediately. */
export function setAppearancePreference(preference: AppearancePreference): void {
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, preference)
  } catch {
    // A blocked storage backend must not prevent a session-only appearance change.
  }
  applyAppearance(preference)
  window.dispatchEvent(new CustomEvent<AppearancePreference>(APPEARANCE_CHANGE_EVENT, {
    detail: preference,
  }))
}

/** Reads the id of the device-local colour theme; today's palette when none is saved or storage is blocked. */
export function readColourThemePreference(): string {
  try {
    return window.localStorage.getItem(COLOUR_THEME_STORAGE_KEY) ?? DEFAULT_COLOUR_THEME.id
  } catch {
    return DEFAULT_COLOUR_THEME.id
  }
}

/** The custom theme applied last, as applyColourTheme caches it, when it is the one `id` names. */
function cachedColourTheme(id: string): ColourTheme | undefined {
  try {
    const cached = JSON.parse(window.localStorage.getItem(COLOUR_THEME_CACHE_KEY) ?? 'null') as ColourTheme | null
    return cached?.id === id ? cached : undefined
  } catch {
    return undefined
  }
}

/**
 * Applies `theme` in both modes: its derived colour tokens go into one style element above
 * tokens.css, which already holds today's palette, so that palette removes the element.
 * `data-colour-theme` on the root names every theme but today's palette. A custom theme is cached
 * beside the stored choice so the next start can apply it before the first paint; a built-in one
 * drops that cache.
 */
export function applyColourTheme(theme: ColourTheme): void {
  const root = document.documentElement
  document.getElementById(COLOUR_THEME_STYLE)?.remove()
  try {
    if (BUILT_IN_COLOUR_THEMES.some((builtIn) => builtIn.id === theme.id)) window.localStorage.removeItem(COLOUR_THEME_CACHE_KEY)
    else window.localStorage.setItem(COLOUR_THEME_CACHE_KEY, JSON.stringify(theme))
  } catch {
    // A blocked storage backend only costs the next start its early custom theme.
  }
  if (theme.id === DEFAULT_COLOUR_THEME.id) {
    delete root.dataset.colourTheme
    return
  }
  // The doubled :root outranks tokens.css's [data-theme="dark"] block, and the dark rule outranks the light one.
  const rules = (['light', 'dark'] as const).map((mode) => {
    const tokens = Object.entries(deriveColourTokens(theme[mode], mode)).map(([name, value]) => `${name}:${value}`)
    return `${mode === 'dark' ? ':root:root[data-theme="dark"]' : ':root:root'}{${tokens.join(';')}}`
  })
  const style = document.createElement('style')
  style.id = COLOUR_THEME_STYLE
  style.textContent = rules.join('\n')
  document.head.append(style)
  root.dataset.colourTheme = theme.id
}

/** Persists the chosen colour theme, applies it, and announces its id with COLOUR_THEME_CHANGE_EVENT. */
export function setColourThemePreference(theme: ColourTheme): void {
  try {
    window.localStorage.setItem(COLOUR_THEME_STORAGE_KEY, theme.id)
  } catch {
    // A blocked storage backend must not prevent a session-only colour theme change.
  }
  applyColourTheme(theme)
  window.dispatchEvent(new CustomEvent<string>(COLOUR_THEME_CHANGE_EVENT, { detail: theme.id }))
}

/**
 * Applies the saved choices before React renders and keeps system mode synchronized. A saved custom
 * colour theme applies from the cache of the last applied theme; without that cache it shows today's
 * palette, and the cache drops, until the themes folder is read.
 */
export function initializeAppearance(): () => void {
  const media = window.matchMedia(PREFER_DARK)
  const synchronize = () => {
    const preference = readAppearancePreference()
    if (preference === 'system') applyAppearance(preference)
  }
  applyAppearance(readAppearancePreference())
  const chosen = readColourThemePreference()
  applyColourTheme(BUILT_IN_COLOUR_THEMES.find((theme) => theme.id === chosen) ?? cachedColourTheme(chosen) ?? DEFAULT_COLOUR_THEME)
  media.addEventListener('change', synchronize)
  return () => media.removeEventListener('change', synchronize)
}
