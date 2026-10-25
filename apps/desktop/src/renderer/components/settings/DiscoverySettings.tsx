import { Fragment, useEffect, useState } from 'react'
import type { DiscoveryFetchResult, DiscoveryIntentAction, DiscoveryProfile } from '../../../shared/contract.js'
import { discovery } from '../../ipc.js'
import { useScreenLoad } from '../../hooks/useScreenLoad.js'
import type { Catalog } from '../../messages/catalog.js'
import { useMessages } from '../../messages/useMessages.js'
import { useNotice, useVaultRevision } from '../../shell/AppShell.js'
import { EmptyState } from '../EmptyState.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { PageError, SectionHeading } from '../PageShell.js'
import { PaperText } from '../paper/PaperText.js'
import { Switch } from '../Switch.js'
import { Tag } from '../Tag.js'
import { Group, GroupedList } from '../GroupedList.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { FadeText } from '../FadeText.js'
import { plainTitle } from '../paper/paper-text.js'
import { Button } from '../Button.js'

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
  const { error, load, report } = useScreenLoad()
  const notice = useNotice()
  const { revision, bump } = useVaultRevision()

  useEffect(() => load('profiles', discovery.profiles(), setProfiles), [load, revision])

  const update = (projectId: string, intentId: string, action: DiscoveryIntentAction) => {
    setBusy((held) => new Set([...held, intentId]))
    void discovery.setIntent(projectId, intentId, action).then(() => {
      load('profiles', discovery.profiles(), setProfiles)
      notice.success(action === 'set-core' ? m.settings.discovery.setCore
        : action === 'disable' ? m.settings.discovery.disabled : m.settings.discovery.enabled)
    }).catch(report).finally(() => {
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
    }).catch(report).finally(() => setRefreshing(null))
  }

  const enabled = (profiles ?? []).reduce((total, profile) => total + profile.intentCount, 0)
  return (
    <section className="delivery-directions">
      <SectionHeading count={enabled}>{m.settings.discovery.directionsHeading}</SectionHeading>
      <PageError error={error} variant="section" />
      {profiles === null && error === null ? <LoadingPlaceholder shape="rows" count={2} /> : null}
      {profiles?.length === 0 ? <EmptyState variant="section">{m.settings.discovery.noDirections}</EmptyState> : null}
      <GroupedList>
        {(profiles ?? []).map((profile) => (
          <Group
            key={profile.id} title={profile.name} meta={m.settings.discovery.seeds(profile.seedCount + profile.positiveCount)}
            actions={(
              <Button
                size="compact" variant="ghost" disabled={refreshing !== null || profile.intentCount === 0}
                busy={refreshing === profile.id} busyLabel={m.settings.discovery.refreshing}
                onClick={() => refresh(profile.id)}
              >{m.settings.discovery.refreshProject}</Button>
            )}
          >
            {profile.intents.length === 0 ? (
              <EmptyState variant="section">{m.settings.discovery.needsArxiv}</EmptyState>
            ) : (
              <StructuredList>
                {profile.intents.map((intent) => (
                  <StructuredRow key={intent.id}>
                    <div className={`direction-row${intent.enabled ? '' : ' disabled'}`}>
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
                          <Button
                            size="compact" variant="ghost" disabled={busy.has(intent.id)}
                            onClick={() => update(profile.id, intent.id, 'set-core')}
                          >{m.settings.discovery.setCoreAction}</Button>
                        ) : null}
                        <Switch
                          label={intent.label} checked={intent.enabled} disabled={busy.has(intent.id)}
                          onChange={(on) => update(profile.id, intent.id, on ? 'enable' : 'disable')}
                        />
                      </div>
                    </div>
                  </StructuredRow>
                ))}
              </StructuredList>
            )}
          </Group>
        ))}
      </GroupedList>
    </section>
  )
}
