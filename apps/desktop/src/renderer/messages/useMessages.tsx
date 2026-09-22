import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  LANGUAGE_CHANGE_EVENT, readLanguagePreference, resolveLocale,
  type LanguagePreference, type Locale,
} from '../shell/language.js'
import { catalogFor, type Catalog } from './catalog.js'

const LocaleContext = createContext<Locale | null>(null)

/**
 * Holds the active locale for the whole renderer and re-renders every screen when it changes.
 * It is the only place that reads how the language is stored.
 */
export function MessagesProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<LanguagePreference>(readLanguagePreference)

  useEffect(() => {
    const follow = (event: Event) => {
      setPreference((event as CustomEvent<LanguagePreference>).detail)
    }
    window.addEventListener(LANGUAGE_CHANGE_EVENT, follow)
    return () => window.removeEventListener(LANGUAGE_CHANGE_EVENT, follow)
  }, [])

  const locale = resolveLocale(preference)
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

/** The active locale. Throws outside `MessagesProvider`. */
export function useLocale(): Locale {
  const locale = useContext(LocaleContext)
  if (locale === null) throw new Error('useLocale needs MessagesProvider')
  return locale
}

/** The active message catalog. Throws outside `MessagesProvider`. */
export function useMessages(): Catalog {
  const locale = useLocale()
  return useMemo(() => catalogFor(locale), [locale])
}
