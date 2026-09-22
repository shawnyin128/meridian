import { useEffect, useState } from 'react'
import type { SemanticKeyStatus } from '../../../shared/contract.js'
import { delivery } from '../../ipc.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormButton, FormInput } from '../FormControls.js'
import { SectionHeading } from '../PageShell.js'
import './SemanticKeySettings.css'

const APPLY_URL = 'https://www.semanticscholar.org/product/api#api-key-form'

/** The optional Semantic Scholar API key: shown masked once saved, replaced or removed on request. */
export function SemanticKeySettings() {
  const m = useMessages()
  const copy = m.settings.research.semanticKey
  const [status, setStatus] = useState<SemanticKeyStatus | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void delivery.semanticKey().then(setStatus).catch((e: Error) => setError(e.message))
  }, [])

  const save = (apiKey: string | null) => {
    setBusy(true)
    setError(null)
    void delivery.setSemanticKey(apiKey)
      .then((next) => {
        setStatus(next)
        setDraft('')
        setEditing(false)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false))
  }

  if (status === null) return null
  const showingSaved = status.configured && !editing
  return (
    <section className="semantic-key" data-semantic-key={status.configured ? 'saved' : 'empty'}>
      <SectionHeading variant="group">{copy.heading}</SectionHeading>
      <p className="settings-explain">
        {copy.explain}{' '}
        <a href={APPLY_URL} target="_blank" rel="noreferrer">{copy.apply}</a>
      </p>
      <p className="settings-explain" data-semantic-active>{copy.active(status.configured)}</p>
      {error === null ? null : <div className="err">{error}</div>}
      <div className="semantic-key-row">
        {showingSaved ? (
          <>
            <FormButton appearance="field" className="semantic-key-saved" aria-label={copy.stored(status.lastFour ?? '')}
              onClick={() => setEditing(true)}>
              <span aria-hidden="true">••••••••</span>
              <span className="semantic-key-tail">{status.lastFour}</span>
            </FormButton>
            <button className="btn" disabled={busy} onClick={() => setEditing(true)}>{copy.replace}</button>
            <button className="btn tdel" disabled={busy} onClick={() => save(null)}>{copy.remove}</button>
          </>
        ) : (
          <>
            <FormInput appearance="field" type="password" aria-label={copy.inputLabel} placeholder={copy.placeholder}
              autoComplete="new-password" spellCheck={false} value={draft} autoFocus={editing}
              onChange={(event) => setDraft(event.target.value)} />
            <button className="btn pri" disabled={busy || draft.trim() === ''} onClick={() => save(draft)}>
              {copy.save}
            </button>
            {editing ? <button className="btn" disabled={busy} onClick={() => setEditing(false)}>{m.common.cancel}</button> : null}
          </>
        )}
      </div>
    </section>
  )
}
