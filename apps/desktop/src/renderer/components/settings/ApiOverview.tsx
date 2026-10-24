import { useEffect, useState } from 'react'
import type { HarnessModelSettings, SemanticKeyStatus } from '../../../shared/contract.js'
import { delivery, harness } from '../../ipc.js'
import { errorLabel } from '../../lib/failure-label.js'
import { useMessages } from '../../messages/useMessages.js'
import { PageError } from '../PageShell.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { FadeText } from '../FadeText.js'
import './ApiOverview.css'

/** The API category's summary: which model and which scholarly source Meridian uses now, each opening its own page. */
export function ApiOverview({ onOpen }: { onOpen: (category: 'model' | 'research') => void }) {
  const m = useMessages()
  const copy = m.settings.api
  const [model, setModel] = useState<HarnessModelSettings | null>(null)
  const [semanticKey, setSemanticKey] = useState<SemanticKeyStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void harness.modelSettings().then(setModel).catch((e: unknown) => setError(errorLabel(m, e)))
    void delivery.semanticKey().then(setSemanticKey).catch((e: unknown) => setError(errorLabel(m, e)))
  }, [m])

  const modelState = model === null
    ? m.common.reading
    : model.configured
      ? copy.modelSet(m.settings.model.providers[model.provider].label, model.model)
      : copy.modelUnset
  const researchState = semanticKey === null
    ? m.common.reading
    : semanticKey.configured ? 'Semantic Scholar' : copy.researchUnset
  const rows = [
    { key: 'model' as const, name: copy.model, state: modelState },
    { key: 'research' as const, name: copy.research, state: researchState },
  ]

  return (
    <>
      <PageError error={error} />
      <StructuredList className="wlist">
        {rows.map((row) => (
          <StructuredRow composite className="wrow" data-api={row.key} key={row.key} onActivate={() => onOpen(row.key)}>
            <span className="nm">{row.name}</span>
            <FadeText className="api-state">{row.state}</FadeText>
            <button className="btn ghost sm" onClick={(event) => { event.stopPropagation(); onOpen(row.key) }}>{copy.open}</button>
          </StructuredRow>
        ))}
      </StructuredList>
    </>
  )
}
