import { ChoicePicker } from '../FieldPickers.js'
import { useLocale, useMessages } from '../../messages/useMessages.js'
import { setLanguagePreference, type Locale } from '../../shell/language.js'

const LANGUAGES: readonly Locale[] = ['zh', 'en']

/** Device-local language selector; it changes only interface copy and never touches library data. */
export function LanguageSettings() {
  const m = useMessages()
  const locale = useLocale()

  return (
    <div className="language-settings-card">
      <ChoicePicker
        appearance="field" className="language-select" aria-label={m.settings.language.group}
        value={locale} options={LANGUAGES} label={(value) => m.settings.language[value]}
        onPick={setLanguagePreference}
      />
      <p className="language-note">{m.settings.language.note}</p>
    </div>
  )
}
