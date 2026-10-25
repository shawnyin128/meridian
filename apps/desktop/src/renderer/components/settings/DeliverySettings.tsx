import { useEffect, useState } from 'react'
import type { DeliverySettings as DeliverySettingsValue } from '../../../shared/contract.js'
import { DEFAULT_DELIVERY_SETTINGS } from '../../../shared/contract.js'
import { delivery } from '../../ipc.js'
import { useMessages } from '../../messages/useMessages.js'
import { useScreenLoad } from '../../hooks/useScreenLoad.js'
import { useVaultWrite } from '../../hooks/useVaultWrite.js'
import { composing } from '../../lib/keyboard.js'
import { FormInput } from '../FormControls.js'
import { Card } from '../Card.js'
import { InlineMessage } from '../InlineMessage.js'
import { ServiceActions, ServiceFoot } from './ServiceCard.js'
import { CommitActions } from '../CommitActions.js'

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
  const { error: loadingError, load } = useScreenLoad()
  const [saving, setSaving] = useState(false)
  // Whether the last save succeeded with no field changed since; Save shows its check as it turns true.
  const [justSaved, setJustSaved] = useState(false)
  const write = useVaultWrite()

  useEffect(() => load('settings', delivery.settings(), (settings) => {
    const held = { ...DEFAULT_DELIVERY_SETTINGS, ...settings }
    setSaved(held)
    setDrafts({ maxItemsPerRun: String(held.maxItemsPerRun), maxShownPerScope: String(held.maxShownPerScope) })
  }), [load])

  const amounts = { maxItemsPerRun: Number(drafts.maxItemsPerRun), maxShownPerScope: Number(drafts.maxShownPerScope) }
  const inRange = (amount: number) => Number.isInteger(amount) && amount >= MIN_ITEMS && amount <= MAX_ITEMS
  const valid = LIMITS.every((limit) => inRange(amounts[limit]))
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
            aria-invalid={inRange(amounts[limit]) ? undefined : true}
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
      {loadingError === null
        ? null : <InlineMessage tone="error" variant="line" className="delivery-setting-error">{loadingError}</InlineMessage>}
      <ServiceFoot>
        <ServiceActions>
          <CommitActions
            place="foot" saving={saving} canSave={changed} done={justSaved} busyLabel={m.settings.delivery.saving}
            onSave={() => { void save() }}
          />
        </ServiceActions>
      </ServiceFoot>
    </Card>
  )
}
