import { useEffect, useState } from 'react'
import type { DeliverySettings as DeliverySettingsValue } from '../../../shared/contract.js'
import { DEFAULT_DELIVERY_SETTINGS } from '../../../shared/contract.js'
import { delivery } from '../../ipc.js'
import { useMessages } from '../../messages/useMessages.js'
import { useVaultWrite } from '../../hooks/useVaultWrite.js'
import { FormInput } from '../FormControls.js'

const MIN_ITEMS = 1
const MAX_ITEMS = 100

/** Follow the push configuration shared with Discovery; this is edit only, runtime caps are enforced by Core. */
export function DeliverySettings() {
  const m = useMessages()
  const [saved, setSaved] = useState<DeliverySettingsValue | null>(null)
  const [draft, setDraft] = useState(String(DEFAULT_DELIVERY_SETTINGS.maxItemsPerRun))
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const write = useVaultWrite()

  useEffect(() => {
    let active = true
    void delivery.settings().then((settings) => {
      if (!active) return
      setSaved(settings)
      setDraft(String(settings.maxItemsPerRun))
      setLoadingError(null)
    }).catch((error: Error) => {
      if (active) setLoadingError(error.message)
    })
    return () => { active = false }
  }, [])

  const amount = Number(draft)
  const valid = Number.isInteger(amount) && amount >= MIN_ITEMS && amount <= MAX_ITEMS
  const changed = valid && saved !== null && amount !== saved.maxItemsPerRun

  const save = async () => {
    if (!changed) return
    const next = { maxItemsPerRun: amount }
    setSaving(true)
    const ok = await write(delivery.updateSettings(next), { note: m.settings.delivery.saved })
    if (ok) setSaved(next)
    setSaving(false)
  }

  return (
    <div className="delivery-settings-card">
      <div className="delivery-setting-copy">
        <strong>{m.settings.delivery.limitHeading}</strong>
        <p>{m.settings.delivery.limitNote}</p>
      </div>
      <div className="delivery-setting-control">
        <FormInput
          appearance="field"
          aria-label={m.settings.delivery.limitHeading} type="number" min={MIN_ITEMS} max={MAX_ITEMS}
          value={draft} disabled={saved === null || saving}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save()
          }}
        />
        <span>{m.settings.delivery.unit}</span>
        <button className="btn pri" disabled={!changed || saving} onClick={() => { void save() }}>
          {saving ? m.settings.delivery.saving : m.common.save}
        </button>
      </div>
      {!valid && saved !== null
        ? <p className="delivery-setting-error">{m.settings.delivery.rangeError(MIN_ITEMS, MAX_ITEMS)}</p>
        : null}
      {loadingError === null ? null : <p className="delivery-setting-error">{loadingError}</p>}
    </div>
  )
}
