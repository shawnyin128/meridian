import { Fragment, useCallback, useEffect, useState } from 'react'
import type { DiscoveryFetchResult, DiscoveryIntentAction, DiscoveryProfile } from '../../../shared/contract.js'
import { discovery } from '../../ipc.js'
import { errorLabel } from '../../lib/failure-label.js'
import type { Catalog } from '../../messages/catalog.js'
import { useMessages } from '../../messages/useMessages.js'
import { useNotice, useVaultRevision } from '../../shell/AppShell.js'
import { EmptyState } from '../EmptyState.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { PageError, SectionHeading } from '../PageShell.js'
import { PaperText } from '../paper/PaperText.js'
import { Switch } from '../Switch.js'
import { Tag } from '../Tag.js'
import { Card } from '../Card.js'
import { FadeText } from '../FadeText.js'
import { plainTitle } from '../paper/paper-text.js'

function resultNote(result: DiscoveryFetchResult, m: Catalog): string {
  const parts = [
    result.added === 0 ? m.settings.discovery.noNewPapers : m.settings.discovery.newFound(result.added),
    m.settings.discovery.requested(result.intents),
  ]
  if (result.cachedIntents > 0) parts.push(m.settings.discovery.cooling(result.cachedIntents))
  if (result.failedIntents > 0) parts.push(m.settings.discovery.failed(result.failedIntents))
  if (result.deferredProjects > 0) parts.push(m.settings.discovery.deferred(result.deferredProjects))
  return parts.join(' · ')
}

/** The only editor of research directions; the gear on the Discovery page just opens these settings. */
export function DiscoverySettings() {
  const m = useMessages()
  const [profiles, setProfiles] = useState<DiscoveryProfile[] | null>(null)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const notice = useNotice()
  const { revision, bump } = useVaultRevision()
  const load = useCallback(() => {
    void discovery.profiles().then(setProfiles).catch((caught: unknown) => setError(errorLabel(m, caught)))
  }, [m])

  useEffect(load, [load, revision])

  const update = (projectId: string, intentId: string, action: DiscoveryIntentAction) => {
    setBusy((held) => new Set([...held, intentId]))
    void discovery.setIntent(projectId, intentId, action).then(() => {
      load()
      notice.success(action === 'set-core' ? m.settings.discovery.setCore
        : action === 'disable' ? m.settings.discovery.disabled : m.settings.discovery.enabled)
    }).catch((caught: unknown) => setError(errorLabel(m, caught))).finally(() => {
      setBusy((held) => {
        const next = new Set(held)
        next.delete(intentId)
        return next
      })
    })
  }

  const refresh = (projectId: string) => {
    setRefreshing(projectId)
    void discovery.fetch(projectId, true).then((result) => {
      notice.success(resultNote(result, m))
      bump()
    }).catch((caught: unknown) => setError(errorLabel(m, caught))).finally(() => setRefreshing(null))
  }

  const enabled = (profiles ?? []).reduce((total, profile) => total + profile.intentCount, 0)
  return (
    <section className="delivery-directions">
      <SectionHeading variant="group">
        {m.settings.discovery.directionsHeading(enabled)}
      </SectionHeading>
      <PageError error={error} variant="section" />
      <Card flush className="direction-panel">
        {profiles === null && error === null ? <LoadingPlaceholder shape="rows" count={2} /> : null}
        {profiles?.length === 0 ? <EmptyState variant="section">{m.settings.discovery.noDirections}</EmptyState> : null}
        {(profiles ?? []).map((profile) => (
          <section className="direction-project" key={profile.id}>
            <header>
              <strong>{profile.name}</strong>
              <span>{m.settings.discovery.seeds(profile.seedCount + profile.positiveCount)}</span>
              <button
                className="btn ghost sm" disabled={refreshing !== null || profile.intentCount === 0}
                onClick={() => refresh(profile.id)}
              >{refreshing === profile.id
                ? m.settings.discovery.refreshing : m.settings.discovery.refreshProject}</button>
            </header>
            {profile.intents.length === 0 ? (
              <EmptyState variant="section">{m.settings.discovery.needsArxiv}</EmptyState>
            ) : profile.intents.map((intent) => (
              <div className={`direction-row${intent.enabled ? '' : ' disabled'}`} key={intent.id}>
                <div className="direction-main">
                  <div className="direction-name">
                    {intent.core ? <Tag tone="accent">{m.settings.discovery.core}</Tag> : null}
                    <span>{intent.label}</span>
                  </div>
                  <FadeText className="direction-seeds" label={intent.seeds.map((seed) => plainTitle(seed.title)).join(' · ')}>
                    {intent.seeds.map((seed, at) => (
                      <Fragment key={seed.id}>{at === 0 ? null : ' · '}<PaperText text={seed.title} /></Fragment>
                    ))}
                  </FadeText>
                </div>
                <div className="direction-actions">
                  {!intent.core && intent.enabled ? (
                    <button
                      className="btn ghost sm" disabled={busy.has(intent.id)}
                      onClick={() => update(profile.id, intent.id, 'set-core')}
                    >{m.settings.discovery.setCoreAction}</button>
                  ) : null}
                  <Switch
                    label={intent.label} checked={intent.enabled} disabled={busy.has(intent.id)}
                    onChange={(on) => update(profile.id, intent.id, on ? 'enable' : 'disable')}
                  />
                </div>
              </div>
            ))}
          </section>
        ))}
      </Card>
    </section>
  )
}
