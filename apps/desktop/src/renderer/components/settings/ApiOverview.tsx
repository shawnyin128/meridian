import { useEffect, useState } from 'react'
import type { HarnessModelSettings, SemanticKeyStatus } from '../../../shared/contract.js'
import { delivery, harness } from '../../ipc.js'
import { useScreenLoad } from '../../hooks/useScreenLoad.js'
import { useMessages } from '../../messages/useMessages.js'
import { PageError } from '../PageShell.js'
import { Item } from '../Item.js'
import { List } from '../List.js'
import { FadeText } from '../FadeText.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { Button } from '../Button.js'

/** The API category's summary: which model and which scholarly source Meridian uses now, each opening its own page. */
export function ApiOverview({ onOpen }: { onOpen: (category: 'model' | 'research') => void }) {
  const m = useMessages()
  const copy = m.settings.api
  const [model, setModel] = useState<HarnessModelSettings | null>(null)
  const [semanticKey, setSemanticKey] = useState<SemanticKeyStatus | null>(null)
  const { error, failure, load } = useScreenLoad()

  useEffect(() => load('model', harness.modelSettings(), setModel), [load])
  useEffect(() => load('semanticKey', delivery.semanticKey(), setSemanticKey), [load])

  // The default model, while it can run as set up.
  const running = model === null ? undefined : model.models.find((entry) => entry.id === model.defaultModel && entry.configured)
  const modelState = model === null
    ? null
    : running === undefined
      ? copy.modelUnset
      : running.source.kind === 'cli'
        ? running.model === ''
          ? m.settings.model.subscriptions[running.source.cli].label
          : copy.modelSet(m.settings.model.subscriptions[running.source.cli].label, running.model)
        : copy.modelSet(
          m.settings.model.providers[model.sources.find((group) => group.entries.includes(running.id))!.provider!].label, running.model,
        )
  const researchState = semanticKey === null
    ? null
    : semanticKey.configured ? 'Semantic Scholar' : copy.researchUnset
  const rows = [
    { key: 'model' as const, name: copy.model, state: modelState },
    { key: 'research' as const, name: copy.research, state: researchState },
  ]

  return (
    <>
      <PageError error={error} variant="section" />
      <List className="wlist">
        {rows.map((row) => (
          <Item
            composite className="wrow" data-api={row.key} key={row.key} onActivate={() => onOpen(row.key)}
            title={<span className="nm">{row.name}</span>} meta={row.state === null
              ? (failure(row.key) === null ? <LoadingPlaceholder shape="lines" count={1} className="api-state" /> : null)
              : <FadeText className="api-state">{row.state}</FadeText>}
            trailing={<Button size="compact" variant="ghost" onClick={(event) => { event.stopPropagation(); onOpen(row.key) }}>{copy.open}</Button>}
          />
        ))}
      </List>
    </>
  )
}
