import { useCallback, useEffect, useState } from 'react'
import type { DiscoveryFetchResult, DiscoveryIntentAction, DiscoveryProfile } from '../../../shared/contract.js'
import { discovery } from '../../ipc.js'
import type { Catalog } from '../../messages/catalog.js'
import { useMessages } from '../../messages/useMessages.js'
import { useToast, useVaultRevision } from '../../shell/AppShell.js'
import { SectionHeading } from '../PageShell.js'

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

/** The discovery direction is the only configuration page; the gear on the discovery page is only responsible for opening the settings, and no longer draws a separate editor. */
export function DiscoverySettings() {
  const m = useMessages()
  const [profiles, setProfiles] = useState<DiscoveryProfile[]>([])
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const { revision, bump } = useVaultRevision()
  const load = useCallback(() => {
    void discovery.profiles().then(setProfiles).catch((caught: Error) => setError(caught.message))
  }, [])

  useEffect(load, [load, revision])

  const update = (projectId: string, intentId: string, action: DiscoveryIntentAction) => {
    setBusy((held) => new Set([...held, intentId]))
    void discovery.setIntent(projectId, intentId, action).then(() => {
      load()
      toast(action === 'set-core' ? m.settings.discovery.setCore
        : action === 'disable' ? m.settings.discovery.disabled : m.settings.discovery.enabled)
    }).catch((caught: Error) => setError(caught.message)).finally(() => {
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
      toast(resultNote(result, m))
      bump()
    }).catch((caught: Error) => setError(caught.message)).finally(() => setRefreshing(null))
  }

  const enabled = profiles.reduce((total, profile) => total + profile.intentCount, 0)
  return (
    <section className="delivery-directions">
      <SectionHeading variant="group">
        {m.settings.discovery.directionsHeading} <span className="settings-count">{enabled}</span>
      </SectionHeading>
      <p className="settings-explain">{m.settings.discovery.explain}</p>
      {error === null ? null : <div className="err">{error}</div>}
      <div className="direction-panel">
        {profiles.length === 0 ? <p className="direction-empty">{m.settings.discovery.noDirections}</p> : null}
        {profiles.map((profile) => (
          <section className="direction-project" key={profile.id}>
            <header>
              <strong>{profile.name}</strong>
              <span>{m.settings.discovery.seeds(profile.seedCount + profile.positiveCount)}</span>
              <button
                className="btn plain" disabled={refreshing !== null || profile.intentCount === 0}
                onClick={() => refresh(profile.id)}
              >{refreshing === profile.id
                ? m.settings.discovery.refreshing : m.settings.discovery.refreshProject}</button>
            </header>
            {profile.intents.length === 0 ? (
              <p className="direction-empty">{m.settings.discovery.needsArxiv}</p>
            ) : profile.intents.map((intent) => (
              <div className={`direction-row${intent.enabled ? '' : ' disabled'}`} key={intent.id}>
                <div className="direction-main">
                  <div className="direction-name">
                    {intent.core ? <span className="direction-core">{m.settings.discovery.core}</span> : null}
                    <span>{intent.label}</span>
                  </div>
                  <div className="direction-seeds">{intent.seeds.map((seed) => seed.title).join(' · ')}</div>
                </div>
                <div className="direction-actions">
                  {!intent.core && intent.enabled ? (
                    <button
                      className="btn plain" disabled={busy.has(intent.id)}
                      onClick={() => update(profile.id, intent.id, 'set-core')}
                    >{m.settings.discovery.setCoreAction}</button>
                  ) : null}
                  <button
                    className="btn plain" disabled={busy.has(intent.id)}
                    onClick={() => update(profile.id, intent.id, intent.enabled ? 'disable' : 'enable')}
                  >{intent.enabled ? m.settings.discovery.close : m.settings.discovery.enable}</button>
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </section>
  )
}
