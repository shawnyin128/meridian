import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  BUILT_IN_COLOUR_THEMES, DEFAULT_COLOUR_THEME, colourFollowing, type ColourMode, type ColourModule,
} from '../../../shared/colour-theme.js'
import type { ColourTheme } from '../../../shared/contract.js'
import type { Catalog } from '../../messages/catalog.js'
import { useMessages } from '../../messages/useMessages.js'
import {
  APPEARANCE_CHANGE_EVENT,
  COLOUR_THEME_CHANGE_EVENT,
  readAppearancePreference,
  readColourThemePreference,
  setAppearancePreference,
  setColourThemePreference,
  type AppearancePreference,
} from '../../shell/appearance.js'
import { useColourThemeFiles, useColourThemes } from '../../shell/useColourThemes.js'
import { Card } from '../Card.js'
import { FadeText } from '../FadeText.js'
import { Tag } from '../Tag.js'

const OPTIONS: readonly AppearancePreference[] = ['light', 'dark', 'system']
const OPTION_LABEL: Record<AppearancePreference, 'light' | 'dark' | 'system'> = {
  light: 'light',
  dark: 'dark',
  system: 'system',
}

type PreviewPart = '--ap-window' | '--ap-sidebar' | '--ap-content' | '--ap-field' | '--ap-line' | '--ap-accent' | '--ap-ink'

/** Each part of a preview in the default theme, and the module it moves with in another theme. */
const PREVIEW: Record<ColourMode, Record<PreviewPart, [ColourModule, string]>> = {
  light: {
    '--ap-window': ['sidebar', '#f8f8f8'], '--ap-sidebar': ['sidebar', '#eeeeee'], '--ap-content': ['card', '#ffffff'],
    '--ap-field': ['field', '#e8e8e8'], '--ap-line': ['separator', '#d2d2d2'], '--ap-accent': ['accent', '#3568ff'],
    '--ap-ink': ['ink', '#111111'],
  },
  dark: {
    '--ap-window': ['sidebar', '#07111f'], '--ap-sidebar': ['ground', '#0d1b2d'], '--ap-content': ['card', '#12213a'],
    '--ap-field': ['field', '#16263f'], '--ap-line': ['separator', '#394a62'], '--ap-accent': ['accent', '#558cff'],
    '--ap-ink': ['ink', '#f5f7fb'],
  },
}

function Preview({ tone, theme }: { tone: ColourMode; theme: ColourTheme }) {
  const style = Object.fromEntries(Object.entries(PREVIEW[tone])
    .map(([part, [module, target]]) => [part, colourFollowing(theme[tone], tone, module, target)])) as CSSProperties
  return (
    <span className={`appearance-mini ${tone}`} style={style} aria-hidden="true">
      <span className="appearance-mini-bar"><i /><i /><i /></span>
      <span className="appearance-mini-body">
        <span className="appearance-mini-side"><i /><i /><i /></span>
        <span className="appearance-mini-content"><i /><i /><i /></span>
      </span>
    </span>
  )
}

function AppearancePreview({ preference, theme }: { preference: AppearancePreference; theme: ColourTheme }) {
  return preference === 'system'
    ? (
      <span className="appearance-preview system" aria-hidden="true">
        <Preview tone="light" theme={theme} />
        <Preview tone="dark" theme={theme} />
      </span>
    )
    : <span className="appearance-preview" aria-hidden="true"><Preview tone={preference} theme={theme} /></span>
}

/** The chosen colour theme among `themes`, kept current while Settings is open; today's palette when it is not among them. */
function useColourTheme(themes: readonly ColourTheme[]): ColourTheme {
  const [chosen, setChosen] = useState(readColourThemePreference)
  useEffect(() => {
    const synchronize = (event: Event) => setChosen((event as CustomEvent<string>).detail)
    window.addEventListener(COLOUR_THEME_CHANGE_EVENT, synchronize)
    return () => window.removeEventListener(COLOUR_THEME_CHANGE_EVENT, synchronize)
  }, [])
  return themes.find((theme) => theme.id === chosen) ?? DEFAULT_COLOUR_THEME
}

/** Device-local appearance selector; it changes only renderer tokens and never touches library data. */
export function AppearanceSettings() {
  const m = useMessages()
  const [preference, setPreference] = useState<AppearancePreference>(readAppearancePreference)
  const theme = useColourTheme(useColourThemes())

  useEffect(() => {
    const synchronize = (event: Event) => {
      const changed = event as CustomEvent<AppearancePreference>
      setPreference(changed.detail)
    }
    window.addEventListener(APPEARANCE_CHANGE_EVENT, synchronize)
    return () => window.removeEventListener(APPEARANCE_CHANGE_EVENT, synchronize)
  }, [])

  return (
    <Card className="appearance-settings-card">
      <div className="appearance-options" role="radiogroup" aria-label={m.settings.appearance.group}>
        {OPTIONS.map((option) => (
          <button
            type="button" role="radio" aria-checked={preference === option}
            className="appearance-choice" data-appearance={option} key={option}
            onClick={() => setAppearancePreference(option)}
          >
            <AppearancePreview preference={option} theme={theme} />
            <span className="appearance-label">{m.settings.appearance[OPTION_LABEL[option]]}</span>
          </button>
        ))}
      </div>
    </Card>
  )
}

type BuiltInName = keyof Catalog['settings']['appearance']['themes']

/**
 * Device-local colour theme selector: the built-in themes, then the custom theme files, each
 * previewed in light and dark; a file that cannot be used shows its reason. It changes only
 * renderer tokens.
 */
export function ColourThemeSettings() {
  const m = useMessages()
  const themes = useColourThemes()
  const chosen = useColourTheme(themes)
  const unusable = (useColourThemeFiles() ?? []).flatMap((file) => (file.state === 'unreadable' ? [file] : []))
  const name = (theme: ColourTheme) => (BUILT_IN_COLOUR_THEMES.includes(theme)
    ? m.settings.appearance.themes[theme.id as BuiltInName]
    : theme.name)

  return (
    <Card className="appearance-settings-card">
      <div className="appearance-options" role="radiogroup" aria-label={m.settings.appearance.themeHeading}>
        {themes.map((theme) => (
          <button
            type="button" role="radio" aria-checked={chosen.id === theme.id}
            className="appearance-choice" data-colour-theme={theme.id} key={theme.id}
            onClick={() => setColourThemePreference(theme)}
          >
            <span className="appearance-preview pair" aria-hidden="true">
              <Preview tone="light" theme={theme} />
              <Preview tone="dark" theme={theme} />
            </span>
            <FadeText className="appearance-label" label={name(theme)}>{name(theme)}</FadeText>
          </button>
        ))}
        {unusable.map((file) => (
          <span className="appearance-problem" data-colour-theme-file={file.file} key={file.file}>
            <span className="appearance-preview problem">
              <Tag tone="bad">
                {file.path === undefined
                  ? m.settings.appearance.themeProblems[file.reason]
                  : m.settings.appearance.themeProblemAt(m.settings.appearance.themeProblems[file.reason], file.path)}
              </Tag>
            </span>
            <FadeText className="appearance-label" label={file.file}>{file.file}</FadeText>
          </span>
        ))}
      </div>
    </Card>
  )
}
