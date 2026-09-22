import { useEffect, useState } from 'react'
import type { Catalog } from '../../messages/catalog.js'
import { useMessages } from '../../messages/useMessages.js'
import {
  APPEARANCE_CHANGE_EVENT,
  readAppearancePreference,
  setAppearancePreference,
  type AppearancePreference,
} from '../../shell/appearance.js'

const OPTIONS: readonly AppearancePreference[] = ['light', 'dark', 'system']
const OPTION_LABEL: Record<AppearancePreference, keyof Catalog['settings']['appearance']> = {
  light: 'light',
  dark: 'dark',
  system: 'system',
}

function Preview({ tone }: { tone: 'light' | 'dark' }) {
  return (
    <span className={`appearance-mini ${tone}`} aria-hidden="true">
      <span className="appearance-mini-bar"><i /><i /><i /></span>
      <span className="appearance-mini-body">
        <span className="appearance-mini-side"><i /><i /><i /></span>
        <span className="appearance-mini-content"><i /><i /><i /></span>
      </span>
    </span>
  )
}

function AppearancePreview({ preference }: { preference: AppearancePreference }) {
  return preference === 'system'
    ? (
      <span className="appearance-preview system" aria-hidden="true">
        <Preview tone="light" />
        <Preview tone="dark" />
      </span>
    )
    : <span className="appearance-preview" aria-hidden="true"><Preview tone={preference} /></span>
}

/** Device-local appearance selector; it changes only renderer tokens and never touches library data. */
export function AppearanceSettings() {
  const m = useMessages()
  const [preference, setPreference] = useState<AppearancePreference>(readAppearancePreference)

  useEffect(() => {
    const synchronize = (event: Event) => {
      const changed = event as CustomEvent<AppearancePreference>
      setPreference(changed.detail)
    }
    window.addEventListener(APPEARANCE_CHANGE_EVENT, synchronize)
    return () => window.removeEventListener(APPEARANCE_CHANGE_EVENT, synchronize)
  }, [])

  return (
    <div className="appearance-settings-card">
      <div className="appearance-options" role="radiogroup" aria-label={m.settings.appearance.group}>
        {OPTIONS.map((option) => (
          <button
            type="button" role="radio" aria-checked={preference === option}
            className="appearance-choice" data-appearance={option} key={option}
            onClick={() => setAppearancePreference(option)}
          >
            <AppearancePreview preference={option} />
            <span className="appearance-label">{m.settings.appearance[OPTION_LABEL[option]]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
