import { useEffect, useRef, useState } from 'react'
import { useCandidateKeys } from '../../hooks/useCandidateKeys.js'
import { commitKeys } from '../../lib/keyboard.js'
import { useMessages } from '../../messages/useMessages.js'
import { CandidateField } from '../CandidateField.js'
import { FormInput } from '../FormControls.js'

/**
 * The model field of a subscription CLI, on CandidateField: the text is the model, empty for the
 * CLI's own default. While it has focus it lists the default and `models`, every one until something is
 * typed and then those that contain the text, the model checked, and a create row for a typed name
 * none of them is. It opens on the model's row; a click or Enter on a row sets the model and closes
 * the list, and Escape or focus leaving closes it.
 */
export function SubscriptionModelField({ value, models, onChange }: {
  value: string
  models: readonly string[]
  onChange: (model: string) => void
}) {
  const m = useMessages()
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  // Whether the text was typed since the list opened, so the list shows only what contains it.
  const [filtering, setFiltering] = useState(false)
  const typed = value.trim()
  const names = filtering ? models.filter((name) => name.toLowerCase().includes(typed.toLowerCase())) : models
  const rows = !filtering || typed === '' ? ['', ...names] : names
  const isNew = filtering && typed !== '' && !models.includes(typed)
  const choose = (model: string) => {
    onChange(model)
    setOpen(false)
  }
  const keys = useCandidateKeys(rows.length + (isNew ? 1 : 0), (index) => choose(rows[index] ?? typed))
  const { pointAt } = keys
  // Runs after the keys reset to the first row for a new count, so the list opens on the model's row.
  useEffect(() => {
    if (open && !filtering) pointAt(Math.max(0, rows.indexOf(typed)))
  }, [open, filtering])

  return (
    <CandidateField
      anchorRef={input} keys={keys}
      field={(
        <FormInput
          appearance="field" ref={input} aria-label={m.settings.model.fields.modelIdAria} value={value}
          placeholder={m.settings.model.subscription.defaultModel} autoComplete="off" spellCheck={false}
          onFocus={() => {
            setOpen(true)
            setFiltering(false)
          }}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            onChange(event.target.value)
            setOpen(true)
            setFiltering(true)
          }}
          onKeyDown={(event) => {
            if (!open) return
            keys.onKeyDown(event)
            commitKeys({ onCancel: () => setOpen(false) })(event)
          }}
        />
      )}
      candidates={open ? rows.map((model) => ({
        id: model, label: model === '' ? m.settings.model.subscription.defaultModel : model, checked: model === typed,
      })) : []}
      onPick={(candidate) => choose(candidate.id)}
      create={open && isNew ? { text: typed, label: m.settings.model.subscription.otherModel(typed), onCreate: () => choose(typed) } : undefined}
    />
  )
}
