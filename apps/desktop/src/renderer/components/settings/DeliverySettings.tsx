import { useEffect, useState } from 'react'
import type { DeliverySettings as DeliverySettingsValue } from '../../../shared/contract.js'
import { DEFAULT_DELIVERY_SETTINGS } from '../../../shared/contract.js'
import { delivery } from '../../ipc.js'
import { errorLabel } from '../../lib/failure-label.js'
import { useMessages } from '../../messages/useMessages.js'
import { useVaultWrite } from '../../hooks/useVaultWrite.js'
import { composing } from '../../lib/keyboard.js'
import { FormInput } from '../FormControls.js'
import { Card } from '../Card.js'
import { ServiceActions, ServiceFoot } from './ServiceCard.js'

const MIN_ITEMS = 1
const MAX_ITEMS = 100

/** The limits this card edits, in the order it shows them. */
const LIMITS = ['maxItemsPerRun', 'maxShownPerScope'] as const

type Limit = (typeof LIMITS)[number]

/** Delivery settings shared by watches and Discovery; this only edits them, Core enforces caps at run time. */
export function DeliverySettings() {
  const m = useMessages()
  const [saved, setSaved] = useState<Required<DeliverySettingsValue> | null>(null)
  const [drafts, setDrafts] = useState<Record<Limit, string>>({
    maxItemsPerRun: String(DEFAULT_DELIVERY_SETTINGS.maxItemsPerRun),
    maxShownPerScope: String(DEFAULT_DELIVERY_SETTINGS.maxShownPerScope),
  })
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // After a save the button says so in place, until a field changes again.
  const [justSaved, setJustSaved] = useState(false)
  const write = useVaultWrite()

  useEffect(() => {
    let active = true
    void delivery.settings().then((settings) => {
      if (!active) return
      const held = { ...DEFAULT_DELIVERY_SETTINGS, ...settings }
      setSaved(held)
      setDrafts({ maxItemsPerRun: String(held.maxItemsPerRun), maxShownPerScope: String(held.maxShownPerScope) })
      setLoadingError(null)
    }).catch((error: unknown) => {
      if (active) setLoadingError(errorLabel(m, error))
    })
    return () => { active = false }
  }, [m])

  const amounts = { maxItemsPerRun: Number(drafts.maxItemsPerRun), maxShownPerScope: Number(drafts.maxShownPerScope) }
  const valid = LIMITS.every((limit) => (
    Number.isInteger(amounts[limit]) && amounts[limit] >= MIN_ITEMS && amounts[limit] <= MAX_ITEMS
  ))
  const changed = valid && saved !== null && LIMITS.some((limit) => amounts[limit] !== saved[limit])

  const save = async () => {
    if (!changed) return
    const next = { ...amounts }
    setSaving(true)
    const ok = await write(delivery.updateSettings(next))
    if (ok) setSaved(next)
    setJustSaved(ok)
    setSaving(false)
  }

  const heading: Record<Limit, string> = {
    maxItemsPerRun: m.settings.delivery.limitHeading, maxShownPerScope: m.settings.delivery.shownHeading,
  }

  return (
    <Card className="delivery-settings-card">
      {LIMITS.map((limit) => [
        <div key={`${limit}-copy`} className="delivery-setting-copy">
          <strong>{heading[limit]}</strong>
        </div>,
        <div key={`${limit}-control`} className="delivery-setting-control">
          <FormInput
            appearance="field"
            aria-label={heading[limit]} type="number" min={MIN_ITEMS} max={MAX_ITEMS}
            value={drafts[limit]} disabled={saved === null || saving}
            onChange={(event) => {
              const value = event.currentTarget.value
              setDrafts((held) => ({ ...held, [limit]: value }))
              setJustSaved(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !composing(event.nativeEvent)) void save()
            }}
          />
          <span>{m.settings.delivery.unit}</span>
        </div>,
      ])}
      {!valid && saved !== null
        ? <p className="delivery-setting-error">{m.settings.delivery.rangeError(MIN_ITEMS, MAX_ITEMS)}</p>
        : null}
      {loadingError === null ? null : <p className="delivery-setting-error">{loadingError}</p>}
      <ServiceFoot>
        <ServiceActions>
          <button className="btn pri" disabled={!changed || saving} onClick={() => { void save() }}>
            {saving ? m.settings.delivery.saving : justSaved ? m.common.saved : m.common.save}
          </button>
        </ServiceActions>
      </ServiceFoot>
    </Card>
  )
}
