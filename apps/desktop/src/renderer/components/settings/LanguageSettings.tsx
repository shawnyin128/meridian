import { FormSelect } from '../FormControls.js'
import { useLocale, useMessages } from '../../messages/useMessages.js'
import { setLanguagePreference, type Locale } from '../../shell/language.js'

const LANGUAGES: readonly Locale[] = ['zh', 'en']

/** Device-local language selector; it changes only interface copy and never touches library data. */
export function LanguageSettings() {
  const m = useMessages()
  const locale = useLocale()

  return (
    <div className="language-settings-card">
      <FormSelect
        appearance="field" className="language-select" aria-label={m.settings.language.group}
        value={locale} onChange={(event) => setLanguagePreference(event.target.value as Locale)}
      >
        {LANGUAGES.map((value) => <option key={value} value={value}>{m.settings.language[value]}</option>)}
      </FormSelect>
      <p className="language-note">{m.settings.language.note}</p>
    </div>
  )
}
