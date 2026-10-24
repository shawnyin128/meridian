import { createContext, useContext, useEffect, useState } from 'react'
import { BUILT_IN_COLOUR_THEMES, DEFAULT_COLOUR_THEME } from '../../shared/colour-theme.js'
import type { ColourTheme, ColourThemeFile } from '../../shared/contract.js'
import { colourThemes } from '../ipc.js'
import { applyColourTheme, readColourThemePreference } from './appearance.js'

/** How often the themes folder is read again, so an edit made outside the App shows. */
const POLL_MS = 2000
export const ColourThemeFilesContext = createContext<readonly ColourThemeFile[] | null>(null)

/**
 * Reads the custom theme files now and every POLL_MS, and applies the chosen colour theme whenever it
 * is a custom one whose file changed: its file's theme, or today's palette while that file is
 * missing or cannot be used.
 * @returns The latest files, or null before the first read.
 */
export function useColourThemeFilesPoll(): readonly ColourThemeFile[] | null {
  const [files, setFiles] = useState<readonly ColourThemeFile[] | null>(null)
  useEffect(() => {
    let alive = true
    let applied: string | null = null
    const tick = () => {
      void colourThemes.list().then((next) => {
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
    }
    tick()
    const timer = window.setInterval(tick, POLL_MS)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])
  return files
}

/** Every colour theme Settings offers: the built-in ones, then the readable custom files' themes. */
export function useColourThemes(): readonly ColourTheme[] {
  const files = useContext(ColourThemeFilesContext) ?? []
  return [...BUILT_IN_COLOUR_THEMES, ...files.flatMap((file) => (file.state === 'readable' ? [file.theme] : []))]
}

/** The latest custom theme files the shell read, or null before the first read. */
export function useColourThemeFiles(): readonly ColourThemeFile[] | null {
  return useContext(ColourThemeFilesContext)
}
