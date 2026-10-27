import { useEffect, useState } from 'react'
import type { SemanticKeyCheckResult, SemanticKeyStatus } from '../../../shared/contract.js'
import { delivery, papers } from '../../ipc.js'
import { useScreenLoad } from '../../hooks/useScreenLoad.js'
import { errorLabel } from '../../lib/failure-label.js'
import { useMessages } from '../../messages/useMessages.js'
import { useJump, useNotice, useSettingsOpen, useVaultRevision } from '../../shell/AppShell.js'
import { EntityLink } from '../EntityLink.js'
import { FieldRow, FieldRows, FormInput } from '../FormControls.js'
import { PageError } from '../PageShell.js'
import {
  ServiceActions, ServiceCard, ServiceClearKeyButton, ServiceConnectionStatus, ServiceError,
  ServiceFoot, ServiceSavedKey, ServiceStatus,
} from './ServiceCard.js'
import { Button } from '../Button.js'
import { CommitActions } from '../CommitActions.js'

const APPLY_URL = 'https://www.semanticscholar.org/product/api#api-key-form'

type ConnectionCheckState = { state: 'idle' | 'testing' } | SemanticKeyCheckResult

/**
 * The optional Semantic Scholar API key: shown masked once saved, replaced or removed on request.
 * While a key is saved, it also fills the papers' publication info from Semantic Scholar.
 */
export function SemanticKeySettings() {
  const m = useMessages()
  const copy = m.settings.research.semanticKey
  const [status, setStatus] = useState<SemanticKeyStatus | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [clearPending, setClearPending] = useState(false)
  const [saving, setSaving] = useState(false)
  // Whether the last save succeeded; Save shows its check as it turns true.
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [connectionCheck, setConnectionCheck] = useState<ConnectionCheckState>({ state: 'idle' })
  const [filling, setFilling] = useState(false)
  const [fillError, setFillError] = useState<string | null>(null)
  const { error, load } = useScreenLoad()
  const notice = useNotice()
  const { enter } = useJump()
  const { setOpen } = useSettingsOpen()
  const { bump } = useVaultRevision()

  useEffect(() => load('status', delivery.semanticKey(), setStatus), [load])

  useEffect(() => {
    setConnectionCheck({ state: 'idle' })
  }, [draft, clearPending])

  const save = async () => {
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    try {
      const next = await delivery.setSemanticKey(clearPending ? null : draft)
      setSaved(true)
      setStatus(next)
      setDraft('')
      setEditing(false)
      setClearPending(false)
      setConnectionCheck({ state: 'idle' })
    } catch (caught) {
      setSaveError(errorLabel(m, caught))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Fills the papers' publication venue, with its year, from Semantic Scholar and says how many changed; each
   * changed paper is one entry of Recent changes, which the notice opens.
   */
  const fillPublication = async () => {
    setFilling(true)
    setFillError(null)
    try {
      const result = await papers.fillPublication()
      bump()
      if (result.updated === 0) notice.success(m.papers.publication.none)
      else {
        notice.success(m.papers.publication.filled(result.updated), {
          label: m.common.open,
          onAction: () => {
            setOpen(false)
            enter('changelog')
          },
        })
      }
    } catch (caught) {
      setFillError(errorLabel(m, caught))
    } finally {
      setFilling(false)
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

  if (status === null) return <PageError variant="section" error={error} />

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
        description={<EntityLink kind="external" label={copy.apply} href={APPLY_URL} />}
        configured={status.configured}
        configuredLabel={m.settings.model.configured}
        notConfiguredLabel={m.settings.model.notConfigured}
      />
      <FieldRows>
        <FieldRow label={m.settings.model.fields.apiKeyLabel}>
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
        </FieldRow>
      </FieldRows>
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
          {status.configured ? (
            <Button
              size="regular" busy={filling} busyLabel={m.papers.publication.filling}
              onClick={() => { void fillPublication() }}
            >{m.papers.publication.fill}</Button>
          ) : null}
          <Button
            size="regular" disabled={!canTestConnection || saving}
            busy={connectionCheck.state === 'testing'} busyLabel={m.settings.model.connection.testing}
            onClick={() => { void testConnection() }}
          >{m.settings.model.connection.action}</Button>
          <CommitActions
            place="foot" saving={saving} canSave={canSave} done={saved} saveLabel={m.settings.model.save}
            busyLabel={m.settings.model.saving}
            onSave={() => { void save() }}
          />
        </ServiceActions>
      </ServiceFoot>
      {saveError === null ? null : <ServiceError>{saveError}</ServiceError>}
      {fillError === null ? null : <ServiceError>{fillError}</ServiceError>}
    </ServiceCard>
  )
}
