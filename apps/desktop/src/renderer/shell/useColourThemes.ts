import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { BUILT_IN_COLOUR_THEMES, DEFAULT_COLOUR_THEME } from '../../shared/colour-theme.js'
import type { ColourTheme, ColourThemeFile } from '../../shared/contract.js'
import { colourThemes } from '../ipc.js'
import { applyColourTheme, readColourThemePreference } from './appearance.js'

/** How often the themes folder is read again, so an edit made outside the App shows. */
const POLL_MS = 2000

/** The custom theme files as last read, null before the first read, and `refresh`, which reads them at once. */
export type ColourThemeFiles = { files: readonly ColourThemeFile[] | null; refresh: () => Promise<void> }
export const ColourThemeFilesContext = createContext<ColourThemeFiles>({ files: null, refresh: () => Promise.resolve() })

/**
 * Reads the custom theme files now and every POLL_MS, and applies the chosen colour theme whenever it
 * is a custom one whose file changed: its file's theme, or today's palette while that file is
 * missing or cannot be used.
 * @returns The latest files, or null before the first read, and the refresh that reads them again.
 */
export function useColourThemeFilesPoll(): ColourThemeFiles {
  const [files, setFiles] = useState<readonly ColourThemeFile[] | null>(null)
  const read = useRef<() => Promise<void>>(() => Promise.resolve())
  useEffect(() => {
    let alive = true
    let applied: string | null = null
    const tick = () => colourThemes.list().then((next) => {
      if (!alive) return
      setFiles((held) => (JSON.stringify(held) === JSON.stringify(next) ? held : next))
      const chosen = readColourThemePreference()
      if (BUILT_IN_COLOUR_THEMES.some((theme) => theme.id === chosen)) return
      const theme = next.flatMap((file) => (file.state === 'readable' && file.theme.id === chosen ? [file.theme] : []))[0]
        ?? DEFAULT_COLOUR_THEME
      if (JSON.stringify(theme) === applied) return
      applyColourTheme(theme)
      applied = JSON.stringify(theme)
    })
    read.current = tick
    void tick()
    const timer = window.setInterval(() => { void tick() }, POLL_MS)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])
  const refresh = useCallback(() => read.current(), [])
  return useMemo(() => ({ files, refresh }), [files, refresh])
}

/** Every colour theme Settings offers: the built-in ones, then the readable custom files' themes. */
export function useColourThemes(): readonly ColourTheme[] {
  const files = useContext(ColourThemeFilesContext).files ?? []
  return [...BUILT_IN_COLOUR_THEMES, ...files.flatMap((file) => (file.state === 'readable' ? [file.theme] : []))]
}

/** The latest custom theme files the shell read, or null before the first read, and the refresh that reads them again. */
export function useColourThemeFiles(): ColourThemeFiles {
  return useContext(ColourThemeFilesContext)
}
