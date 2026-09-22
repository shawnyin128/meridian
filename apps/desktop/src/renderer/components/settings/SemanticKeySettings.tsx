import { useEffect, useState } from 'react'
import type { SemanticKeyCheckResult, SemanticKeyStatus } from '../../../shared/contract.js'
import { delivery } from '../../ipc.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormInput } from '../FormControls.js'
import {
  ServiceActions, ServiceCard, ServiceClearKeyButton, ServiceConnectionStatus, ServiceError, ServiceField,
  ServiceFoot, ServiceSavedKey, ServiceStatus,
} from './ServiceCard.js'
import './SemanticKeySettings.css'

const APPLY_URL = 'https://www.semanticscholar.org/product/api#api-key-form'

type ConnectionCheckState = { state: 'idle' | 'testing' } | SemanticKeyCheckResult

/** The optional Semantic Scholar API key: shown masked once saved, replaced or removed on request. */
export function SemanticKeySettings() {
  const m = useMessages()
  const copy = m.settings.research.semanticKey
  const [status, setStatus] = useState<SemanticKeyStatus | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [clearPending, setClearPending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectionCheck, setConnectionCheck] = useState<ConnectionCheckState>({ state: 'idle' })

  useEffect(() => {
    void delivery.semanticKey().then(setStatus).catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    setConnectionCheck({ state: 'idle' })
  }, [draft, clearPending])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const next = await delivery.setSemanticKey(clearPending ? null : draft)
      setStatus(next)
      setDraft('')
      setEditing(false)
      setClearPending(false)
      setConnectionCheck({ state: 'idle' })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    setConnectionCheck({ state: 'testing' })
    try {
      setConnectionCheck(await delivery.checkSemanticKey())
    } catch {
      setConnectionCheck({ state: 'failed', reason: 'unknown', detail: copy.connection.unexpectedDetail })
    }
  }

  if (status === null) return null

  const showingSavedKey = status.configured && !editing && !clearPending
  const canTestConnection = status.configured && !clearPending && draft.trim() === ''
  const canSave = clearPending || draft.trim() !== ''
  const connectionMessage = connectionCheck.state === 'connected'
    ? copy.connection.connected
    : connectionCheck.state === 'failed'
      ? copy.connection.failures[connectionCheck.reason]
      : null

  return (
    <ServiceCard className="semantic-key-card">
      <ServiceStatus
        title={copy.heading}
        description={<>{copy.description} <a href={APPLY_URL} target="_blank" rel="noreferrer">{copy.apply}</a></>}
        configured={status.configured}
        configuredLabel={m.settings.model.configured}
        notConfiguredLabel={m.settings.model.notConfigured}
      />
      <ServiceField label={m.settings.model.fields.apiKeyLabel}>
        {showingSavedKey ? (
          <ServiceSavedKey
            ariaLabel={copy.stored(status.lastFour ?? '')}
            lastFour={status.lastFour}
            onClick={() => setEditing(true)}
          />
        ) : (
          <FormInput appearance="field" aria-label={copy.inputLabel} type="password"
            value={draft} autoFocus={editing}
            autoComplete="new-password" spellCheck={false}
            placeholder={copy.placeholder}
            onBlur={() => { if (draft === '') setEditing(false) }}
            onChange={(event) => {
              setDraft(event.target.value)
              setEditing(true)
              setClearPending(false)
            }} />
        )}
      </ServiceField>
      <ServiceFoot>
        {connectionMessage === null ? null : (
          <ServiceConnectionStatus
            state={connectionCheck.state === 'connected' ? 'connected' : 'failed'}
            message={connectionMessage}
            detail={connectionCheck.state === 'failed' ? connectionCheck.detail : undefined}
            detailLabel={m.settings.model.connection.detailLabel}
          />
        )}
        <ServiceActions>
          {status.configured ? (
            <ServiceClearKeyButton
              pending={clearPending}
              label={m.settings.model.clearKey}
              pendingLabel={m.settings.model.clearKeyPending}
              onClick={() => {
                setClearPending((current) => !current)
                setDraft('')
                setEditing(false)
              }}
            />
          ) : null}
          <button
            className="btn" disabled={!canTestConnection || saving || connectionCheck.state === 'testing'}
            title={canTestConnection ? undefined : copy.connection.saveFirst}
            onClick={() => { void testConnection() }}
          >
            {connectionCheck.state === 'testing' ? m.settings.model.connection.testing : m.settings.model.connection.action}
          </button>
          <button className="btn pri" disabled={saving || !canSave} onClick={() => { void save() }}>
            {saving ? m.settings.model.saving : m.settings.model.save}
          </button>
        </ServiceActions>
      </ServiceFoot>
      {error === null ? null : <ServiceError>{error}</ServiceError>}
    </ServiceCard>
  )
}
