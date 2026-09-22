/** The two languages the app ships copy for. */
export type Locale = 'zh' | 'en'

/** What the user picked; `system` defers to the operating system's languages. */
export type LanguagePreference = Locale | 'system'

export const LANGUAGE_STORAGE_KEY = 'meridian.language'
export const LANGUAGE_CHANGE_EVENT = 'meridian:language-change'

/** Keep native menus and dialogs in the same language as the renderer. */
function announceLocale(locale: Locale): void {
  window.meridian?.setLocale?.(locale)
}

function isLanguagePreference(value: string | null): value is LanguagePreference {
  return value === 'zh' || value === 'en' || value === 'system'
}

/** Reads the device-local language preference and safely falls back to the system setting. */
export function readLanguagePreference(): LanguagePreference {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return isLanguagePreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

/**
 * Resolves the three-state preference into one shipped locale. Under `system`, the first of
 * `languages` whose primary subtag is `zh` or `en` wins; any other locale gets English.
 */
export function resolveLocale(
  preference: LanguagePreference,
  languages: readonly string[] = navigator.languages,
): Locale {
  if (preference !== 'system') return preference
  for (const tag of languages) {
    const primary = tag.toLowerCase().split('-')[0]
    if (primary === 'zh') return 'zh'
    if (primary === 'en') return 'en'
  }
  return 'en'
}

/** Persists an explicit user choice and announces it so the renderer and Main can follow. */
export function setLanguagePreference(preference: LanguagePreference): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, preference)
  } catch {
    // A blocked storage backend must not prevent a session-only language change.
  }
  const locale = resolveLocale(preference)
  document.documentElement.lang = locale
  announceLocale(locale)
  window.dispatchEvent(new CustomEvent<LanguagePreference>(LANGUAGE_CHANGE_EVENT, {
    detail: preference,
  }))
}

/** Applies the saved choice to the document before React renders and returns the resolved locale. */
export function initializeLanguage(): Locale {
  const locale = resolveLocale(readLanguagePreference())
  document.documentElement.lang = locale
  announceLocale(locale)
  return locale
}
