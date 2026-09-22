export type AppearancePreference = 'light' | 'dark' | 'system'

export const APPEARANCE_STORAGE_KEY = 'meridian.appearance'
export const APPEARANCE_CHANGE_EVENT = 'meridian:appearance-change'

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

/** Applies the saved choice before React renders and keeps system mode synchronized. */
export function initializeAppearance(): () => void {
  const media = window.matchMedia(PREFER_DARK)
  const synchronize = () => {
    const preference = readAppearancePreference()
    if (preference === 'system') applyAppearance(preference)
  }
  applyAppearance(readAppearancePreference())
  media.addEventListener('change', synchronize)
  return () => media.removeEventListener('change', synchronize)
}
